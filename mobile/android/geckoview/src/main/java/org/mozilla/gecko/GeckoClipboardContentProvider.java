/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.gecko;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.mozilla.gecko.util.ThreadUtils;

/**
 * ContentProvider that serves the bytes Firefox published to the system clipboard via a
 * MIME-agnostic session model.
 *
 * <p>Android stores binary clipboard data as URI-backed {@link ClipData.Item}s, with the bytes
 * resolved through a {@link ContentProvider}. This class is that provider for Firefox-authored
 * payloads. URIs have the shape {@code content://AUTHORITY/<sessionId>/<itemIndex>}; the MIME the
 * URI serves is recorded alongside the bytes when the payload was added.
 *
 * <p>Sessions are an in-memory write-then-commit buffer used by {@link Clipboard}'s session-based
 * write API so the C++ side doesn't have to push a {@code byte[][]} across JNI in one go. When a
 * session is committed, its {@link ClipData} replaces the primary clip; the bytes stay in memory
 * until either (a) Firefox replaces the clip, in which case the session can be reaped, or (b) the
 * process dies, in which case the URIs become unresolvable for other apps.
 */
public final class GeckoClipboardContentProvider extends ContentProvider {
  private static final String LOGTAG = "GeckoClipboardCP";
  // The authority is derived per applicationId so Fenix and GVE (and any other
  // GeckoView-based package) can coexist on the same device without hitting
  // Android's "one authority per name across all installed apps" restriction.
  // Manifest side matches via `${applicationId}.clipboard`.
  private static final String AUTHORITY_SUFFIX = ".clipboard";

  private static String buildAuthority(final Context context) {
    return context.getPackageName() + AUTHORITY_SUFFIX;
  }

  /**
   * Drops any committed sessions whose URIs are no longer reachable via the system clipboard.
   * Called from {@link Clipboard}'s primary-clip-changed listener; if the current primary clip
   * isn't ours (another app wrote text, an image, etc.), the bytes we're holding are unreachable
   * and can be reaped to release memory.
   */
  /* package */ static void onPrimaryClipChanged(final Context context) {
    synchronized (sLock) {
      if (sCommittedSessions.isEmpty()) {
        return;
      }
      final ClipboardManager cm =
          (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
      ClipData clip = null;
      if (cm.hasPrimaryClip()) {
        try {
          clip = cm.getPrimaryClip();
        } catch (final RuntimeException e) {
          // Another app owned the clip but is now dead: our sessions are
          // unreachable regardless.
          Log.w(LOGTAG, "onPrimaryClipChanged: getPrimaryClip failed", e);
        }
      }
      final String ourAuthority = buildAuthority(context);
      if (clip == null || clip.getItemCount() == 0) {
        sCommittedSessions.clear();
        return;
      }
      final Uri firstUri = clip.getItemAt(0).getUri();
      if (firstUri == null || !ourAuthority.equals(firstUri.getAuthority())) {
        sCommittedSessions.clear();
      }
    }
  }

  private static final AtomicLong sNextSessionId = new AtomicLong(1);
  // Guarded by sLock. Maps sessionId -> committed session, keyed for resolver lookups.
  private static final Map<Long, Session> sCommittedSessions = new HashMap<>();
  // Guarded by sLock. Sessions opened but not yet committed.
  private static final Map<Long, Session> sOpenSessions = new HashMap<>();
  private static final Object sLock = new Object();

  private static final class Session {
    final long mId;
    final List<Payload> mPayloads = new ArrayList<>();

    Session(final long id) {
      mId = id;
    }
  }

  private static final class Payload {
    final String mMimeType;
    final byte[] mBytes;

    Payload(final String mimeType, final byte[] bytes) {
      mMimeType = mimeType;
      mBytes = bytes;
    }
  }

  /** Begins an in-memory session that {@link #addPayload} will push entries into. */
  /* package */ static long openSession() {
    final long id = sNextSessionId.getAndIncrement();
    synchronized (sLock) {
      sOpenSessions.put(id, new Session(id));
    }
    return id;
  }

  /** Appends one (MIME, bytes) payload to the open session. */
  /* package */ static void addPayload(
      final long sessionId, final String mimeType, final byte[] payload) {
    synchronized (sLock) {
      final Session s = sOpenSessions.get(sessionId);
      if (s == null) {
        Log.w(LOGTAG, "addPayload: no open session for id " + sessionId);
        return;
      }
      s.mPayloads.add(new Payload(mimeType, payload));
    }
  }

  /** Drops an opened-but-not-committed session without touching the system clipboard. */
  /* package */ static void cancelSession(final long sessionId) {
    synchronized (sLock) {
      sOpenSessions.remove(sessionId);
    }
  }

  /**
   * Promotes an open session to a {@link ClipData} ready to install as the primary clip. The
   * session moves from {@link #sOpenSessions} to {@link #sCommittedSessions} so URI lookups
   * succeed. The previous committed session (if any) is dropped.
   *
   * <p>The session must have at least one payload; the first added payload's URI is bundled onto
   * ClipData.Item[0] together with the standard text/HTML flavors below, and subsequent payloads
   * become their own single-URI items.
   *
   * <p>{@code text} / {@code htmlText} co-publish the transferable's standard text flavors on the
   * same ClipData so callers asking for {@code text/plain} or {@code text/html} after a mixed write
   * still find them. Pass empty / null to skip a flavor.
   */
  /* package */ static ClipData commitSessionToClipData(
      final Context context, final long sessionId, final CharSequence text, final String htmlText) {
    final Session session;
    synchronized (sLock) {
      session = sOpenSessions.remove(sessionId);
      if (session == null) {
        Log.w(LOGTAG, "commitSession: no open session for id " + sessionId);
        return null;
      }
      if (session.mPayloads.isEmpty()) {
        Log.w(LOGTAG, "commitSession: session has no payloads, id " + sessionId);
        return null;
      }
      // Replace any prior committed session. Only one Firefox-authored multi-
      // MIME clip can be the primary clip at a time, so older committed
      // sessions' URIs are about to become unresolvable anyway.
      if (!sCommittedSessions.isEmpty()) {
        // Keep this simple: clear the table; we don't have a strong reason
        // to preserve older sessions once a new one is committed.
        sCommittedSessions.clear();
      }
      sCommittedSessions.put(session.mId, session);
    }

    final boolean hasText = text != null && text.length() > 0;
    final boolean hasHtml = htmlText != null && htmlText.length() > 0;

    final ArrayList<String> mimeTypes = new ArrayList<>();
    if (hasText) {
      mimeTypes.add(ClipDescription.MIMETYPE_TEXT_PLAIN);
    }
    if (hasHtml) {
      mimeTypes.add(ClipDescription.MIMETYPE_TEXT_HTML);
    }
    for (final Payload p : session.mPayloads) {
      mimeTypes.add(p.mMimeType);
    }

    final ClipDescription description =
        new ClipDescription("gecko-clipboard", mimeTypes.toArray(new String[0]));

    // Item[0] carries the first payload's URI together with the standard
    // text/HTML flavors; Items[1..N] carry the remaining payloads' URIs.
    // Android only exposes (text, htmlText, intent, uri) for a four-way item;
    // the (text, intent, uri) 3-arg ctor would silently drop htmlText. Pass a
    // non-null empty CharSequence when there is no text so the URI still rides
    // on the first item.
    final CharSequence itemText = hasText ? text : "";
    final String itemHtml = hasHtml ? htmlText : null;
    final String authority = buildAuthority(context);
    final Uri firstUri = buildItemUri(authority, session.mId, /* itemIndex */ 0);
    final ClipData.Item firstItem = new ClipData.Item(itemText, itemHtml, (Intent) null, firstUri);
    final ClipData clipData = new ClipData(description, firstItem);
    for (int i = 1; i < session.mPayloads.size(); ++i) {
      final Uri payloadUri = buildItemUri(authority, session.mId, /* itemIndex */ i);
      clipData.addItem(new ClipData.Item(payloadUri));
    }
    return clipData;
  }

  private static Uri buildItemUri(
      final String authority, final long sessionId, final int itemIndex) {
    return new Uri.Builder()
        .scheme("content")
        .authority(authority)
        .appendPath(Long.toString(sessionId))
        .appendPath(Integer.toString(itemIndex))
        .build();
  }

  // Returns the (Session, itemIndex) for the given URI, or null on parse failure.
  private static SessionItem resolveUri(final Uri uri) {
    final List<String> segments = uri.getPathSegments();
    if (segments == null || segments.size() != 2) {
      return null;
    }
    final long sessionId;
    final int itemIndex;
    try {
      sessionId = Long.parseLong(segments.get(0));
      itemIndex = Integer.parseInt(segments.get(1));
    } catch (final NumberFormatException e) {
      return null;
    }
    synchronized (sLock) {
      final Session s = sCommittedSessions.get(sessionId);
      if (s == null) {
        return null;
      }
      return new SessionItem(s, itemIndex);
    }
  }

  private static final class SessionItem {
    final Session mSession;
    final int mIndex;

    SessionItem(final Session session, final int index) {
      mSession = session;
      mIndex = index;
    }

    String mimeType() {
      if (mIndex < 0 || mIndex >= mSession.mPayloads.size()) {
        return null;
      }
      return mSession.mPayloads.get(mIndex).mMimeType;
    }

    byte[] bytes() {
      if (mIndex < 0 || mIndex >= mSession.mPayloads.size()) {
        return null;
      }
      return mSession.mPayloads.get(mIndex).mBytes;
    }
  }

  // ---- ContentProvider hooks ----

  @Override
  public boolean onCreate() {
    return true;
  }

  @Override
  public String getType(final Uri uri) {
    final SessionItem item = resolveUri(uri);
    return item == null ? null : item.mimeType();
  }

  @Override
  public String[] getStreamTypes(final Uri uri, final String mimeTypeFilter) {
    final SessionItem item = resolveUri(uri);
    if (item == null) {
      return null;
    }
    final String mime = item.mimeType();
    if (mime == null) {
      return null;
    }
    // We only serve one MIME per URI, so honour the filter strictly.
    if (mimeTypeFilter != null && !mimeMatches(mimeTypeFilter, mime)) {
      return null;
    }
    return new String[] {mime};
  }

  private static boolean mimeMatches(final String filter, final String concrete) {
    if (filter.equals(concrete)) {
      return true;
    }
    if (filter.equals("*/*")) {
      return true;
    }
    // Handle "type/*" wildcards.
    final int slash = filter.indexOf('/');
    if (slash <= 0 || slash != filter.length() - 2 || filter.charAt(slash + 1) != '*') {
      return false;
    }
    return concrete.startsWith(filter.substring(0, slash + 1));
  }

  @Override
  public AssetFileDescriptor openAssetFile(final Uri uri, final String mode)
      throws FileNotFoundException {
    final SessionItem item = resolveUri(uri);
    if (item == null) {
      throw new FileNotFoundException("Unknown URI: " + uri);
    }
    final byte[] bytes = item.bytes();
    if (bytes == null) {
      throw new FileNotFoundException("No bytes for URI: " + uri);
    }
    // Pipe the bytes so the receiver gets a real FileDescriptor without
    // touching disk.
    final ParcelFileDescriptor[] pipe;
    try {
      pipe = ParcelFileDescriptor.createPipe();
    } catch (final IOException e) {
      final FileNotFoundException wrapped =
          new FileNotFoundException("Failed to create pipe for " + uri);
      wrapped.initCause(e);
      throw wrapped;
    }
    ThreadUtils.postToBackgroundThread(
        () -> {
          try (final OutputStream out = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])) {
            out.write(bytes);
          } catch (final IOException e) {
            Log.w(LOGTAG, "Failed to write payload to pipe", e);
          }
        });
    return new AssetFileDescriptor(pipe[0], 0, bytes.length);
  }

  // ---- The rest of the ContentProvider contract is not used. ----

  @Override
  public Cursor query(
      final Uri uri,
      final String[] projection,
      final String selection,
      final String[] selectionArgs,
      final String sortOrder) {
    return null;
  }

  @Override
  public Uri insert(final Uri uri, final ContentValues values) {
    return null;
  }

  @Override
  public int update(
      final Uri uri,
      final ContentValues values,
      final String selection,
      final String[] selectionArgs) {
    return 0;
  }

  @Override
  public int delete(final Uri uri, final String selection, final String[] selectionArgs) {
    return 0;
  }

  @Override
  public Bundle call(final String method, final String arg, final Bundle extras) {
    return null;
  }
}
