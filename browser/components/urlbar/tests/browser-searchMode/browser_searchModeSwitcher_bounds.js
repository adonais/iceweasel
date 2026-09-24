/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Verifies that the search mode switcher's button fills its host exactly and
// stays within the input container, at every UI density and the root font
// sizes that leave it the least room.

const UI_DENSITIES = [
  { name: "normal", value: 0 },
  { name: "compact", value: 1 },
  { name: "touch", value: 2 },
];
const ROOT_FONT_SIZES = ["12px", "14px", "16px", "18px"];

function measure() {
  let switcher = gURLBar.querySelector(".searchmode-switcher");
  let button = switcher.shadowRoot.querySelector(".button-background");
  return {
    buttonHost: switcher.getBoundingClientRect(),
    button: button.getBoundingClientRect(),
    inputContainer: gURLBar
      .querySelector(".urlbar-input-container")
      .getBoundingClientRect(),
  };
}

add_setup(async function setup() {
  registerCleanupFunction(() => {
    document.documentElement.style.fontSize = "";
  });
});

add_task(async function buttonFillsItsHost() {
  await UrlbarTestUtils.activateSearchModeSwitcherItem(
    window,
    ".search-button-bookmarks"
  );
  await UrlbarTestUtils.assertSearchMode(window, {
    source: UrlbarShared.RESULT_SOURCE.BOOKMARKS,
    entry: "searchbutton",
  });
  Assert.ok(
    BrowserTestUtils.isVisible(
      gURLBar.querySelector(".searchmode-switcher-title")
    ),
    "The switcher shows its label"
  );

  for (let density of UI_DENSITIES) {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.uidensity", density.value]],
    });

    for (let fontSize of ROOT_FONT_SIZES) {
      document.documentElement.style.fontSize = fontSize;
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      let where = `at ${density.name} density with a ${fontSize} root font`;
      let { buttonHost, button, inputContainer } = measure();
      Assert.equal(
        button.top,
        buttonHost.top,
        `Button meets the top of its host ${where}`
      );
      Assert.equal(
        button.bottom,
        buttonHost.bottom,
        `Button meets the bottom of its host ${where}`
      );
      Assert.greater(
        button.top,
        inputContainer.top,
        `Button stays below the top of the input container ${where}`
      );
      Assert.less(
        button.bottom,
        inputContainer.bottom,
        `Button stays above the bottom of the input container ${where}`
      );
    }
  }

  await UrlbarTestUtils.exitSearchMode(window);
  await UrlbarTestUtils.promisePopupClose(window);
});
