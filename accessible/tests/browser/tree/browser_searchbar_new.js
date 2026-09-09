/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../mochitest/role.js */
loadScripts({ name: "role.js", dir: MOCHITESTS_DIR });

ChromeUtils.defineESModuleGetters(this, {
  CustomizableUITestUtils:
    "resource://testing-common/CustomizableUITestUtils.sys.mjs",
  SearchbarTestUtils: "resource://testing-common/UrlbarTestUtils.sys.mjs",
  SearchTestUtils: "resource://testing-common/SearchTestUtils.sys.mjs",
});

let searchbar;

add_setup(async function () {
  SearchbarTestUtils.init(this);
  SearchTestUtils.init(this);
  // The default engine's suggestions would require network access.
  await SearchTestUtils.updateRemoteSettingsConfig([{ identifier: "engine1" }]);

  let gCUITestUtils = new CustomizableUITestUtils(window);
  searchbar = await gCUITestUtils.addSearchBar();
  registerCleanupFunction(() => gCUITestUtils.removeSearchBar());

  // The searchbar shows itself as a popover once it has set up its breakout
  // dimensions, which happens off a document flush and an animation frame. The
  // background is only part of the a11y tree while the popover is open, so the
  // tree isn't stable until this settles.
  await TestUtils.waitForCondition(() => searchbar.matches(":popover-open"));
});

// eslint-disable-next-line camelcase
add_task(async function test_searchbar_a11y_tree() {
  testAccessibleTree(searchbar, {
    role: ROLE_GROUPING,

    children: [
      // background
      {
        role: ROLE_SECTION,
        children: [],
      },

      // input container
      {
        role: ROLE_SECTION,

        children: [
          // search mode switcher
          {
            role: ROLE_PUSHBUTTON,
            // not testing the structure inside the switcher
          },

          // input element
          {
            role: ROLE_EDITCOMBOBOX,
            children: [],
          },

          // The go button is hidden and the result list is empty, so neither
          // shows up in the tree.
        ],
      },
    ],
  });
});

// eslint-disable-next-line camelcase
add_task(async function test_searchbar_a11y_tree_with_results() {
  await SearchbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "example",
  });
  Assert.equal(
    SearchbarTestUtils.getResultCount(window),
    1,
    "Expected a single result"
  );

  testAccessibleTree(searchbar, {
    role: ROLE_GROUPING,

    children: [
      // background
      {
        role: ROLE_SECTION,
        children: [],
      },

      // input container
      {
        role: ROLE_SECTION,

        children: [
          // search mode switcher
          {
            role: ROLE_PUSHBUTTON,
            // not testing the structure inside the switcher
          },

          // input element
          {
            role: ROLE_EDITCOMBOBOX,
            children: [
              {
                role: ROLE_TEXT_LEAF,
                name: "example",
                children: [],
              },
            ],
          },

          // go button
          {
            role: ROLE_PUSHBUTTON,
            children: [],
          },
        ],
      },

      // result view
      {
        role: ROLE_GROUPING,

        children: [
          // result list
          {
            // XXX: See bug 2016839
            role: ROLE_LISTBOX,

            children: [
              {
                // XXX: See bug 2016839
                role: ROLE_OPTION,
                // not testing the structure inside the result
              },
            ],
          },
        ],
      },
    ],
  });

  await SearchbarTestUtils.promisePopupClose(window);
  searchbar.handleRevert();
});
