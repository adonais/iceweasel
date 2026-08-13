/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_JSON_URL = URL_ROOT + "breadcrumb.json";
const TOTAL_ROWS = 4470;

add_task(async function () {
  info("Test jsonview breadcrumbs");

  await addJsonViewTab(TEST_JSON_URL);

  info("Check that the breadcrumb is not rendered by default");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb, null, "breadcrumb is not rendered");
  });

  info("Expand all nodes in the Json Panel");
  await clickJsonNode(".jsonPanelBox .toolbar button.expand");

  info("Check that the JSON tree is rendered correctly");
  const count = await getElementCount(".jsonPanelBox .treeTable .treeRow");
  is(count, TOTAL_ROWS, "There must be expected number of rows");

  info("Check that the breadcrumb is displayed when selecting a row");

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const tree = content.document.querySelector(".treeTable");
    tree.focus();
    is(tree, content.document.activeElement, "Tree should be focused");

    info("Select the first row ('strings' object)");
    content.document.querySelector(".treeRow:nth-child(1)").click();

    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb !== null, true, "breadcrumb is rendered");
    is(breadcrumb.children.length, 1, "breadcrumb has 1 child (1 item)");

    const breadcrumbItem = content.document.querySelector(".breadcrumb-item");
    is(
      breadcrumbItem.children.length,
      2,
      "breadcrumb has 2 children (1 image and 1 text)"
    );
    const breadcrumbIcon = content.document.querySelector(".breadcrumb-icon");
    is(
      breadcrumbIcon.className,
      "breadcrumb-icon breadcrumb-icon-object",
      "Breadcrumb icon is rendered"
    );
    const breadcrumbValue = content.document.querySelector(".breadcrumb-value");
    is(breadcrumbValue.textContent, "strings", "Breadcrumb value is rendered");
  });

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const tree = content.document.querySelector(".treeTable");
    tree.focus();
    is(tree, content.document.activeElement, "Tree should be focused");

    info("Select the second row ('name' string");
    content.document.querySelector(".treeRow:nth-child(2)").click();

    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb !== null, true, "breadcrumb is rendered");
    is(
      breadcrumb.children.length,
      3,
      "breadcrumb has 3 children (2 items + 1 separator)"
    );

    const breadcrumbItems =
      content.document.querySelectorAll(".breadcrumb-item");
    is(breadcrumbItems.length, 2, "2 breadcrumb items are rendered");

    const breadcrumbSeparator = content.document.querySelector(
      ".breadcrumb-separator"
    );
    is(breadcrumbSeparator !== null, true, "Separator is rendered");

    const breadcrumbIcon2 = breadcrumbItems[1].childNodes[0];
    is(
      breadcrumbIcon2.className,
      "breadcrumb-icon breadcrumb-icon-string",
      "Breadcrumb icon is rendered"
    );
    const breadcrumbValue2 = breadcrumbItems[1].childNodes[1];
    is(breadcrumbValue2.textContent, "name", "Breadcrumb value is rendered");
  });

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const tree = content.document.querySelector(".treeTable");
    tree.focus();
    is(tree, content.document.activeElement, "Tree should be focused");

    info(
      "Select the third row ('tricky\/path/with/separators' tricky key string)"
    );
    content.document.querySelector(".treeRow:nth-child(3)").click();

    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb !== null, true, "breadcrumb is rendered");
    is(
      breadcrumb.children.length,
      3,
      "breadcrumb has 3 children (2 items + 1 separator)"
    );

    const breadcrumbItems =
      content.document.querySelectorAll(".breadcrumb-item");
    is(breadcrumbItems.length, 2, "2 breadcrumb items are rendered");

    const breadcrumbSeparator = content.document.querySelector(
      ".breadcrumb-separator"
    );
    is(breadcrumbSeparator !== null, true, "Separator is rendered");

    const breadcrumbIcon2 = breadcrumbItems[1].childNodes[0];
    is(
      breadcrumbIcon2.className,
      "breadcrumb-icon breadcrumb-icon-array",
      "Breadcrumb icon is rendered"
    );
    const breadcrumbValue2 = breadcrumbItems[1].childNodes[1];
    is(
      breadcrumbValue2.textContent,
      "tricky/path/with/separators",
      "Breadcrumb value is rendered"
    );
  });

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const tree = content.document.querySelector(".treeTable");
    tree.focus();
    is(tree, content.document.activeElement, "Tree should be focused");

    info("Select the fourth row (1st item in array)");
    content.document.querySelector(".treeRow:nth-child(4)").click();

    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb !== null, true, "breadcrumb is rendered");
    is(
      breadcrumb.children.length,
      5,
      "breadcrumb has 5 children (3 items + 2 separators)"
    );

    const breadcrumbItems =
      content.document.querySelectorAll(".breadcrumb-item");
    is(breadcrumbItems.length, 3, "3 breadcrumb items are rendered");

    const breadcrumbSeparators = content.document.querySelectorAll(
      ".breadcrumb-separator"
    );
    is(breadcrumbSeparators.length, 2, "2 Separators are rendered");

    const breadcrumbIcon3 = breadcrumbItems[2].childNodes[0];
    is(
      breadcrumbIcon3.className,
      "breadcrumb-icon breadcrumb-icon-number",
      "Breadcrumb icon is rendered"
    );
    const breadcrumbValue3 = breadcrumbItems[2].childNodes[1];
    is(breadcrumbValue3.textContent, "0", "Breadcrumb value is rendered");
  });

  info("Check breadcrumb for all number types");
  await assertNumber(6, "small");
  await assertNumber(7, "big");
  await assertNumber(8, "precise");
  await assertNumber(9, "negzero");
  await assertNumber(10, "zero");
  await assertNumber(11, "exp");

  info("Check breadcrumb for boolean values");
  await assertBoolean(13, "true");
  await assertBoolean(14, "false");

  info("Check breadcrumb for null value");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const tree = content.document.querySelector(".treeTable");
    tree.focus();
    is(tree, content.document.activeElement, "Tree should be focused");

    info("Select the 15th row (null value)");
    content.document.querySelector(".treeRow:nth-child(15)").click();

    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb !== null, true, "breadcrumb is rendered");
    is(breadcrumb.children.length, 1, "breadcrumb has 1 child (1 item)");

    const breadcrumbItem =
      content.document.querySelectorAll(".breadcrumb-item");
    is(breadcrumbItem.length, 1, "1 breadcrumb items is rendered");

    const breadcrumbIcon = breadcrumbItem[0].childNodes[0];
    is(
      breadcrumbIcon.className,
      "breadcrumb-icon breadcrumb-icon-null",
      "Breadcrumb icon is rendered"
    );
    const breadcrumbValue = breadcrumbItem[0].childNodes[1];
    is(breadcrumbValue.textContent, "null", "Breadcrumb value is rendered");
  });

  info("Check breadcrumb for nested objects");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const tree = content.document.querySelector(".treeTable");
    tree.focus();
    is(tree, content.document.activeElement, "Tree should be focused");

    info("Select the deepest row");
    content.document.querySelector(".treeRow:nth-child(21)").click();

    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb !== null, true, "breadcrumb is rendered");
    is(
      breadcrumb.children.length,
      11,
      "breadcrumb has 11 children (6 items + 5 separators)"
    );

    const breadcrumbItems =
      content.document.querySelectorAll(".breadcrumb-item");
    is(breadcrumbItems.length, 6, "6 breadcrumb items are rendered");

    const breadcrumbSeparators = content.document.querySelectorAll(
      ".breadcrumb-separator"
    );
    is(breadcrumbSeparators.length, 5, "5 Separators are rendered");

    const expected = [
      ["object", "deep"],
      ["object", "two"],
      ["array", "three"],
      ["object", "0"],
      ["object", "four"],
      ["string", "five"],
    ];

    for (let i = 0; i < 6; i++) {
      const [iconType, valueText] = expected[i];
      const breadcrumbIcon = breadcrumbItems[i].childNodes[0];
      is(
        breadcrumbIcon.className,
        `breadcrumb-icon breadcrumb-icon-${iconType}`,
        "Breadcrumb icon is rendered"
      );
      const breadcrumbValue = breadcrumbItems[i].childNodes[1];
      is(
        breadcrumbValue.textContent,
        valueText,
        "Breadcrumb value is rendered"
      );
    }
  });

  info("Check that breadcrumb skip bucket range");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const tree = content.document.querySelector(".treeTable");
    tree.focus();
    is(tree, content.document.activeElement, "Tree should be focused");

    info("Select the 5th row (bucket range)");
    content.document.querySelector(".treeRow:nth-child(25)").click();

    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb !== null, true, "breadcrumb is rendered");
    is(
      breadcrumb.children.length,
      5,
      "breadcrumb has 5 children (3 items + 2 separator)"
    );

    const breadcrumbItems =
      content.document.querySelectorAll(".breadcrumb-item");
    is(breadcrumbItems.length, 3, "3 breadcrumb items are rendered");

    const breadcrumbSeparators = content.document.querySelectorAll(
      ".breadcrumb-separator"
    );
    is(breadcrumbSeparators.length, 2, "2 breadcrumb separators are rendered");

    const expected = [
      ["breadcrumb-icon breadcrumb-icon-array", "bucket"],
      ["breadcrumb-icon breadcrumb-icon-object", "0"],
      ["breadcrumb-icon breadcrumb-icon-string", "name"],
    ];

    for (let i = 0; i < breadcrumbItems.length; i++) {
      const breadcrumbIcon = breadcrumbItems[i].childNodes[0];
      const breadcrumbValue = breadcrumbItems[i].childNodes[1];
      is(
        breadcrumbIcon.className,
        expected[i][0],
        "Breadcrumb icon is rendered"
      );
      is(
        breadcrumbValue.textContent,
        expected[i][1],
        "Breadcrumb value is rendered"
      );
    }
  });

  info("Check that breadcrumb properly react to filtering the tree");

  // XXX use proper shortcut to focus the filter box
  // as soon as bug Bug 1178771 is fixed.
  await sendString("numbers", ".jsonPanelBox .searchBox");

  // The filtering is done asynchronously so, we need to wait.
  await waitForFilter();

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const tree = content.document.querySelector(".treeTable");
    tree.focus();
    is(tree, content.document.activeElement, "Tree should be focused");

    const breadcrumb = content.document.querySelector(".json-breadcrumb");
    is(breadcrumb !== null, true, "breadcrumb is rendered");
    is(breadcrumb.children.length, 1, "breadcrumb has 1 child (1 item)");

    const breadcrumbItem = content.document.querySelector(".breadcrumb-item");
    is(breadcrumbItem !== null, true, "breadcrumb item is rendered");

    const breadcrumbIcon = breadcrumbItem.childNodes[0];
    is(
      breadcrumbIcon.className,
      "breadcrumb-icon breadcrumb-icon-object",
      "Breadcrumb icon is rendered"
    );
    const breadcrumbValue = breadcrumbItem.childNodes[1];
    is(breadcrumbValue.textContent, "numbers", "Breadcrumb value is rendered");
  });
});

async function assertBoolean(row_number, boolean_type) {
  await SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [row_number, boolean_type],
    function (row_num, bool_type) {
      const tree = content.document.querySelector(".treeTable");
      tree.focus();
      is(tree, content.document.activeElement, "Tree should be focused");

      info(`Select the ${row_num}th row ('${bool_type}' boolean)`);
      content.document.querySelector(`.treeRow:nth-child(${row_num})`).click();

      const breadcrumb = content.document.querySelector(".json-breadcrumb");
      is(breadcrumb !== null, true, "breadcrumb is rendered");
      is(
        breadcrumb.children.length,
        3,
        "breadcrumb has 3 children (2 items + 1 separator)"
      );

      const breadcrumbItems =
        content.document.querySelectorAll(".breadcrumb-item");
      is(breadcrumbItems.length, 2, "2 breadcrumb items are rendered");

      const breadcrumbSeparator = content.document.querySelector(
        ".breadcrumb-separator"
      );
      is(breadcrumbSeparator !== null, true, "Separator is rendered");

      const breadcrumbIcon2 = breadcrumbItems[1].childNodes[0];
      is(
        breadcrumbIcon2.className,
        "breadcrumb-icon breadcrumb-icon-boolean",
        "Breadcrumb icon is rendered"
      );
      const breadcrumbValue2 = breadcrumbItems[1].childNodes[1];
      is(
        breadcrumbValue2.textContent,
        bool_type,
        "Breadcrumb value is rendered"
      );
    }
  );
}

async function assertNumber(row_number, number_type) {
  await SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [row_number, number_type],
    function (row_num, num_type) {
      const tree = content.document.querySelector(".treeTable");
      tree.focus();
      is(tree, content.document.activeElement, "Tree should be focused");

      info(`Select the ${row_num}th row ('${num_type}' number)`);
      content.document.querySelector(`.treeRow:nth-child(${row_num})`).click();

      const breadcrumb = content.document.querySelector(".json-breadcrumb");
      is(breadcrumb !== null, true, "breadcrumb is rendered");
      is(
        breadcrumb.children.length,
        3,
        "breadcrumb has 3 children (2 items + 1 separator)"
      );

      const breadcrumbItems =
        content.document.querySelectorAll(".breadcrumb-item");
      is(breadcrumbItems.length, 2, "2 breadcrumb items are rendered");

      const breadcrumbSeparator = content.document.querySelector(
        ".breadcrumb-separator"
      );
      is(breadcrumbSeparator !== null, true, "Separator is rendered");

      const breadcrumbIcon2 = breadcrumbItems[1].childNodes[0];
      is(
        breadcrumbIcon2.className,
        "breadcrumb-icon breadcrumb-icon-number",
        "Breadcrumb icon is rendered"
      );
      const breadcrumbValue2 = breadcrumbItems[1].childNodes[1];
      is(
        breadcrumbValue2.textContent,
        num_type,
        "Breadcrumb value is rendered"
      );
    }
  );
}
