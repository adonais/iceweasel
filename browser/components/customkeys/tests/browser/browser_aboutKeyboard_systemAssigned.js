/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { CustomKeys } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customkeys/CustomKeys.sys.mjs"
);

// Test a shortcut that the operating system assigned: about:keyboard says so
// and does not offer to change it.
add_task(async function testSystemAssignedKey() {
  const keyEl = document.getElementById("key_selectTab1");
  simulateSystemAssignment(keyEl, "accel,alt,shift", "Y");
  registerCleanupFunction(() => simulateSystemAssignmentRemoval(keyEl));
  await BrowserTestUtils.withNewTab("about:keyboard", async tab => {
    await SpecialPowers.spawn(tab, [], async () => {
      if (!content.document.getElementById("table").firstElementChild) {
        await ContentTaskUtils.waitForEvent(
          content,
          "CustomKeysUpdate",
          false,
          null,
          true
        );
      }
      const row = content.document.querySelector(
        '.key[data-id="key_selectTab1"]'
      );
      ok(row.classList.contains("system-assigned"), "Row is system assigned");
      ok(
        !row.classList.contains("customized"),
        "Row is not shown as customized"
      );
      is(
        row.querySelector(".text-deemphasized").getAttribute("data-l10n-id"),
        "customkeys-key-system-assigned",
        "Row explains where the shortcut comes from"
      );
      ok(
        row
          .querySelector(".currentShortcut")
          .wrappedJSObject.value.endsWith("Y"),
        "Row shows the assigned shortcut"
      );
      for (const button of ["change", "clear", "reset"]) {
        ok(
          ContentTaskUtils.isHidden(row.querySelector(`.${button}`)),
          `The ${button} button is hidden`
        );
      }
      // The first category is still animating open. The harness fails a test
      // that ends while vsync is enabled, so wait for the animation to end.
      await Promise.allSettled(
        content.document.getAnimations().map(animation => animation.finished)
      );
    });
  });
  simulateSystemAssignmentRemoval(keyEl);
  ok(
    !CustomKeys.isSystemAssigned(keyEl),
    "key_selectTab1 is no longer assigned"
  );
});
