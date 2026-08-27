/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);

SearchTestUtils.init(this);

async function testClientSideRedirect({
  background,
  permissions,
  telemetryExpected = false,
  redirectingAppProvidedEngine = false,
  sameSiteParamChanged = null,
}) {
  Services.fog.testResetFOG();

  // Load an extension that does a client-side redirect. We expect this
  // extension to be reported in a Telemetry event when `telemetryExpected` is
  // set to `true`.
  const addonId = "some@addon-id";
  const addonVersion = "1.2.3";

  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      version: addonVersion,
      browser_specific_settings: { gecko: { id: addonId } },
      permissions,
    },
    useAddonManager: "temporary",
    background,
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  // Simulate a search (with the test search engine) by navigating to it.
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: redirectingAppProvidedEngine
        ? "https://example.org/default?pc=MOZ&q=babar"
        : "https://example.com/search?q=babar",
    },
    () => {}
  );

  await extension.unload();

  let events = Glean.addonsSearchDetection.etldChangeWebrequest.testGetValue();
  if (!telemetryExpected) {
    Assert.equal(events, null, "expected no etldChangeWebrequest events");
  } else {
    Assert.deepEqual(
      events[0]?.extra,
      {
        value: "extension",
        addonId,
        addonVersion,
        from: redirectingAppProvidedEngine ? "example.org" : "example.com",
        to: "mochi.test",
      },
      "etldChangeWebrequest event has the expected extra properties"
    );
    Assert.equal(
      events.length,
      1,
      "got the expected number of etldChangeWebrequest events"
    );
  }

  let ssr = Glean.addonsSearchDetection.sameSiteRedirect.testGetValue();
  if (sameSiteParamChanged == null) {
    Assert.equal(ssr, null, "expected no sameSiteRedirect events");
  } else {
    Assert.deepEqual(
      ssr[0]?.extra,
      {
        addonId,
        addonVersion,
        origin: "example.org",
        paramChanged: String(sameSiteParamChanged),
      },
      "sameSiteRedirect event has the expected extra properties"
    );
    Assert.equal(
      ssr.length,
      1,
      "got the expected number of sameSiteRedirect events"
    );
  }
}

add_setup(async function () {
  const searchEngineName = "test search engine";

  await SearchTestUtils.updateRemoteSettingsConfig([
    {
      identifier: "default",
      base: {
        partnerCode: "MOZ",
        urls: {
          search: {
            base: "https://example.org/default",
            searchTermParamName: "q",
            params: [{ name: "pc", value: "{partnerCode}" }],
          },
        },
      },
    },
  ]);

  await SearchTestUtils.installSearchExtension({
    name: searchEngineName,
    keyword: "test",
    search_url: "https://example.com/?q={searchTerms}",
  });

  Assert.ok(
    !!SearchService.getEngineByName(searchEngineName),
    "test search engine registered"
  );
});

add_task(function test_onBeforeRequest() {
  return testClientSideRedirect({
    background() {
      browser.webRequest.onBeforeRequest.addListener(
        () => {
          return {
            redirectUrl: "http://mochi.test:8888/",
          };
        },
        { urls: ["*://example.com/*"] },
        ["blocking"]
      );

      browser.test.sendMessage("ready");
    },
    permissions: ["webRequest", "webRequestBlocking", "*://example.com/*"],
    telemetryExpected: true,
  });
});

add_task(function test_onBeforeRequest_appProvidedEngine() {
  return testClientSideRedirect({
    background() {
      browser.webRequest.onBeforeRequest.addListener(
        () => {
          return {
            redirectUrl: "http://mochi.test:8888/",
          };
        },
        { urls: ["*://example.org/*"] },
        ["blocking"]
      );

      browser.test.sendMessage("ready");
    },
    permissions: ["webRequest", "webRequestBlocking", "*://example.org/*"],
    redirectingAppProvidedEngine: true,
    telemetryExpected: true,
  });
});

add_task(function test_onBeforeRequest_url_not_monitored() {
  // Here, we load an extension that does a client-side redirect. Because this
  // extension does not listen to the URL of the search engine registered
  // above, we don't expect this extension to be reported in a Telemetry event.
  return testClientSideRedirect({
    background() {
      browser.webRequest.onBeforeRequest.addListener(
        () => {
          return {
            redirectUrl: "http://mochi.test:8888/",
          };
        },
        { urls: ["*://google.com/*"] },
        ["blocking"]
      );

      browser.test.sendMessage("ready");
    },
    permissions: ["webRequest", "webRequestBlocking", "*://google.com/*"],
    telemetryExpected: false,
  });
});

add_task(function test_onHeadersReceived() {
  return testClientSideRedirect({
    background() {
      browser.webRequest.onHeadersReceived.addListener(
        () => {
          return {
            redirectUrl: "http://mochi.test:8888/",
          };
        },
        { urls: ["*://example.com/*"], types: ["main_frame"] },
        ["blocking"]
      );

      browser.test.sendMessage("ready");
    },
    permissions: ["webRequest", "webRequestBlocking", "*://example.com/*"],
    telemetryExpected: true,
  });
});

add_task(function test_onHeadersReceived_appProvidedEngine() {
  return testClientSideRedirect({
    background() {
      browser.webRequest.onHeadersReceived.addListener(
        () => {
          return {
            redirectUrl: "http://mochi.test:8888/",
          };
        },
        { urls: ["*://example.org/*"], types: ["main_frame"] },
        ["blocking"]
      );

      browser.test.sendMessage("ready");
    },
    permissions: ["webRequest", "webRequestBlocking", "*://example.org/*"],
    redirectingAppProvidedEngine: true,
    telemetryExpected: true,
  });
});

add_task(function test_onHeadersReceived_url_not_monitored() {
  // Here, we load an extension that does a client-side redirect. Because this
  // extension does not listen to the URL of the search engine registered
  // above, we don't expect this extension to be reported in a Telemetry event.
  return testClientSideRedirect({
    background() {
      browser.webRequest.onHeadersReceived.addListener(
        () => {
          return {
            redirectUrl: "http://mochi.test:8888/",
          };
        },
        { urls: ["*://google.com/*"], types: ["main_frame"] },
        ["blocking"]
      );

      browser.test.sendMessage("ready");
    },
    permissions: ["webRequest", "webRequestBlocking", "*://google.com/*"],
    telemetryExpected: false,
  });
});

add_task(function test_sameSiteRedirect_paramUnchanged() {
  // This test extension redirects searches within the same domain
  // without touching the `paramName`.  We don't expect normal
  // telemetry but expect the sameSiteRedirect Glean event.
  return testClientSideRedirect({
    background() {
      browser.webRequest.onBeforeRequest.addListener(
        () => {
          return {
            redirectUrl: "https://example.org/default?noise=13&pc=MOZ&q=blah",
          };
        },
        { urls: ["*://example.org/default?pc=MOZ*"] },
        ["blocking"]
      );

      browser.test.sendMessage("ready");
    },
    permissions: ["webRequest", "webRequestBlocking", "*://example.org/*"],
    redirectingAppProvidedEngine: true,
    telemetryExpected: false,
    sameSiteParamChanged: false,
  });
});

add_task(function test_sameSiteRedirect_paramChanged() {
  // This test extension redirects searches within the same domain
  // while also changing the `paramName`. We don't expect normal
  // telemetry but expect the sameSiteRedirect Glean event,
  // with paramChange value set to true.
  return testClientSideRedirect({
    background() {
      browser.webRequest.onBeforeRequest.addListener(
        () => {
          return {
            redirectUrl: "https://example.org/default?pc=BNG&q=blah",
          };
        },
        { urls: ["*://example.org/default?pc=MOZ*"] },
        ["blocking"]
      );

      browser.test.sendMessage("ready");
    },
    permissions: ["webRequest", "webRequestBlocking", "*://example.org/*"],
    redirectingAppProvidedEngine: true,
    telemetryExpected: false,
    sameSiteParamChanged: true,
  });
});
