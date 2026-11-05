/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.geckoview_example;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import java.lang.ref.WeakReference;
import org.mozilla.geckoview.ExperimentalGeckoViewApi;
import org.mozilla.geckoview.GeckoSession;

/**
 * Hands the session created for a picture-in-picture request to the window that displays it.
 *
 * <p>The two are necessarily separated in time: the request is answered where no activity is
 * available, and starting one is asynchronous. Only ever touched from the UI thread.
 */
public final class PipSessionHolder {

  /** The session created to display the cloned video, handed to the picture-in-picture window. */
  @Nullable public static GeckoSession sSession;

  /** The session the video is playing in, notified when the window is torn down. */
  @Nullable public static GeckoSession sSourceSession;

  /** The session to switch back to when an expanded window returns to the browser. */
  @Nullable public static GeckoSession sReturnToSession;

  /** The window currently displaying a session, if one is up. */
  @Nullable public static WeakReference<PictureInPictureActivity> sActiveActivity;

  /** The session the browser is showing on screen, if it is started. */
  @Nullable public static GeckoSession sVisibleSession;

  private PipSessionHolder() {}

  @Nullable
  public static PictureInPictureActivity getActiveActivity() {
    return sActiveActivity != null ? sActiveActivity.get() : null;
  }

  /**
   * Closes the window if it is showing a video from {@code session}, which is going away, and stops
   * keeping {@code session} active for it.
   */
  @OptIn(markerClass = ExperimentalGeckoViewApi.class)
  public static void closeWindowFor(@NonNull final GeckoSession session) {
    final PictureInPictureActivity window = getActiveActivity();
    if (window != null && window.isShowingSource(session)) {
      window.closeForGecko();
    }
    session.getSessionPictureInPicture().setKeepActive(false);
  }

  /**
   * Stops keeping {@code session} active for the window, and deactivates it unless the browser is
   * showing it.
   */
  @OptIn(markerClass = ExperimentalGeckoViewApi.class)
  public static void releaseSource(@NonNull final GeckoSession session) {
    session.getSessionPictureInPicture().setKeepActive(false);
    if (session != sVisibleSession) {
      session.setActive(false);
    }
  }

  /** Returns the parked {@link #sSession} and clears it, so that a single window displays it. */
  @Nullable
  public static GeckoSession take() {
    final GeckoSession parked = sSession;
    sSession = null;
    return parked;
  }
}
