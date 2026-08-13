/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { FormHistory } = ChromeUtils.importESModule(
  "resource://gre/modules/FormHistory.sys.mjs"
);

add_task(async function test() {
  const url = `data:text/html,<input type="text" name="field1">`;
  await BrowserTestUtils.withNewTab(
    { gBrowser, url },
    async function (browser) {
      const {
        autoCompletePopup,
        autoCompletePopup: { richlistbox: itemsBox },
      } = browser;
      const mockHistory = [
        { op: "add", fieldname: "field1", value: "value1" },
        { op: "add", fieldname: "field1", value: "value2" },
        { op: "add", fieldname: "field1", value: "value3" },
        { op: "add", fieldname: "field1", value: "value4" },
      ];

      await FormHistory.update([{ op: "remove" }, ...mockHistory]);
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.focus();
      });

      // show popup
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await TestUtils.waitForCondition(() => {
        return autoCompletePopup.popupOpen;
      });
      Assert.equal(
        autoCompletePopup.matchCount,
        mockHistory.length,
        "ensure result length"
      );
      Assert.equal(
        autoCompletePopup.mousedOverIndex,
        -1,
        "mousedOverIndex should be -1"
      );

      // navigate to the first item
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      Assert.equal(
        autoCompletePopup.selectedIndex,
        0,
        "selectedIndex should be 0"
      );

      // mouseover the second item
      const listItemElems = itemsBox.querySelectorAll(".autocomplete-row-item");
      EventUtils.synthesizeMouseAtCenter(listItemElems[1], {
        type: "mouseover",
      });
      await TestUtils.waitForCondition(() => {
        return (autoCompletePopup.mousedOverIndex = 1);
      });
      Assert.ok(true, "mousedOverIndex changed");
      Assert.equal(
        autoCompletePopup.selectedIndex,
        0,
        "selectedIndex should not be changed by mouseover"
      );

      // close popup
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.blur();
      });
    }
  );
});

add_task(async function test_focus_indicator_follows_pointer() {
  const url = `data:text/html,<input type="text" name="field1">`;
  await BrowserTestUtils.withNewTab(
    { gBrowser, url },
    async function (browser) {
      const {
        autoCompletePopup,
        autoCompletePopup: { richlistbox: itemsBox },
      } = browser;
      const mockHistory = [
        { op: "add", fieldname: "field1", value: "value1" },
        { op: "add", fieldname: "field1", value: "value2" },
        { op: "add", fieldname: "field1", value: "value3" },
        { op: "add", fieldname: "field1", value: "value4" },
      ];

      await FormHistory.update([{ op: "remove" }, ...mockHistory]);
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.focus();
      });

      // show popup
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await TestUtils.waitForCondition(() => {
        return autoCompletePopup.popupOpen;
      });

      // keyboard-select the first item
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      Assert.equal(
        autoCompletePopup.selectedIndex,
        0,
        "selectedIndex should be 0"
      );

      const listItemElems = itemsBox.querySelectorAll(".autocomplete-row-item");
      Assert.ok(
        !itemsBox.hasAttribute("pointerselected"),
        "keyboard selection should not set pointerselected"
      );
      Assert.ok(
        listItemElems[0].querySelector("autocomplete-row-item").selected,
        "keyboard-selected row item should show the focus indicator"
      );

      // move the pointer over a different item
      EventUtils.synthesizeMouseAtCenter(listItemElems[1], {
        type: "mousemove",
      });
      await TestUtils.waitForCondition(() => {
        return !listItemElems[0].querySelector("autocomplete-row-item")
          .selected;
      });

      Assert.ok(
        itemsBox.hasAttribute("pointerselected"),
        "pointer selection should set pointerselected"
      );
      Assert.ok(
        listItemElems[1].querySelector("autocomplete-row-item").selected,
        "moused-over row item should become selected"
      );
      Assert.equal(
        autoCompletePopup.selectedIndex,
        1,
        "pointer should move selection to the moused-over row"
      );

      // close popup
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.blur();
      });
    }
  );
});
