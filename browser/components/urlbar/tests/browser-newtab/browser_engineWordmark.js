/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Variant A of the New Tab search bar shows a known engine's wordmark in the
// search engine button, in place of the engine's icon and name. Any other
// engine keeps its icon and is named next to it.

"use strict";

/**
 * What the search engine button shows once it has caught up with the default
 * engine.
 *
 * @param {MozBrowser} browser
 *   The browser about:newtab is in.
 * @param {string} engineName
 *   The name of the engine the button is expected to show.
 * @param {?string} [expectedWordmark]
 *   The wordmark the button is expected to show, or null when it is expected
 *   to name the engine instead. The page may have been preloaded with the
 *   previous engine, so a wordmark of just any engine isn't enough.
 * @returns {Promise<object>}
 */
async function getButtonState(browser, engineName, expectedWordmark = null) {
  return NewtabSearchbarTestUtils.spawn(
    browser,
    [engineName, expectedWordmark],
    async (name, expected) => {
      await ContentTaskUtils.waitForCondition(
        () =>
          content.document
            .querySelector("moz-urlbar")
            .hasAttribute("variant-a"),
        "waiting for the search bar to be in variant A"
      );

      let button = content.document.querySelector(".searchmode-switcher");
      let title = button.querySelector(".searchmode-switcher-title");
      let wordmark = button.querySelector(".searchmode-switcher-wordmark");
      await ContentTaskUtils.waitForCondition(
        () =>
          expected
            ? button.getAttribute("wordmark") == expected
            : !button.hasAttribute("wordmark") &&
              title.textContent.trim() == name,
        `waiting for the button to show ${name}`
      );
      let wordmarkRect = wordmark.getBoundingClientRect();
      return {
        wordmark: button.getAttribute("wordmark"),
        iconsrc: button.getAttribute("iconsrc"),
        title: title.textContent,
        titleVisible: !!title.getClientRects().length,
        wordmarkWidth: wordmarkRect.width,
        wordmarkHeight: wordmarkRect.height,
        wordmarkImage: content.getComputedStyle(wordmark).backgroundImage,
      };
    }
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.newtab.variantA", true]],
  });
  // New Tab's registrant hands the attribute to pages built from here on, so
  // drop the page it preloaded before the pref was set.
  NewTabPagePreloading.removePreloadedBrowser(window);
});

// The engines whose wordmark the search bar has an image for.
add_task(async function knownEngines() {
  for (let [identifier, wordmark] of [
    ["bing", "bing"],
    ["ddg", "ddg"],
    ["ebay-uk", "ebay"],
    ["google", "google"],
    ["perplexity", "perplexity"],
    ["startpage", "startpage"],
    ["wikipedia-fr", "wikipedia"],
  ]) {
    await SearchTestUtils.updateRemoteSettingsConfig([{ identifier }]);

    let tab = await NewtabSearchbarTestUtils.openNewTabPage();
    let state = await getButtonState(tab.linkedBrowser, identifier, wordmark);

    Assert.equal(state.wordmark, wordmark, `${identifier} shows its wordmark`);
    Assert.equal(state.iconsrc, null, "The engine's icon is not shown");
    Assert.ok(!state.titleVisible, "The engine is not named");
    Assert.stringContains(
      state.wordmarkImage,
      "/engine-wordmarks/",
      "The wordmark image is set"
    );
    Assert.greater(state.wordmarkHeight, 0, "The wordmark box has a height");
    Assert.greater(
      state.wordmarkWidth,
      state.wordmarkHeight,
      "The wordmark box takes the image's aspect ratio"
    );

    BrowserTestUtils.removeTab(tab);
  }
});

// Any other engine keeps its icon and is named next to it.
add_task(async function otherEngine() {
  await SearchTestUtils.updateRemoteSettingsConfig([
    { identifier: "otherengine" },
  ]);

  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let state = await getButtonState(tab.linkedBrowser, "otherengine");

  Assert.equal(state.wordmark, null, "No wordmark is shown");
  Assert.ok(state.iconsrc, "The engine's icon is shown");
  Assert.equal(state.title, "otherengine", "The engine is named");
  Assert.ok(state.titleVisible, "The engine's name is visible");

  BrowserTestUtils.removeTab(tab);
});

// The wordmark images' brand colors may not meet a contrast preference, so the
// button shows the engine's icon and name instead, and switches over when the
// preference changes while the page is open.
add_task(async function noWordmarkForPrefersContrast() {
  await SearchTestUtils.updateRemoteSettingsConfig([
    { identifier: "wikipedia" },
  ]);

  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let state = await getButtonState(tab.linkedBrowser, "wikipedia", "wikipedia");
  Assert.equal(state.wordmark, "wikipedia", "The wordmark is shown at first");

  await SpecialPowers.pushPrefEnv({
    set: [
      ["ui.useAccessibilityTheme", 1],
      ["browser.display.document_color_use", 2],
    ],
  });
  await NewtabSearchbarTestUtils.spawn(tab.linkedBrowser, [], async () => {
    let button = content.document.querySelector(".searchmode-switcher");
    await ContentTaskUtils.waitForCondition(
      () => !button.hasAttribute("wordmark"),
      "waiting for the wordmark to go away"
    );
  });
  state = await getButtonState(tab.linkedBrowser, "wikipedia");
  Assert.equal(state.wordmark, null, "No wordmark is shown");
  Assert.ok(state.iconsrc, "The engine's icon is shown");
  Assert.equal(state.title, "wikipedia", "The engine is named");
  Assert.ok(state.titleVisible, "The engine's name is visible");
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();

  NewTabPagePreloading.removePreloadedBrowser(window);
  tab = await NewtabSearchbarTestUtils.openNewTabPage();
  state = await getButtonState(tab.linkedBrowser, "wikipedia", "wikipedia");
  Assert.equal(state.wordmark, "wikipedia", "The wordmark is back");
  BrowserTestUtils.removeTab(tab);
});
