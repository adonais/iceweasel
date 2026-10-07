/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Variant B of the New Tab search bar puts the search engine button on its own
// row above the input and paints a card behind both, without changing the slot
// the page gives the search bar.

"use strict";

/**
 * The geometry of the search bar and its parts once the button shows the default
 * engine.
 *
 * @param {MozBrowser} browser
 *   The browser about:newtab is in.
 * @returns {Promise<object>}
 */
async function getLayout(browser) {
  return NewtabSearchbarTestUtils.spawn(browser, [], async () => {
    let bar = content.document.querySelector("moz-urlbar");
    await ContentTaskUtils.waitForCondition(
      () => bar.hasAttribute("variant-b"),
      "waiting for the search bar to be in variant B"
    );
    let button = bar.querySelector(".searchmode-switcher");
    await ContentTaskUtils.waitForCondition(
      () => button.hasAttribute("wordmark"),
      "waiting for the button to show the engine's wordmark"
    );
    let rect = el => {
      let { left, top, right, bottom, width, height } =
        el.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    return {
      variantA: bar.hasAttribute("variant-a"),
      buttonType: button.getAttribute("type"),
      wordmark: button.getAttribute("wordmark"),
      slot: rect(bar.parentNode),
      bar: rect(bar),
      inputContainer: rect(bar.querySelector(".urlbar-input-container")),
      background: rect(bar.querySelector(".urlbar-background")),
      button: rect(button),
      card: (() => {
        let { position, top, bottom, left, right, backgroundColor } =
          content.getComputedStyle(bar, "::before");
        return { position, top, bottom, left, right, backgroundColor };
      })(),
    };
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.newtab.variantA", true],
      ["browser.urlbar.newtab.variantB", true],
    ],
  });
  // New Tab's registrant hands the attribute to pages built from here on, so
  // drop the page it preloaded before the prefs were set.
  NewTabPagePreloading.removePreloadedBrowser(window);
  await SearchTestUtils.updateRemoteSettingsConfig([{ identifier: "google" }]);
});

add_task(async function variantBLayout() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let layout = await getLayout(tab.linkedBrowser);

  Assert.ok(!layout.variantA, "Variant B takes precedence over variant A");
  Assert.equal(layout.buttonType, "ghost", "The button is a ghost button");
  Assert.equal(layout.wordmark, "google", "The button shows the wordmark");

  // The page's slot is the input's box; the search bar's card is drawn out of
  // it on every side without moving it.
  for (let part of ["bar", "inputContainer", "background"]) {
    for (let edge of ["left", "top", "right", "bottom"]) {
      Assert.equal(
        Math.round(layout[part][edge]),
        Math.round(layout.slot[edge]),
        `The ${part}'s ${edge} edge is the slot's`
      );
    }
  }
  Assert.equal(layout.card.position, "absolute", "The card is positioned");
  Assert.less(
    parseFloat(layout.card.top),
    layout.slot.top - layout.button.bottom - layout.button.height,
    "The card starts above the button"
  );
  for (let edge of ["bottom", "left", "right"]) {
    Assert.less(
      parseFloat(layout.card[edge]),
      0,
      `The card overhangs the slot at the ${edge}`
    );
  }
  Assert.notEqual(
    layout.card.backgroundColor,
    "rgba(0, 0, 0, 0)",
    "The card has a background"
  );

  // The button sits on its own row above the input, centered over it.
  Assert.lessOrEqual(
    layout.button.bottom,
    layout.slot.top,
    "The button is above the input"
  );
  Assert.less(
    Math.abs(
      layout.button.left +
        layout.button.width / 2 -
        (layout.slot.left + layout.slot.width / 2)
    ),
    1,
    "The button is centered over the input"
  );

  BrowserTestUtils.removeTab(tab);
});
