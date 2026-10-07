/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const MIN_WIDTH = 200;
export const MIN_HEIGHT = 150;

export const FULL_TAB_DEFAULT_WIDTH = 640;
export const FULL_TAB_DEFAULT_HEIGHT = 400;

/** Static sizing/framing helpers for a Mini Window. */
export class MiniWindowUtils {
  /**
   * Size for a full-tab mini window, which frames no crop and so has no
   * natural size of its own.
   *
   * @returns {{width: number, height: number}} in CSS px.
   */
  static fullTabSize() {
    return {
      width: FULL_TAB_DEFAULT_WIDTH,
      height: FULL_TAB_DEFAULT_HEIGHT,
    };
  }

  /**
   * Where and how large to open the mini window for `cropInfo`. Reads the
   * screen originWin is on; computeWindowRectForScreen does the math.
   *
   * @param {Window} originWin - the window the tab is popped out of.
   * @param {object} cropInfo - region to frame; uses width/height, content CSS px.
   * @returns {{left: number, top: number, width: number, height: number}}
   */
  static computeWindowRect(originWin, cropInfo) {
    let sm = Cc["@mozilla.org/gfx/screenmanager;1"].getService(
      Ci.nsIScreenManager
    );
    let originCssToDesktopScale =
      originWin.devicePixelRatio / originWin.desktopToDeviceScale;
    let screen = sm.screenForRect(
      originWin.screenX * originCssToDesktopScale,
      originWin.screenY * originCssToDesktopScale,
      originWin.outerWidth * originCssToDesktopScale,
      originWin.outerHeight * originCssToDesktopScale
    );
    let l = {},
      t = {},
      w = {},
      h = {};
    screen.GetAvailRectDisplayPix(l, t, w, h);

    return MiniWindowUtils.computeWindowRectForScreen(cropInfo, {
      availRect: {
        left: l.value,
        top: t.value,
        width: w.value,
        height: h.value,
      },
      screenCssToDesktopScale:
        screen.defaultCSSScaleFactor / screen.contentsScaleFactor,
      originCssToDesktopScale,
      isRTL: Services.locale.isAppLocaleRTL,
    });
  }

  /**
   * Size the miniwindow to the crop's own dimensions (so the region shows at native
   * size, scale 1), clamped down to the available screen when the crop is
   * larger, preserving aspect ratio, then corner it in the available rect.
   *
   * Three pixel spaces meet here:
   *   desktop px      availRect
   *   screen CSS px   cropInfo, returned width/height
   *   originWin CSS   returned left/top (what openWindow features take)
   *
   * A scale is desktopPx per cssPx, i.e. defaultCSSScaleFactor over
   * contentsScaleFactor: 2/2 = 1 on a Retina Mac, 1.5/1 at 150% on Windows.
   * originWin may be on a different monitor than the mini window, so its scale
   * is tracked separately from the target screen's.
   *
   * @param {object} cropInfo - region to frame; uses width/height, content CSS px.
   * @param {object} screenInfo
   * @param {object} screenInfo.availRect - the target screen's available rect,
   *   {left, top, width, height} in desktop px.
   * @param {number} screenInfo.screenCssToDesktopScale - the target screen's scale.
   * @param {number} screenInfo.originCssToDesktopScale - originWin's scale.
   * @param {boolean} screenInfo.isRTL - whether the app locale is RTL.
   * @returns {{left: number, top: number, width: number, height: number}}
   */
  static computeWindowRectForScreen(
    cropInfo,
    { availRect, screenCssToDesktopScale, originCssToDesktopScale, isRTL }
  ) {
    let availWidth = availRect.width / screenCssToDesktopScale;
    let availHeight = availRect.height / screenCssToDesktopScale;

    const MAX_WIDTH = availWidth;
    const MAX_HEIGHT = availHeight;

    let aspect = cropInfo.width / cropInfo.height;
    let availAspect = availWidth / availHeight;

    let width = cropInfo.width;
    let height = cropInfo.height;

    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
      // Clamp the constraining axis by comparing the crop's aspect to the
      // available rect's.
      if (aspect > availAspect) {
        width = MAX_WIDTH;
        height = Math.round(MAX_WIDTH / aspect);
      } else {
        height = MAX_HEIGHT;
        width = Math.round(MAX_HEIGHT * aspect);
      }
    }
    width = Math.max(MIN_WIDTH, Math.round(width));
    height = Math.max(MIN_HEIGHT, Math.round(height));

    let widthDesktop = width * screenCssToDesktopScale;
    let heightDesktop = height * screenCssToDesktopScale;
    let left = isRTL
      ? availRect.left
      : availRect.left + availRect.width - widthDesktop;
    let top = availRect.top + availRect.height - heightDesktop;
    return {
      left: Math.round(left / originCssToDesktopScale),
      top: Math.round(top / originCssToDesktopScale),
      width,
      height,
    };
  }

  /**
   * How large to lay the popup's <browser> out, in two coordinate spaces:
   *   - page{Width,Height} (content CSS px): the logical page the browser
   *     represents - the larger of the viewport the crop was captured against
   *     and the content's measured size, so the whole page the crop pans over
   *     fits. The user's crop is a sub-region of this that the transform frames.
   *   - box{Width,Height} (chrome CSS px): the <browser> element's on-screen
   *     size. Under fullZoom one content px paints as `zoom` chrome px, so
   *     box = page * zoom keeps the content laid out at its natural size.
   *
   * @param {object} cropInfo - the user's crop; uses viewportWidth/Height (the
   *   content viewport size at capture time), in content CSS px.
   * @param {?object} measuredSize - the content's measured {width, height} in
   *   content CSS px, or null if the content actor couldn't report it.
   * @param {number} zoom - the browser's fullZoom factor.
   * @returns {object} {pageWidth, pageHeight, boxWidth, boxHeight}
   */
  static computeFrameBox(cropInfo, measuredSize, zoom = 1) {
    // Logical page size (content CSS px): big enough for both the captured
    // viewport and the full measured content.
    let pageWidth = Math.max(
      cropInfo.viewportWidth ?? 0,
      measuredSize?.width ?? 0
    );
    let pageHeight = Math.max(
      cropInfo.viewportHeight ?? 0,
      measuredSize?.height ?? 0
    );
    return {
      pageWidth,
      pageHeight,
      boxWidth: pageWidth * zoom,
      boxHeight: pageHeight * zoom,
    };
  }

  /**
   * Chrome-side scale/translate that frames the `crop` so it fills the
   * popup window's width. The browser element is laid out at full page
   * size with scroll normalized to 0,0 - this transform crops+zooms it.
   *
   * @param {number} innerWidth
   * @param {object} crop
   * @param {number} zoom
   */
  static computeTransform(innerWidth, crop, zoom = 1) {
    // crop is in content CSS px; the browser box is laid out at page size * zoom
    // so fold zoom into both the scale and the translate.
    let scale = crop.width > 0 ? innerWidth / (crop.width * zoom) || 1 : 1;
    return {
      scale,
      // `|| 0` avoids a -0 result when the offset is 0.
      tx: -(crop.left * zoom) || 0,
      ty: -(crop.top * zoom) || 0,
    };
  }
}
