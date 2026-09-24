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

add_task(async function test_pointer_selection_cleared_on_pointer_leave() {
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

      const listItemElems = itemsBox.querySelectorAll(".autocomplete-row-item");

      // hover the second item to select it with the pointer
      EventUtils.synthesizeMouseAtCenter(listItemElems[1], {
        type: "mousemove",
      });
      await TestUtils.waitForCondition(() => {
        return listItemElems[1].querySelector("autocomplete-row-item").selected;
      });
      Assert.ok(
        itemsBox.hasAttribute("pointerselected"),
        "pointer selection should set pointerselected"
      );
      Assert.equal(
        autoCompletePopup.selectedIndex,
        1,
        "selectedIndex should follow the moused-over row"
      );

      // moving the pointer to another row (still inside the panel) must not
      // clear the selection
      listItemElems[1].dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: listItemElems[2],
        })
      );
      Assert.equal(
        autoCompletePopup.selectedIndex,
        1,
        "moving between rows should not clear the selection"
      );
      Assert.ok(
        itemsBox.hasAttribute("pointerselected"),
        "moving between rows should keep pointerselected"
      );

      // move the pointer off the panel
      listItemElems[1].dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: null })
      );

      Assert.equal(
        autoCompletePopup.selectedIndex,
        -1,
        "pointer selection should be cleared when the pointer leaves"
      );
      Assert.ok(
        !itemsBox.hasAttribute("pointerselected"),
        "pointerselected should be removed when the pointer leaves"
      );
      Assert.ok(
        !listItemElems[1].querySelector("autocomplete-row-item").selected,
        "moused-over row item should no longer be selected"
      );
      Assert.equal(
        autoCompletePopup.mousedOverIndex,
        -1,
        "mousedOverIndex should be reset when the pointer leaves"
      );

      // close popup
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.blur();
      });
    }
  );
});

add_task(async function test_keyboard_selection_survives_pointer_leave() {
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
      Assert.ok(
        !itemsBox.hasAttribute("pointerselected"),
        "keyboard selection should not set pointerselected"
      );

      const listItemElems = itemsBox.querySelectorAll(".autocomplete-row-item");

      // a pointer leaving the panel should not clear a keyboard selection
      listItemElems[0].dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: null })
      );

      Assert.equal(
        autoCompletePopup.selectedIndex,
        0,
        "keyboard selection should survive the pointer leaving"
      );
      Assert.ok(
        listItemElems[0].querySelector("autocomplete-row-item").selected,
        "keyboard-selected row item should stay selected"
      );

      // close popup
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.blur();
      });
    }
  );
});

add_task(async function test_scroll_preserved_on_pointer_leave() {
  const url = `data:text/html,<input type="text" name="field1">`;
  await BrowserTestUtils.withNewTab(
    { gBrowser, url },
    async function (browser) {
      const {
        autoCompletePopup,
        autoCompletePopup: { richlistbox: itemsBox },
      } = browser;
      // Enough entries to overflow the visible rows and show a scrollbar.
      const mockHistory = Array.from({ length: 20 }, (_, i) => ({
        op: "add",
        fieldname: "field1",
        value: `value${String(i).padStart(2, "0")}`,
      }));

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

      // keyboard-navigate down far enough to scroll the list
      for (let i = 0; i < 12; i++) {
        await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      }
      const scrolledIndex = autoCompletePopup.selectedIndex;
      Assert.greater(
        itemsBox.scrollTop,
        0,
        "keyboard navigation should scroll the list down"
      );

      const listItemElems = itemsBox.querySelectorAll(".autocomplete-row-item");

      // pointer-select the currently selected (visible) row
      EventUtils.synthesizeMouseAtCenter(listItemElems[scrolledIndex], {
        type: "mousemove",
      });
      await TestUtils.waitForCondition(() => {
        return itemsBox.hasAttribute("pointerselected");
      });
      const scrollTopBeforeLeave = itemsBox.scrollTop;

      // move the pointer off the panel
      listItemElems[scrolledIndex].dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: null })
      );

      Assert.equal(
        autoCompletePopup.selectedIndex,
        -1,
        "pointer selection should be cleared when the pointer leaves"
      );
      Assert.equal(
        itemsBox.scrollTop,
        scrollTopBeforeLeave,
        "the list should not scroll when the pointer leaves"
      );

      // close popup
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.blur();
      });
    }
  );
});

add_task(async function test_pointer_selection_cleared_over_gap() {
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

      const listItemElems = itemsBox.querySelectorAll(".autocomplete-row-item");

      // hover a row to select it with the pointer
      EventUtils.synthesizeMouseAtCenter(listItemElems[1], {
        type: "mousemove",
      });
      await TestUtils.waitForCondition(() => {
        return itemsBox.hasAttribute("pointerselected");
      });

      // a mousemove landing between rows (over the richlistbox, not a row)
      // clears the pointer selection so nothing stays invisibly selected
      autoCompletePopup.mLastMoveTime = 0;
      itemsBox.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));

      Assert.equal(
        autoCompletePopup.selectedIndex,
        -1,
        "pointer selection should be cleared when the pointer is between rows"
      );
      Assert.ok(
        !itemsBox.hasAttribute("pointerselected"),
        "pointerselected should be removed when the pointer is between rows"
      );
      Assert.equal(
        autoCompletePopup.mousedOverIndex,
        -1,
        "mousedOverIndex should be reset when the pointer is between rows"
      );

      // close popup
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.blur();
      });
    }
  );
});

add_task(async function test_pointerselected_reflects_selection_mode() {
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
      const listItemElems = itemsBox.querySelectorAll(".autocomplete-row-item");
      const firstRowItem = listItemElems[0].querySelector(
        "autocomplete-row-item"
      );
      Assert.ok(
        firstRowItem.selected,
        "keyboard-selected row item is selected"
      );
      Assert.ok(
        !firstRowItem.hasAttribute("pointerselected"),
        "keyboard selection should not mark the row item pointerselected"
      );

      // move the pointer over a different item
      EventUtils.synthesizeMouseAtCenter(listItemElems[1], {
        type: "mousemove",
      });
      const secondRowItem = listItemElems[1].querySelector(
        "autocomplete-row-item"
      );
      await TestUtils.waitForCondition(() => secondRowItem.selected);
      Assert.ok(
        secondRowItem.hasAttribute("pointerselected"),
        "pointer selection should mark the row item pointerselected"
      );
      Assert.ok(
        !firstRowItem.selected,
        "the keyboard-selected row item should be deselected"
      );

      // close popup
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.blur();
      });
    }
  );
});

add_task(async function test_scroll_reset_on_fresh_search() {
  const url = `data:text/html,<input type="text" name="field1">`;
  await BrowserTestUtils.withNewTab(
    { gBrowser, url },
    async function (browser) {
      const {
        autoCompletePopup,
        autoCompletePopup: { richlistbox: itemsBox },
      } = browser;
      // Enough entries to overflow the visible rows and show a scrollbar. They
      // share the "value" prefix so a fresh search for "v" still matches all.
      const mockHistory = Array.from({ length: 20 }, (_, i) => ({
        op: "add",
        fieldname: "field1",
        value: `value${String(i).padStart(2, "0")}`,
      }));

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

      // keyboard-navigate down far enough to scroll the list
      for (let i = 0; i < 12; i++) {
        await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      }
      const scrolledTop = itemsBox.scrollTop;
      Assert.greater(
        scrolledTop,
        0,
        "keyboard navigation should scroll the list down"
      );

      const rowHeight = itemsBox
        .querySelector(".autocomplete-row-item")
        .getBoundingClientRect().height;

      // typing another character refetches the list (a fresh search that still
      // matches every entry); the list should scroll back to the top.
      await BrowserTestUtils.synthesizeKey("v", {}, browser);
      await TestUtils.waitForCondition(
        () => itemsBox.scrollTop < rowHeight,
        "a fresh search should scroll the list back to the top (bug 406194)"
      );
      Assert.ok(
        autoCompletePopup.popupOpen,
        "the popup should stay open across the fresh search"
      );
      Assert.equal(
        autoCompletePopup.matchCount,
        mockHistory.length,
        "the fresh search should still match every entry"
      );

      // close popup
      await SpecialPowers.spawn(browser, [], async function () {
        const input = content.document.querySelector("input");

        input.blur();
      });
    }
  );
});
