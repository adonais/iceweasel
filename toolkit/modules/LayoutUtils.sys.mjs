/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export var LayoutUtils = {
  /**
   * For a given DOM element, returns its position in screen coordinates of CSS units
   * (<https://developer.mozilla.org/en-US/docs/Web/CSS/CSSOM_View/Coordinate_systems#screen>).
   */
  getElementBoundingScreenRect(aElement) {
    let rect = aElement.getBoundingClientRect();
    let win = aElement.ownerGlobal;

    return win.windowUtils.toScreenRectInCSSUnits(
      rect.left,
      rect.top,
      rect.width,
      rect.height
    );
  },

  /**
   * Similar to getElementBoundingScreenRect using window and rect,
   * returns screen coordinates in screen units.
   */
  rectToScreenRect(win, rect) {
    return win.ownerGlobal.windowUtils.toScreenRect(
      rect.left,
      rect.top,
      rect.width,
      rect.height
    );
  },

  /**
   * Convert rect into the top level widget coordinates in LayoutDevicePixel
   * units.
   */
  rectToTopLevelWidgetRect(win, rect) {
    return win.ownerGlobal.windowUtils.toTopLevelWidgetRect(
      rect.left,
      rect.top,
      rect.width,
      rect.height
    );
  },
};
