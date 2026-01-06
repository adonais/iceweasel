/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const {
  constructRealTimeInfoInjectionMessage,
  getLocalIsoTime,
  getCurrentTabMetadata,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(function test_getLocalIsoTime_returns_offset_timestamp() {
  const sb = sinon.createSandbox();
  const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });
  try {
    const iso = getLocalIsoTime();
    Assert.ok(
      typeof iso === "string" && !!iso.length,
      "Should return a non-empty string"
    );
    Assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(iso),
      "Should include date, time (up to seconds), and timezone offset"
    );
  } finally {
    clock.restore();
    sb.restore();
  }
});

add_task(async function test_getCurrentTabMetadata_fetch_fallback() {
  const sb = sinon.createSandbox();
  const tracker = { getTopWindow: sb.stub() };
  const pageData = {
    getCached: sb.stub(),
    fetchPageData: sb.stub(),
  };
  const fakeBrowser = {
    currentURI: { spec: "https://example.com/article" },
    contentTitle: "",
    documentTitle: "Example Article",
  };

  tracker.getTopWindow.returns({
    gBrowser: { selectedBrowser: fakeBrowser },
  });
  pageData.getCached.returns(null);
  const fetchStub = pageData.fetchPageData.resolves({
    description: "Fetched description",
  });

  try {
    const result = await getCurrentTabMetadata({
      BrowserWindowTracker: tracker,
      PageDataService: pageData,
    });
    Assert.deepEqual(result, {
      url: "https://example.com/article",
      title: "Example Article",
      description: "Fetched description",
    });
    Assert.ok(fetchStub.calledOnce, "Should fetch description when not cached");
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_constructRealTimeInfoInjectionMessage_with_tab_info() {
    const sb = sinon.createSandbox();
    const tracker = { getTopWindow: sb.stub() };
    const pageData = {
      getCached: sb.stub(),
      fetchPageData: sb.stub(),
    };
    const locale = Services.locale.appLocaleAsBCP47;
    const fakeBrowser = {
      currentURI: { spec: "https://mozilla.org" },
      contentTitle: "Mozilla",
      documentTitle: "Mozilla",
    };

    tracker.getTopWindow.returns({
      gBrowser: { selectedBrowser: fakeBrowser },
    });
    pageData.getCached.returns({
      description: "Internet for people",
    });
    const fetchStub = pageData.fetchPageData;
    const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });

    try {
      const message = await constructRealTimeInfoInjectionMessage({
        BrowserWindowTracker: tracker,
        PageDataService: pageData,
      });
      Assert.equal(message.role, "system", "Should return system role");
      Assert.ok(
        message.content.includes(`Locale: ${locale}`),
        "Should include locale"
      );
      Assert.ok(
        message.content.includes("Current active browser tab details:"),
        "Should include tab details heading"
      );
      Assert.ok(
        message.content.includes("- URL: https://mozilla.org"),
        "Should include tab URL"
      );
      Assert.ok(
        message.content.includes("- Title: Mozilla"),
        "Should include tab title"
      );
      Assert.ok(
        message.content.includes("- Description: Internet for people"),
        "Should include tab description"
      );
      Assert.ok(
        fetchStub.notCalled,
        "Should not fetch when cached data exists"
      );
    } finally {
      clock.restore();
      sb.restore();
    }
  }
);

add_task(
  async function test_constructRealTimeInfoInjectionMessage_without_tab_info() {
    const sb = sinon.createSandbox();
    const tracker = { getTopWindow: sb.stub() };
    const pageData = {
      getCached: sb.stub(),
      fetchPageData: sb.stub(),
    };
    const locale = Services.locale.appLocaleAsBCP47;

    tracker.getTopWindow.returns(null);
    const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });

    try {
      const message = await constructRealTimeInfoInjectionMessage({
        BrowserWindowTracker: tracker,
        PageDataService: pageData,
      });
      Assert.ok(
        message.content.includes("No active browser tab."),
        "Should mention missing tab info"
      );
      Assert.ok(
        !message.content.includes("- URL:"),
        "Should not include empty tab fields"
      );
      Assert.ok(
        message.content.includes(`Locale: ${locale}`),
        "Should include system locale"
      );
    } finally {
      clock.restore();
      sb.restore();
    }
  }
);
