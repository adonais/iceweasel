/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_autocomplete.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_autocomplete.js",
  this
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  LoginTestUtils: "resource://testing-common/LoginTestUtils.sys.mjs",
  NonPrivateTabs: "resource:///modules/OpenTabs.sys.mjs",
  sanitizeUntrustedContent:
    "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["preview/aiWindow.ftl"], true)
);

/**
 * Waits for the aggregated tab-change event containing a source event.
 *
 * @param {"TabOpen" | "TabClose" | "TabAttrModified"} sourceEvent Tab event
 *   to wait for.
 * @returns {Promise<Event>} The aggregated tab-change event.
 */
function waitForTabChange(sourceEvent) {
  return BrowserTestUtils.waitForEvent(
    lazy.NonPrivateTabs,
    "TabChange",
    false,
    event => event.detail.sourceEvents.includes(sourceEvent)
  );
}

/**
 * Gets the displayed sources text from an autocomplete row.
 *
 * @param {HTMLElement} row Smart Form Fill autocomplete row.
 *
 * @returns {string} Displayed sources text.
 */
function getSourcesValue(row) {
  return row.renderRoot.querySelector(".sources-value").textContent.trim();
}

describe("Smart Form Fill autocomplete row item menu", () => {
  let context;
  let win;
  let mockEngineManager;

  beforeEach(async () => {
    context = await setupSmartFormFillAutocompleteTest();
    ({ win, mockEngineManager } = context);

    const tabUpdated = waitForTabChange("TabAttrModified");
    await promiseNavigateAndLoad(win.gBrowser.selectedBrowser, FORM_URL);
    await tabUpdated;
  });

  afterEach(async () => {
    await cleanupSmartFormFillAutocompleteTest(context);
    context = null;
    win = null;
    mockEngineManager = null;
  });

  it("renders the fixed label and no-tabs guidance", async () => {
    const { row } = await openAutocomplete(win, "#email", mockEngineManager);

    Assert.equal(
      row.renderRoot.querySelector(".sources-label").textContent,
      await lazy.l10n.formatValue(
        "ai-smart-form-fill-autocomplete-sources-label"
      ),
      "The fixed sources label should be rendered"
    );
    Assert.equal(
      getSourcesValue(row),
      await lazy.l10n.formatValue("ai-smart-form-fill-autocomplete-open-tabs"),
      "The row should prompt the user to open tabs"
    );
  });

  it("shows empty-source guidance when relevant tabs fail", async () => {
    const { row } = await openAutocomplete(win, "#email", mockEngineManager, {
      failedSchemas: [RELEVANT_TABS_SCHEMA],
    });

    Assert.equal(
      getSourcesValue(row),
      await lazy.l10n.formatValue("ai-smart-form-fill-autocomplete-open-tabs"),
      "A relevant-tab failure should fall back to an empty source list"
    );
  });

  it("renders the source pill row", async () => {
    const login = lazy.LoginTestUtils.testData.formLogin({
      origin: "https://example.com",
      formActionOrigin: "https://example.com",
      username: "saved@example.com",
      password: "password",
      usernameField: "email",
      passwordField: "password",
    });
    await Services.logins.addLoginAsync(login);

    let browser;
    try {
      const sourceTabUpdated = waitForTabChange("TabAttrModified");
      const sourceTab = await BrowserTestUtils.openNewForegroundTab(
        win.gBrowser,
        SOURCE_URL
      );
      await sourceTabUpdated;

      const formTabUpdated = waitForTabChange("TabAttrModified");
      await BrowserTestUtils.openNewForegroundTab(win.gBrowser, FORM_URL);
      await formTabUpdated;

      const result = await openAutocomplete(win, "#email", mockEngineManager, {
        selectedSourceUrl: SOURCE_URL,
      });
      ({ browser } = result);
      const { popup, item, row } = result;

      const contentMetadata = await getContentSmartFormFillMetadata(
        browser,
        "#email"
      );
      Assert.ok(
        !Object.hasOwn(contentMetadata, "sources"),
        "Source metadata should not be exposed to the content process"
      );

      const pill = row.renderRoot.querySelector(".source-pill");

      Assert.ok(pill, "The relevant source should render as a pill");
      Assert.equal(
        pill.querySelector(".source-label").textContent.trim(),
        lazy.sanitizeUntrustedContent(sourceTab.label),
        "The source pill should show the tab title"
      );
      Assert.equal(
        pill.querySelector(".source-favicon").getAttribute("src"),
        `page-icon:${SOURCE_URL}`,
        "The source pill should use the tab favicon"
      );
      Assert.ok(
        row.renderRoot.querySelector("moz-button.secondary-action"),
        "The edit-sources action should be rendered"
      );

      const loginFooter = popup.querySelector('[originaltype="loginsFooter"]');
      Assert.ok(loginFooter, "LoginManager rows should remain in the popup");

      const displayedItems = [
        ...popup.querySelectorAll(".autocomplete-row-item"),
      ].filter(candidate => !candidate.collapsed);

      Assert.less(
        displayedItems.indexOf(item),
        displayedItems.indexOf(loginFooter),
        "Smart Form Fill should appear before the LoginManager footer"
      );
    } finally {
      if (browser) {
        await closeAutocomplete(browser);
      }
      await Services.logins.removeLoginAsync(login);
    }
  });

  it("updates its guidance when tabs are opened and closed", async () => {
    const formTab = win.gBrowser.selectedTab;
    let result = await openAutocomplete(win, "#email", mockEngineManager);

    Assert.equal(
      getSourcesValue(result.row),
      await lazy.l10n.formatValue("ai-smart-form-fill-autocomplete-open-tabs"),
      "The row should initially report that no source tabs exist"
    );
    await closeAutocomplete(result.browser);

    const tabUpdated = waitForTabChange("TabAttrModified");
    const sourceTab = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      SOURCE_URL
    );
    await tabUpdated;
    await BrowserTestUtils.switchTab(win.gBrowser, formTab);

    result = await openAutocomplete(win, "#email", mockEngineManager, {
      expectedSchemas: [RELEVANT_TABS_SCHEMA],
    });
    Assert.equal(
      getSourcesValue(result.row),
      await lazy.l10n.formatValue(
        "ai-smart-form-fill-autocomplete-choose-tabs"
      ),
      "The row should report that source tabs are available"
    );
    await closeAutocomplete(result.browser);

    const tabClosed = waitForTabChange("TabClose");
    await BrowserTestUtils.removeTab(sourceTab);
    await tabClosed;

    result = await openAutocomplete(win, "#email", mockEngineManager, {
      expectedSchemas: [RELEVANT_TABS_SCHEMA],
    });
    Assert.equal(
      getSourcesValue(result.row),
      await lazy.l10n.formatValue("ai-smart-form-fill-autocomplete-open-tabs"),
      "The row should update after the last source tab closes"
    );
  });
});
