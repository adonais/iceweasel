/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { FormHistory } = ChromeUtils.importESModule(
  "resource://gre/modules/FormHistory.sys.mjs"
);

async function assertColorScheme(inputStyle, expected) {
  const html = `<input type="text" name="field1" style="${inputStyle}">`;
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: `data:text/html,${encodeURIComponent(html)}` },
    async browser => {
      let popup = browser.autoCompletePopup;

      await SpecialPowers.spawn(browser, [], () =>
        content.document.querySelector("input").focus()
      );
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await TestUtils.waitForCondition(() => popup.popupOpen, "popup opened");

      Assert.equal(
        window.getComputedStyle(popup).colorScheme,
        expected,
        `#PopupAutoComplete for ${html}`
      );

      let hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
      await BrowserTestUtils.synthesizeKey("VK_ESCAPE", {}, browser);
      await hidden;
    }
  );
}

add_setup(async function () {
  await FormHistory.update([
    { op: "remove" },
    { op: "add", fieldname: "field1", value: "value1" },
  ]);
  await SpecialPowers.pushPrefEnv({
    set: [
      // Content prefers dark, so a popup taking its scheme from the content
      // preference instead of the input would be dark throughout.
      ["layout.css.prefers-color-scheme.content-override", 0],
    ],
  });
  registerCleanupFunction(() => FormHistory.update({ op: "remove" }));
});

add_task(async function test_color_scheme() {
  await assertColorScheme("", "light");
  await assertColorScheme("color-scheme: dark", "dark");
  await assertColorScheme("color-scheme: light", "light");
});
