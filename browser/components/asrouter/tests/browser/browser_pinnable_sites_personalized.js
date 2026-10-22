/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { Spotlight } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/Spotlight.sys.mjs"
);
const { TaskbarTabs } = ChromeUtils.importESModule(
  "moz-src:///browser/components/taskbartabs/TaskbarTabs.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

const HISTORY = [
  { url: "https://docs.google.com/", frecency: 500 },
  { url: "https://calendar.google.com/", frecency: 400 },
  { url: "https://mozilla-hub.atlassian.net/browse/ABC-1", frecency: 300 },
];

const ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

add_setup(async function () {
  for (const { url } of HISTORY) {
    await PlacesTestUtils.addVisits(url);
    await PlacesTestUtils.setFaviconForPage(
      url,
      new URL("/favicon.png", url).href,
      ICON
    );
  }
  registerCleanupFunction(() => PlacesUtils.history.clear());
});

const CURATED = [
  {
    id: "curated-gmail",
    name: "Gmail",
    description: "mail.google.com",
    iconUrl: "chrome://global/skin/icons/defaultFavicon.svg",
    url: "https://mail.google.com",
  },
];

function messageWithTile(tile) {
  return {
    id: "TEST_PINNABLE_SITES_SPOTLIGHT",
    template: "spotlight",
    content: {
      id: "TEST_PINNABLE_SITES_SPOTLIGHT",
      template: "multistage",
      transitions: false,
      screens: [
        {
          id: "SCREEN_1",
          content: {
            position: "split",
            hero_text: { title: { raw: "Open your sites like apps?" } },
            tiles: {
              type: "pinnable_sites",
              pinButtonLabel: { raw: "Add" },
              alwaysShowPinButton: true,
              data: CURATED,
              ...tile,
            },
            dismiss_button: { action: { dismiss: true } },
          },
        },
      ],
    },
  };
}

async function showDialog(message, browser) {
  Spotlight.showSpotlightDialog(browser, message, () => {});
  const [win] = await TestUtils.topicObserved("subdialog-loaded");
  await TestUtils.waitForCondition(
    () => win.document.querySelectorAll(".pinnable-sites-item").length,
    "Waiting for the pinnable sites list to render"
  );
  return win;
}

async function closeDialog(win, browser) {
  win.close();
  await TestUtils.waitForCondition(
    () => !browser.documentGlobal.gDialogBox?.isOpen,
    "Waiting for the spotlight dialog to close"
  );
}

function namesIn(win) {
  return Array.from(
    win.document.querySelectorAll(".pinnable-sites-name"),
    el => el.textContent
  );
}

function stubHistory(sandbox, { pinnedHosts = [] } = {}) {
  sandbox.stub(SearchService, "getVisibleEngines").resolves([]);
  sandbox
    .stub(TaskbarTabs, "findTaskbarTab")
    .callsFake(async uri =>
      pinnedHosts.includes(uri.host) ? { id: "already-pinned" } : null
    );
  return sandbox
    .stub(NewTabUtils.activityStreamProvider, "getTopFrecentSites")
    .resolves(HISTORY);
}

add_task(async function test_personalized_tile_renders_with_page_icons() {
  const sandbox = sinon.createSandbox();
  stubHistory(sandbox);
  const browser = gBrowser.selectedBrowser;

  try {
    const win = await showDialog(
      messageWithTile({ source: "topFrecentSites", slots: 3, backfill: false }),
      browser
    );

    const violations = [];
    win.document.addEventListener("securitypolicyviolation", event =>
      violations.push(event.blockedURI)
    );

    Assert.deepEqual(
      namesIn(win),
      ["Google Docs", "Google Calendar", "Atlassian Mozilla-hub"],
      "Tiles are labelled with clean app names derived from the origin"
    );

    const icons = Array.from(
      win.document.querySelectorAll(".pinnable-sites-icon")
    );
    Assert.equal(
      icons[0].getAttribute("src"),
      "page-icon:https://docs.google.com/",
      "Personalized icons are served by the Places favicon service"
    );

    // A blocked image never completes with a non-zero intrinsic size
    await TestUtils.waitForCondition(
      () => icons.every(icon => icon.complete),
      "Waiting for the favicons to load"
    );
    Assert.greater(
      icons[0].naturalWidth,
      0,
      "The page-icon: favicon decoded rather than being blocked by the CSP"
    );
    Assert.deepEqual(violations, [], "No content security policy violations");

    await closeDialog(win, browser);
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_already_pinned_sites_are_not_offered() {
  const sandbox = sinon.createSandbox();
  stubHistory(sandbox, { pinnedHosts: ["docs.google.com"] });
  const browser = gBrowser.selectedBrowser;

  try {
    const win = await showDialog(
      messageWithTile({ source: "topFrecentSites", slots: 3, backfill: false }),
      browser
    );

    Assert.deepEqual(
      namesIn(win),
      ["Google Calendar", "Atlassian Mozilla-hub"],
      "An app the user already pinned does not take up a slot"
    );

    await closeDialog(win, browser);
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_backfill_tops_up_from_the_curated_array() {
  const sandbox = sinon.createSandbox();
  stubHistory(sandbox);
  const browser = gBrowser.selectedBrowser;

  try {
    const win = await showDialog(
      messageWithTile({ source: "topFrecentSites", slots: 4 }),
      browser
    );

    Assert.deepEqual(
      namesIn(win),
      ["Google Docs", "Google Calendar", "Atlassian Mozilla-hub", "Gmail"],
      "The unfilled slot is topped up from the message's curated array"
    );

    await closeDialog(win, browser);
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_curated_tile_is_untouched() {
  const sandbox = sinon.createSandbox();
  const historyStub = stubHistory(sandbox);
  const browser = gBrowser.selectedBrowser;

  try {
    const win = await showDialog(messageWithTile({}), browser);

    Assert.ok(
      historyStub.notCalled,
      "The curated control arm never reads local history"
    );
    Assert.deepEqual(
      namesIn(win),
      ["Gmail"],
      "The curated tile renders its authored data"
    );

    await closeDialog(win, browser);
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_floor_withholds_the_message() {
  const sandbox = sinon.createSandbox();
  stubHistory(sandbox);
  const dispatch = sandbox.stub();
  const browser = gBrowser.selectedBrowser;

  try {
    const shown = await Spotlight.showSpotlightDialog(
      browser,
      messageWithTile({
        source: "topFrecentSites",
        slots: 5,
        minPersonalized: 4,
      }),
      dispatch
    );

    Assert.ok(!shown, "History short of the floor withholds the spotlight");
    Assert.ok(
      !browser.documentGlobal.gDialogBox?.isOpen,
      "No dialog was opened"
    );
    Assert.ok(
      dispatch.notCalled,
      "A withheld message records no impression, so it neither reports " +
        "telemetry nor spends its frequency cap"
    );
  } finally {
    sandbox.restore();
  }
});
