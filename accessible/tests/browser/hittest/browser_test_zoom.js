/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Return the screen position of the element with the given id in device
 * pixels. This uses getContentBoundsForDOMElm for non-iframe tests. In
 * iframe tests, we manually compute screen coords for both the iframe
 * and the iframe's content, as zoom will change both.
 */
async function getScreenPos(browser, id) {
  if (!gIsIframe) {
    return getContentBoundsForDOMElm(browser, id);
  }
  const [frameX, frameY] = await SpecialPowers.spawn(
    browser,
    [DEFAULT_IFRAME_ID],
    frameId => {
      const frame = content.document.getElementById(frameId);
      const rect = frame.getBoundingClientRect();
      const dpr = content.devicePixelRatio;
      return [
        (content.mozInnerScreenX + rect.left + frame.clientLeft) * dpr,
        (content.mozInnerScreenY + rect.top + frame.clientTop) * dpr,
      ];
    }
  );
  const [x, y] = await invokeContentTask(browser, [id], contentId => {
    const rect = content.document
      .getElementById(contentId)
      .getBoundingClientRect();
    const dpr = content.devicePixelRatio;
    return [rect.left * dpr, rect.top * dpr];
  });
  return [Math.round(frameX + x), Math.round(frameY + y)];
}

/**
 * Functions identically to head.js's hitTest(...) function, except
 * instead of relying on getContentBoundsForDOMElm, we use the
 * getScreenPos method above.
 */
async function hitTestZoomed(browser, container, child, grandChild) {
  const [childX, childY] = await getScreenPos(
    browser,
    getAccessibleDOMNodeID(child)
  );
  const x = childX + 1;
  const y = childY + 1;
  await untilCacheIs(
    () => getChildAtPoint(container, x, y, false),
    child,
    `Wrong direct child accessible at the point (${x}, ${y})`
  );
  await untilCacheIs(
    () => getChildAtPoint(container, x, y, true),
    grandChild,
    `Wrong deepest child accessible at the point (${x}, ${y})`
  );
}

async function runTests(browser, accDoc) {
  if (Services.appinfo.OS !== "Darwin") {
    const p1 = findAccessibleChildByID(accDoc, "p1");
    const p2 = findAccessibleChildByID(accDoc, "p2");
    await hitTest(browser, accDoc, p1, p1.firstChild);
    await hitTest(browser, accDoc, p2, p2.firstChild);

    await invokeContentTask(browser, [], () => {
      const { Layout } = ChromeUtils.importESModule(
        "chrome://mochitests/content/browser/accessible/tests/browser/Layout.sys.mjs"
      );

      Layout.zoomDocument(content.document, 2.0);
      content.document.body.offsetTop; // getBounds doesn't flush layout on its own.
    });

    await hitTestZoomed(browser, accDoc, p1, p1.firstChild);
    await hitTestZoomed(browser, accDoc, p2, p2.firstChild);
  } else {
    todo(
      false,
      "Bug 746974 - deepest child must be correct on all platforms, disabling on Mac!"
    );
  }
}

addAccessibleTask(`<p id="p1">para 1</p><p id="p2">para 2</p>`, runTests, {
  iframe: true,
  remoteIframe: true,
  // Ensure that all hittest elements are in view.
  iframeAttrs: { style: "left: 100px; top: 100px;" },
});
