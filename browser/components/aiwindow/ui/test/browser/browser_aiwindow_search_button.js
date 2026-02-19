/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SearchUIUtils: "moz-src:///browser/components/search/SearchUIUtils.sys.mjs",
  SearchUITestUtils: "resource://testing-common/SearchUITestUtils.sys.mjs",
  SearchTestUtils: "resource://testing-common/SearchTestUtils.sys.mjs",
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
});

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const TEST_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_chat_search_button.html";

/**
 * Test the chat search hanfoff button params and if it was clicked
 */
add_task(async function test_chat_search_button() {
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("ai-chat-message");
      const aiChatMessage = content.document.querySelector("ai-chat-message");

      let resolveEvent;
      content.wrappedJSObject.__aiwindowChatSearchEvent = null;
      content.wrappedJSObject.__aiwindowSearchPromise = new Promise(
        r => (resolveEvent = r)
      );

      content.document.addEventListener(
        "AIWindow:chat-search",
        e => {
          content.wrappedJSObject.__aiwindowChatSearchEvent = {
            type: e?.type,
            detail: e?.detail,
          };
          resolveEvent();
        },
        { once: true }
      );

      Assert.ok(aiChatMessage, "ai-chat-message exists");

      const chatSearchButtonHost = aiChatMessage.shadowRoot.querySelector(
        "ai-chat-search-button"
      );
      const chatSearchButton = chatSearchButtonHost.shadowRoot.querySelector(
        "#ai-chat-search-button"
      );
      Assert.ok(chatSearchButtonHost, "ai-chat-search-button exists");
      Assert.equal(
        chatSearchButtonHost.getAttribute("label"),
        "Ada Lovelace",
        "Button has correct label"
      );
      Assert.equal(
        chatSearchButtonHost.getAttribute("query"),
        "Ada Lovelace",
        "Button has correct query"
      );
      EventUtils.synthesizeMouseAtCenter(chatSearchButton, {}, content);
    });

    await SpecialPowers.spawn(browser, [], async () => {
      await content.wrappedJSObject.__aiwindowSearchPromise;
    });

    let event = browser.contentWindow.wrappedJSObject.__aiwindowChatSearchEvent;

    Assert.equal(
      event.type,
      "AIWindow:chat-search",
      "AIWindow:chat-search event was fired"
    );

    Assert.equal(
      event.detail,
      "Ada Lovelace",
      "AIWindow:chat-search event includes the correct query"
    );
  });
});

/**
 * Test the telemetry from the performSearch function called by the search handoff button
 */
add_task(async function test_telemetry_chat_search_button() {
  lazy.SearchUITestUtils.init(this);
  lazy.SearchTestUtils.init(this);
  await lazy.SearchTestUtils.updateRemoteSettingsConfig([
    { identifier: "other" },
  ]);

  const loadSearchSpy = sinon.spy(lazy.SearchUIUtils, "loadSearch");
  const { topChromeWindow } = window.browsingContext;

  await lazy.AIWindow.performSearch("Ada Lovelace", topChromeWindow);

  Assert.ok(
    loadSearchSpy.calledOnce,
    "SearchUIUtils.loadSearch was called from AI Window Perform Search"
  );

  const args = loadSearchSpy.firstCall.args[0];
  Assert.equal(
    args.searchText,
    "Ada Lovelace",
    "Correct query/searchText passed"
  );
  Assert.equal(
    args.sapSource,
    "aiwindow_assistant",
    "AI Window sapSource passed"
  );

  await lazy.SearchUITestUtils.assertSAPTelemetry({
    engineId: "other",
    engineName: "other",
    source: "aiwindow_assistant",
    count: 1,
  });

  loadSearchSpy.restore();
});
