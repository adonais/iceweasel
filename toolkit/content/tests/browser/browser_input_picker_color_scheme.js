/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

async function openPicker(browser, panelId) {
  let shown = BrowserTestUtils.waitForEvent(
    document.getElementById("mainPopupSet"),
    "popupshown",
    false,
    event => event.target.id == panelId
  );

  await SpecialPowers.spawn(browser, [], async () => {
    await SpecialPowers.contentTransformsReceived(content);
    content.document.notifyUserGestureActivation();
    content.document.querySelector("input").showPicker();
  });

  let panel = (await shown).target;
  let frame = panel.querySelector(`#${panelId}PopupFrame`);
  await TestUtils.waitForCondition(
    () =>
      frame.contentDocument?.readyState == "complete" &&
      frame.contentDocument.documentURI != "about:blank",
    `${panelId} frame loaded`
  );
  return { panel, frame };
}

async function assertColorScheme(type, panelId, inputStyle, expected) {
  let html = `<input type="${type}" style="${inputStyle}">`;
  await BrowserTestUtils.withNewTab(
    `data:text/html,${encodeURIComponent(html)}`,
    async browser => {
      let { panel, frame } = await openPicker(browser, panelId);

      Assert.equal(
        window.getComputedStyle(panel).colorScheme,
        expected,
        `${panelId} for ${html}`
      );
      Assert.equal(
        frame.contentWindow.matchMedia("(prefers-color-scheme: dark)").matches,
        expected == "dark",
        "The scheme reaches the document inside the picker frame"
      );

      let hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
      panel.hidePopup();
      await hidden;
    }
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.forms.html_color_picker.enabled", true]],
  });
});

registerCleanupFunction(() => {
  // The panels keep their iframe for the lifetime of the window, which the
  // shutdown leak check attributes to this test.
  for (let panelId of ["DateTimePickerPanel", "ColorPickerPanel"]) {
    document.getElementById(`${panelId}PopupFrame`)?.remove();
  }
});

add_task(async function test_date_picker() {
  await assertColorScheme("date", "DateTimePickerPanel", "", "light");
  await assertColorScheme(
    "date",
    "DateTimePickerPanel",
    "color-scheme: dark",
    "dark"
  );
  await assertColorScheme(
    "date",
    "DateTimePickerPanel",
    "color-scheme: light",
    "light"
  );
});

add_task(async function test_color_picker() {
  await assertColorScheme("color", "ColorPickerPanel", "", "light");
  await assertColorScheme(
    "color",
    "ColorPickerPanel",
    "color-scheme: dark",
    "dark"
  );
  await assertColorScheme(
    "color",
    "ColorPickerPanel",
    "color-scheme: light",
    "light"
  );
});
