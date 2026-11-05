/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.geckoview;

import android.graphics.Rect;
import android.os.Build;
import android.os.CancellationSignal;
import android.util.Log;
import android.view.ScrollCaptureCallback;
import android.view.ScrollCaptureSession;
import android.view.Surface;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.function.Supplier;

@RequiresApi(Build.VERSION_CODES.S)
/*package*/ class GeckoViewScrollCaptureCallback implements ScrollCaptureCallback {
  private static final String LOGTAG = "GeckoViewScrollCapture";

  private final Supplier<GeckoSession> mSessionSupplier;
  private GeckoSession.Window.ContentMetrics mContentMetrics;

  /* package */ GeckoViewScrollCaptureCallback(
      @NonNull final Supplier<GeckoSession> sessionSupplier) {
    mSessionSupplier = sessionSupplier;
  }

  @Override
  public void onScrollCaptureEnd(@NonNull final Runnable runnable) {
    mContentMetrics = null;
    runnable.run();
  }

  @Override
  public void onScrollCaptureImageRequest(
      @NonNull final ScrollCaptureSession scrollCaptureSession,
      @NonNull final CancellationSignal cancellationSignal,
      @NonNull final Rect captureArea,
      @NonNull final Consumer<Rect> onComplete) {
    final GeckoSession session = mSessionSupplier.get();
    final Surface surface = scrollCaptureSession.getSurface();
    final float dpr = (mContentMetrics == null) ? 0 : mContentMetrics.devicePixelRatio;
    if (cancellationSignal.isCanceled()
        || mContentMetrics == null
        || session == null
        || session.mWindow == null
        || surface == null
        || !surface.isValid()
        || dpr <= 0) {
      Log.w(
          LOGTAG,
          "onScrollCaptureImageRequest declined: canceled="
              + cancellationSignal.isCanceled()
              + " metrics="
              + (mContentMetrics != null)
              + " session="
              + (session != null)
              + " window="
              + (session != null && session.mWindow != null)
              + " surfaceValid="
              + (surface != null && surface.isValid())
              + " dpr="
              + dpr);
      onComplete.accept(new Rect());
      return;
    }

    final int contentWidth = Math.round(mContentMetrics.width * dpr);
    final int contentHeight = Math.round(mContentMetrics.height * dpr);
    final int scrollX = Math.round(mContentMetrics.scrollX * dpr);
    final int scrollY = Math.round(mContentMetrics.scrollY * dpr);

    final Rect content = new Rect(captureArea);
    content.offset(scrollX, scrollY);
    if (!content.intersect(0, 0, contentWidth, contentHeight)) {
      Log.w(
          LOGTAG,
          "onScrollCaptureImageRequest declined: captureArea "
              + captureArea
              + " maps outside content "
              + contentWidth
              + "x"
              + contentHeight
              + " at scroll ("
              + scrollX
              + ","
              + scrollY
              + ")");
      onComplete.accept(new Rect());
      return;
    }

    // Snap the content-absolute rect out to the CSS pixel grid so the painted region has integer
    // CSS bounds. The compositor scales CSS->device by truncation (surfaceSize = cssSize * scale as
    // an int), so derive the captured rect the same way to match the painted pixels exactly.
    final int cssLeft = Math.max(0, (int) Math.floor(content.left / dpr));
    final int cssTop = Math.max(0, (int) Math.floor(content.top / dpr));
    final int cssRight = Math.min(mContentMetrics.width, (int) Math.ceil(content.right / dpr));
    final int cssBottom = Math.min(mContentMetrics.height, (int) Math.ceil(content.bottom / dpr));
    final int cssWidth = cssRight - cssLeft;
    final int cssHeight = cssBottom - cssTop;
    if (cssWidth <= 0 || cssHeight <= 0) {
      Log.w(
          LOGTAG,
          "onScrollCaptureImageRequest declined: empty CSS rect " + cssWidth + "x" + cssHeight);
      onComplete.accept(new Rect());
      return;
    }

    // The native blit clamps the painted snapshot to the Surface buffer, which is sized to the
    // scroll bounds. Clamp captured to the same bounds so it never reports more than the buffer
    // holds.
    final Rect scrollBounds = scrollCaptureSession.getScrollBounds();
    final int capturedLeft = (int) (cssLeft * dpr) - scrollX;
    final int capturedTop = (int) (cssTop * dpr) - scrollY;
    final int capturedWidth = Math.min((int) (cssWidth * dpr), scrollBounds.width());
    final int capturedHeight = Math.min((int) (cssHeight * dpr), scrollBounds.height());
    final Rect captured =
        new Rect(
            capturedLeft, capturedTop, capturedLeft + capturedWidth, capturedTop + capturedHeight);

    // The in-flight native paint cannot be aborted,
    // but if the request is canceled we discard its result.
    final AtomicBoolean cancelled = new AtomicBoolean(false);
    cancellationSignal.setOnCancelListener(() -> cancelled.set(true));

    final GeckoResult<Void> result = new GeckoResult<>();
    session.mWindow.requestRegionToSurface(
        result, surface, cssLeft, cssTop, cssWidth, cssHeight, dpr);
    result.accept(
        v -> onComplete.accept(cancelled.get() ? new Rect() : captured),
        error -> onComplete.accept(new Rect()));
  }

  @Override
  public void onScrollCaptureSearch(
      @NonNull final CancellationSignal cancellationSignal,
      @NonNull final Consumer<Rect> consumer) {
    final GeckoSession session = mSessionSupplier.get();

    final Rect bounds = new Rect();
    if (session != null) {
      session.getSurfaceBounds(bounds);
    }
    consumer.accept(bounds);
  }

  @Override
  public void onScrollCaptureStart(
      @NonNull final ScrollCaptureSession scrollCaptureSession,
      @NonNull final CancellationSignal cancellationSignal,
      @NonNull final Runnable onReady) {
    final GeckoSession session = mSessionSupplier.get();
    if (cancellationSignal.isCanceled() || session == null || session.mWindow == null) {
      onReady.run();
      return;
    }

    final GeckoResult<GeckoSession.Window.ContentMetrics> result = new GeckoResult<>();
    session.mWindow.requestContentMetrics(result, new GeckoSession.Window.ContentMetrics());
    result.accept(
        metrics -> {
          mContentMetrics = metrics;
          onReady.run();
        },
        error -> {
          mContentMetrics = null;
          onReady.run();
        });
  }
}
