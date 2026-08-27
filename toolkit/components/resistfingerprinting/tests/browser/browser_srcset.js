/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

async function precacheAssets(tab, zoom) {
  await SpecialPowers.spawn(tab.linkedBrowser, [zoom], async zoom => {
    const { Layout } = ChromeUtils.importESModule(
      "chrome://mochitests/content/browser/accessible/tests/browser/Layout.sys.mjs"
    );
    Layout.zoomDocument(content.document, zoom);
    const { promise, resolve } = Promise.withResolvers();
    content.requestAnimationFrame(resolve);
    await promise;
  });
}

async function runForZoomLevel(tab, zoom) {
  const [dpr, scale, cssScale] = await SpecialPowers.spawn(
    tab.linkedBrowser,
    [zoom],
    async zoom => {
      const img = content.document.getElementById("srcset");

      const { Layout } = ChromeUtils.importESModule(
        "chrome://mochitests/content/browser/accessible/tests/browser/Layout.sys.mjs"
      );
      Layout.zoomDocument(content.document, zoom);

      // The zoom change might trigger a new load. Be sure it is complete
      // before checking the scale.
      await new Promise(resolve => {
        img.addEventListener("error", resolve, { once: true });
        if (img.complete) {
          resolve();
        }
      });

      // Workaround: content.devicePixelRatio has the unspoofed value.
      const dpr = content.wrappedJSObject.devicePixelRatio;
      const current = img.currentSrc;
      const scale = parseFloat(current.match(/.*\/([0-9\.]+)\.png$/)[1]);

      const height = content.document
        .getElementById("imgset")
        .getBoundingClientRect().height;
      // The images have been crafted so that it is possible to reverse their
      // measured size (altered by the zoom) and find the scale.
      const cssScale = Math.round((height * dpr - 50) / 10) / 10 + 0.3;

      return [dpr, scale, cssScale];
    }
  );

  is(
    Math.abs(dpr - scale) < 0.1,
    true,
    `Image scale (${scale}) is within DPR (${dpr})`
  );
  is(
    Math.abs(dpr - cssScale) < 0.1,
    true,
    `CSS scale (${cssScale}) is within DPR (${dpr})`
  );
}

add_task(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.resistFingerprinting", true]],
  });

  const testPage =
    getRootDirectory(gTestPath).replace(
      "chrome://mochitests/content",
      "https://example.com"
    ) + "srcset.html";
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, testPage);

  for (let zoom = 0.3; zoom < 2.09; zoom += 0.1) {
    await precacheAssets(tab, zoom);
  }
  for (let zoom = 0.3; zoom < 2.09; zoom += 0.1) {
    await runForZoomLevel(tab, zoom);
  }

  BrowserTestUtils.removeTab(tab);
});
