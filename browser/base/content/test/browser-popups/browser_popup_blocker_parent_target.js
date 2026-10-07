/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXAMPLE_ORG = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  // eslint-disable-next-line sdl/no-insecure-url
  "http://example.org"
);

const EXAMPLE_COM = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  // eslint-disable-next-line sdl/no-insecure-url
  "http://example.com"
);

const OPEN_COUNT = 4;

add_task(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.disable_open_during_load", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    EXAMPLE_ORG + "popup_blocker_a.html"
  );
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));

  const openedTabs = [];

  const onTabOpen = e => openedTabs.push(e.target);
  gBrowser.tabContainer.addEventListener("TabOpen", onTabOpen);

  registerCleanupFunction(async () => {
    gBrowser.tabContainer.removeEventListener("TabOpen", onTabOpen);
    for (const openedTab of openedTabs) {
      gBrowser.removeTab(openedTab);
    }
  });

  await SpecialPowers.spawn(
    tab.linkedBrowser,
    [
      EXAMPLE_ORG + "popup_blocker_parent_target.html",
      EXAMPLE_COM + "popup_blocker_parent_target.html",
      OPEN_COUNT,
    ],
    async (middleUrl, childUrl, count) => {
      const done = new Promise(resolve => {
        content.addEventListener("message", function onMessage(event) {
          if (event.data.done) {
            content.removeEventListener("message", onMessage);
            resolve();
          }
        });
      });

      const frame = content.document.createElement("iframe");
      frame.src = `${middleUrl}?frame=${encodeURIComponent(childUrl + "?open=" + count)}`;
      content.document.body.appendChild(frame);

      await done;
    }
  );

  Assert.equal(openedTabs.length, 0, "should not have opened a tab");
});
