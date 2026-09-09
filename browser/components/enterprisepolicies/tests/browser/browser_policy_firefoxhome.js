/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// SpecialPowers.spawn injects ContentTaskUtils in the scope of the callback.
// Eslint doesn't know about that.
/* global ContentTaskUtils */

// Importing these libraries from newtab is normally forbidden for code that
// executes in the browser, but since these are just tests, it's fine.
const { DiscoveryStreamFeed } = ChromeUtils.importESModule(
  // eslint-disable-next-line mozilla/no-newtab-refs-outside-newtab
  "resource://newtab/lib/DiscoveryStreamFeed.sys.mjs"
);
const { PREFS_CONFIG } = ChromeUtils.importESModule(
  // eslint-disable-next-line mozilla/no-newtab-refs-outside-newtab
  "resource://newtab/lib/ActivityStream.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_setup(async function () {
  // @nova-cleanup(remove-pref): Remove novaEnabled detection
  const novaEnabled = Services.prefs.getBoolPref(
    "browser.newtabpage.activity-stream.nova.enabled",
    false
  );

  // @nova-cleanup(remove-conditional): Default to this block; in Nova, Highlights
  // is rendered inside DiscoveryStreamBase which requires DS to be configured.
  if (novaEnabled) {
    let sandbox = sinon.createSandbox();
    sandbox
      .stub(DiscoveryStreamFeed.prototype, "generateFeedUrl")
      .returns(
        "https://example.com/browser/browser/extensions/newtab/test/browser/topstories.json"
      );

    await SpecialPowers.pushPrefEnv({
      set: [
        [
          "browser.newtabpage.activity-stream.discoverystream.config",
          PREFS_CONFIG.get("discoverystream.config").getValue({
            geo: "US",
            locale: "en-US",
          }),
        ],
        [
          "browser.newtabpage.activity-stream.discoverystream.endpoints",
          "https://example.com",
        ],
      ],
    });

    registerCleanupFunction(() => {
      sandbox.restore();
    });
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.newtabpage.activity-stream.feeds.section.highlights", true],
    ],
  });
});

add_task(async function test_firefox_home_without_policy() {
  let tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "about:home",
    waitForStateStop: true,
  });

  await SpecialPowers.spawn(tab.linkedBrowser, [], function () {
    let search = content.document.querySelector(".search-wrapper");
    isnot(search, null, "Search section should be there.");
    let topsites = content.document.querySelector(
      "section[data-section-id='topsites']"
    );
    isnot(topsites, null, "Top Sites section should be there.");
    let highlights = content.document.querySelector(
      "section[data-section-id='highlights']"
    );
    isnot(highlights, null, "Highlights section should be there.");
  });
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_firefox_home_with_policy() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.newtabpage.activity-stream.discoverystream.endpointSpocsClear",
        "",
      ],
    ],
  });

  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {
        Search: false,
        TopSites: false,
        Highlights: false,
      },
    },
  });

  let tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "about:home",
    waitForStateStop: true,
  });

  await SpecialPowers.spawn(tab.linkedBrowser, [], function () {
    let search = content.document.querySelector(".search-wrapper");
    is(search, null, "Search section should not be there.");
    let topsites = content.document.querySelector(
      "section[data-section-id='topsites']"
    );
    is(topsites, null, "Top Sites section should not be there.");
    let highlights = content.document.querySelector(
      "section[data-section-id='highlights']"
    );
    is(highlights, null, "Highlights section should not be there.");
  });
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_firefoxhome_preferences_set() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.newtabpage.activity-stream.discoverystream.endpointSpocsClear",
        "",
      ],
    ],
  });

  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {
        Search: false,
        TopSites: false,
        SponsoredTopSites: false,
        Highlights: false,
        Locked: true,
      },
    },
  });

  await BrowserTestUtils.withNewTab("about:preferences#home", async browser => {
    const srdEnabled = Services.prefs.getBoolPref(
      "browser.settings-redesign.enabled",
      false
    );
    // Legacy uses XUL <checkbox preference=...> bound to a pref. The Settings
    // Redesign exposes the same prefs through differently-named settings
    // backed by moz-checkbox elements with the friendly setting id.
    const data = srdEnabled
      ? {
          Search: "webSearch",
          TopSites: "shortcuts",
          SponsoredTopSites: "sponsoredShortcuts",
          Highlights: "recentActivity",
        }
      : {
          Search: "browser.newtabpage.activity-stream.showSearch",
          TopSites: "browser.newtabpage.activity-stream.feeds.topsites",
          SponsoredTopSites:
            "browser.newtabpage.activity-stream.showSponsoredTopSites",
          Highlights:
            "browser.newtabpage.activity-stream.feeds.section.highlights",
        };
    for (let [section, key] of Object.entries(data)) {
      const el = srdEnabled
        ? browser.contentDocument.getElementById(key)
        : browser.contentDocument.querySelector(
            `checkbox[preference='${key}']`
          );
      ok(el, `${section} control should be in the DOM`);
      is(
        !!(el.disabled || el.hasAttribute("disabled")),
        true,
        `${section} checkbox should be disabled`
      );
    }
  });
  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {},
    },
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_firefoxhome_widgets_blocked() {
  await SpecialPowers.pushPrefEnv({
    set: [
      // Widget toggles only exist in the Settings Redesign UI.
      ["browser.settings-redesign.enabled", true],
      // Stand in for a rollout that has made these two widgets available.
      ["browser.newtabpage.activity-stream.widgets.system.enabled", true],
      ["browser.newtabpage.activity-stream.widgets.system.lists.enabled", true],
      [
        "browser.newtabpage.activity-stream.widgets.system.clocks.enabled",
        true,
      ],
    ],
  });

  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {
        Widgets: {
          Blocked: ["lists"],
        },
      },
    },
  });

  await BrowserTestUtils.withNewTab("about:preferences#home", async browser => {
    let doc = browser.contentDocument;
    let lists = await TestUtils.waitForCondition(() =>
      doc.getElementById("setting-control-lists")
    );
    await lists.updateComplete;
    ok(lists.disabled, "Blocked widget toggle is disabled");

    let clocks = doc.getElementById("setting-control-clocks");
    await clocks.updateComplete;
    ok(!clocks.disabled, "Widget that was not blocked stays editable");
  });

  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {},
    },
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_firefoxhome_customize_panel_locked() {
  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {
        TopSites: false,
        Locked: true,
      },
    },
  });

  let tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "about:home",
    waitForStateStop: true,
  });

  await SpecialPowers.spawn(tab.linkedBrowser, [], async function () {
    let customizeButton = await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector(
          ".personalize-button, .open-customization-button"
        ),
      "Wait for the customize button to load on the newtab page"
    );
    customizeButton.click();

    let dialog = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("dialog.customize-menu[open]"),
      "Wait for the customize panel to open"
    );

    // `disabled` is a lit reactive property, not a WebIDL attribute, so it is
    // not visible through the Xray wrapper.
    ok(
      dialog.querySelector("#shortcuts-toggle").wrappedJSObject.disabled,
      "Shortcuts toggle should be disabled when feeds.topsites is locked"
    );
    ok(
      !dialog.querySelector("#row-selector").wrappedJSObject.disabled,
      "Row selector should stay enabled when its own pref is not locked"
    );
  });

  BrowserTestUtils.removeTab(tab);
  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {},
    },
  });
});

add_task(async function test_firefoxhome_support_firefox_sponsored_locked() {
  // The supportFirefox setting only exists in the Settings Redesign UI.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", true]],
  });

  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {
        SponsoredTopSites: false,
        SponsoredStories: false,
        Locked: true,
      },
    },
  });

  await BrowserTestUtils.withNewTab("about:preferences#home", async browser => {
    let doc = browser.contentDocument;
    let control = await TestUtils.waitForCondition(() =>
      doc.getElementById("setting-control-supportFirefox")
    );
    await control.updateComplete;
    let toggle = control.querySelector("moz-toggle");
    ok(
      toggle.disabled,
      "Support Firefox toggle is disabled when both sponsored prefs are locked"
    );
    ok(
      !toggle.pressed,
      "Support Firefox toggle is off when both sponsored prefs are locked off"
    );
  });

  await setupPolicyEngineWithJson({
    policies: {
      FirefoxHome: {},
    },
  });
  await SpecialPowers.popPrefEnv();
});
