/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_drawSnapshot_returns_false_on_failure() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    // A scale that isn't finite makes WindowGlobalParent.drawSnapshot throw.
    let result = await browser.drawSnapshot(0, 0, 10, 10, NaN, "white");
    is(result, false, "drawSnapshot returns false when the snapshot fails");
  });
});
