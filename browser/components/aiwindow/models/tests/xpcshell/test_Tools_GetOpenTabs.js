/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { sanitizeUntrustedContent } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);

const { getOpenTabs } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

function setupPageDataServiceMock(sandbox, descriptionMap = {}) {
  const PageDataService = ChromeUtils.importESModule(
    "moz-src:///browser/components/pagedata/PageDataService.sys.mjs"
  ).PageDataService;

  sandbox.stub(PageDataService, "getCached").callsFake(url => {
    if (url in descriptionMap) {
      return { description: descriptionMap[url] };
    }
    return null;
  });

  sandbox.stub(PageDataService, "fetchPageData").callsFake(async url => {
    if (url in descriptionMap) {
      return { description: descriptionMap[url] };
    }
    return null;
  });
}

add_task(async function test_getOpenTabs_basic() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const fakeWindow = createFakeWindow([
      createFakeTab("https://example.com", "Example", 1000),
      createFakeTab("https://mozilla.org", "Mozilla", 2000),
      createFakeTab("https://firefox.com", "Firefox", 3000),
    ]);

    sb.stub(BrowserWindowTracker, "orderedWindows").get(() => [fakeWindow]);
    setupPageDataServiceMock(sb, {
      "https://firefox.com": "Firefox browser homepage",
      "https://mozilla.org": "Mozilla organization site",
    });

    const tabs = await getOpenTabs(makeConversation());

    Assert.equal(tabs.length, 3, "Should return all 3 tabs");
    Assert.equal(tabs[0].url, "https://firefox.com", "Most recent tab first");
    Assert.equal(
      tabs[0].title,
      sanitizeUntrustedContent("Firefox"),
      "Title should match"
    );
    // @todo Bug2009194
    // Assert.equal(
    //   tabs[0].description,
    //   "Firefox browser homepage",
    //   "Description should be fetched"
    // );
    Assert.equal(tabs[1].url, "https://mozilla.org", "Second most recent tab");
    // @todo Bug2009194
    // Assert.equal(
    //   tabs[1].description,
    //   "Mozilla organization site",
    //   "Description should be fetched"
    // );
    Assert.equal(tabs[2].url, "https://example.com", "Least recent tab");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_sets_security_flags() {
  const conversation = makeConversation();
  await getOpenTabs(conversation);
  conversation.securityProperties.commit();

  Assert.strictEqual(
    conversation.securityProperties.privateData,
    true,
    "private_data true"
  );
  Assert.strictEqual(
    conversation.securityProperties.untrustedInput,
    false,
    "untrusted_input false"
  );
});

add_task(async function test_getOpenTabs_allowed_when_flags_set() {
  const conversation = makeConversation({
    privateData: true,
    untrustedInput: true,
  });
  const tabs = await getOpenTabs(conversation);

  Assert.ok(Array.isArray(tabs), "returns array, not refusal");
});

add_task(async function test_getOpenTabs_return_structure() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const fakeWindow = createFakeWindow([
      createFakeTab("https://test.com", "Test Page", 1000),
    ]);

    sb.stub(BrowserWindowTracker, "orderedWindows").get(() => [fakeWindow]);
    setupPageDataServiceMock(sb, {
      "https://test.com": "A test page description",
    });

    const tabs = await getOpenTabs(makeConversation());

    Assert.equal(tabs.length, 1, "Should return one tab");

    const tab = tabs[0];
    Assert.ok("url" in tab, "Tab should have url property");
    Assert.ok("title" in tab, "Tab should have title property");
    Assert.ok("lastAccessed" in tab, "Tab should have lastAccessed property");

    Assert.equal(typeof tab.url, "string", "url should be a string");
    Assert.equal(typeof tab.title, "string", "title should be a string");
    Assert.equal(
      typeof tab.lastAccessed,
      "number",
      "lastAccessed should be a number"
    );

    Assert.equal(tab.url, "https://test.com", "url value correct");
    Assert.equal(
      tab.title,
      sanitizeUntrustedContent("Test Page"),
      "title value correct"
    );
    // @todo Bug2009194
    // Assert.equal(
    //   tab.description,
    //   "A test page description",
    //   "description should be fetched from PageDataService"
    // );
    Assert.equal(tab.lastAccessed, 1000, "lastAccessed value correct");
  } finally {
    sb.restore();
  }
});
