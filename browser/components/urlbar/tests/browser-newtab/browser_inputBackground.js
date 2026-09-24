/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The input isn't in a toolbar in a page, so its background has to carry it on
// its own instead of letting what's behind it through.

"use strict";

const MIN_OPACITY = 0.9;

add_task(async function inputBackgroundOpacity() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  let colors = await NewtabSearchbarTestUtils.spawn(
    tab.linkedBrowser,
    [],
    async () => {
      let utils = NewtabSearchbarContentTestUtils;
      let bar = utils.getUrlbar(content);
      let background = bar.querySelector(".urlbar-background");
      let read = () => content.getComputedStyle(background).backgroundColor;
      let unfocused = read();

      bar.focus();
      await ContentTaskUtils.waitForCondition(
        () => utils.getState(content).focused,
        "the input takes focus"
      );

      return { unfocused, focused: read() };
    }
  );

  for (let [state, color] of Object.entries(colors)) {
    // A fully opaque color serializes without an alpha channel.
    let opacity = color.startsWith("rgba(")
      ? parseFloat(color.split(",").at(-1))
      : 1;
    Assert.greaterOrEqual(
      opacity,
      MIN_OPACITY,
      `the ${state} input's background is opaque enough: ${color}`
    );
  }

  BrowserTestUtils.removeTab(tab);
});
