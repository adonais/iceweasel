/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { getTabList, MAX_TABS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(function test_getTabList_filters_non_web_urls() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const fakeWindow = createFakeWindow([
      createFakeTab("https://example.com", "Example", 1000),
      createFakeTab("about:preferences", "Preferences", 2000),
      createFakeTab("about:config", "Config", 3000),
      createFakeTab("https://mozilla.org", "Mozilla", 4000),
      createFakeTab("about:blank", "Blank", 5000),
      createFakeTab("chrome://browser/content/browser.xhtml", "Chrome", 6000),
      createFakeTab("moz-extension://abc/page.html", "Extension", 7000),
      createFakeTab("file:///home/user/doc.html", "Local File", 8000),
      createFakeTab("data:text/html,hello", "Data URL", 9000),
    ]);

    sb.stub(BrowserWindowTracker, "orderedWindows").get(() => [fakeWindow]);

    const tabs = getTabList();

    Assert.equal(
      tabs.length,
      2,
      "Should only return http/https tabs (filtered 7)"
    );
    Assert.equal(
      tabs[0].url,
      "https://mozilla.org",
      "Should return mozilla.org"
    );
    Assert.equal(tabs[1].url, "https://example.com", "Should return example");
    Assert.ok(
      tabs.every(
        t => t.url.startsWith("https://") || t.url.startsWith("http://")
      ),
      "Only http/https URLs in results"
    );
  } finally {
    sb.restore();
  }
});

add_task(function test_getTabList_pagination() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();
  const FAKE_TAB_URL = "http://www.myFakeTabUrl.com";

  try {
    const tabs = [];
    for (let i = 0; i < MAX_TABS + 20; i++) {
      tabs.push(
        createFakeTab(`https://example${i}.com`, `Example ${i}`, i * 1000)
      );
    }
    tabs.push(
      createFakeTab(FAKE_TAB_URL, "This is so fake", (MAX_TABS + 20) * 1000)
    );
    const fakeWindow = createFakeWindow(tabs);

    sb.stub(BrowserWindowTracker, "orderedWindows").get(() => [fakeWindow]);

    // Test default limit
    const defaultResult = getTabList();
    Assert.equal(
      defaultResult.length,
      MAX_TABS,
      `Should return at most ${MAX_TABS} tabs`
    );
    Assert.equal(
      defaultResult[0].url,
      FAKE_TAB_URL,
      "First tab should be most recent"
    );
  } finally {
    sb.restore();
  }
});

add_task(function test_getTabList_custom_pagination() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();
  const FAKE_TAB_URL = "http://www.myFakeTabUrl.com";

  try {
    const tabs = [];
    for (let i = 0; i < MAX_TABS + 20; i++) {
      tabs.push(
        createFakeTab(`https://example${i}.com`, `Example ${i}`, i * 1000)
      );
    }
    tabs.push(
      createFakeTab(FAKE_TAB_URL, "This is so fake", (MAX_TABS + 20) * 1000)
    );
    const fakeWindow = createFakeWindow(tabs);

    sb.stub(BrowserWindowTracker, "orderedWindows").get(() => [fakeWindow]);

    // Test custom limit
    const CUSTOM_LIMIT = 4;

    const defaultResult = getTabList(CUSTOM_LIMIT);
    Assert.equal(
      defaultResult.length,
      4,
      `Should return at most ${CUSTOM_LIMIT} tabs`
    );
    Assert.equal(
      defaultResult[0].url,
      FAKE_TAB_URL,
      "First tab should be most recent"
    );
  } finally {
    sb.restore();
  }
});

add_task(function test_getTabList_filters_non_ai_windows() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const aiWindow = createFakeWindow(
      [
        createFakeTab("https://ai1.com", "AI Tab 1", 1000),
        createFakeTab("https://ai2.com", "AI Tab 2", 2000),
      ],
      false,
      true
    );

    const classicWindow = createFakeWindow(
      [
        createFakeTab("https://classic1.com", "Classic Tab 1", 3000),
        createFakeTab("https://classic2.com", "Classic Tab 2", 4000),
      ],
      false,
      false
    );

    sb.stub(BrowserWindowTracker, "orderedWindows").get(() => [
      classicWindow,
      aiWindow,
    ]);

    const tabs = getTabList();

    Assert.equal(
      tabs.length,
      2,
      "Should only return tabs from AI Windows (filtered 2 classic tabs)"
    );
    Assert.equal(tabs[0].url, "https://ai2.com", "Most recent AI tab");
    Assert.equal(tabs[1].url, "https://ai1.com", "Second AI tab");
    Assert.ok(
      !tabs.some(t => t.url.includes("classic")),
      "No classic window tabs in results"
    );
  } finally {
    sb.restore();
  }
});
