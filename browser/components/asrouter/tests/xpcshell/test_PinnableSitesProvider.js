/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PinnableSitesProvider } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/PinnableSitesProvider.sys.mjs"
);
const { NewTabUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/NewTabUtils.sys.mjs"
);
const { TaskbarTabs } = ChromeUtils.importESModule(
  "moz-src:///browser/components/taskbartabs/TaskbarTabs.sys.mjs"
);
const { generateName } = ChromeUtils.importESModule(
  "moz-src:///browser/components/taskbartabs/TaskbarTabsRegistry.sys.mjs"
);
const { HomePage } = ChromeUtils.importESModule(
  "resource:///modules/HomePage.sys.mjs"
);
const { AboutNewTab } = ChromeUtils.importESModule(
  "resource:///modules/AboutNewTab.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
const { FilterAdult } = ChromeUtils.importESModule(
  "resource:///modules/FilterAdult.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);

const CURATED = [
  {
    id: "curated-gmail",
    name: "Gmail",
    description: "mail.google.com",
    iconUrl: "https://example.com/gmail.png",
    url: "https://mail.google.com",
  },
  {
    id: "curated-youtube",
    name: "YouTube",
    description: "youtube.com",
    iconUrl: "https://example.com/youtube.png",
    url: "https://www.youtube.com/",
  },
];

function contentWithTile(tile = {}) {
  return {
    screens: [
      {
        id: "SCREEN_1",
        content: {
          tiles: {
            type: "pinnable_sites",
            source: "topFrecentSites",
            data: structuredClone(CURATED),
            ...tile,
          },
        },
      },
    ],
  };
}

const tileOf = content => content.screens[0].content.tiles;

/**
 * @param {object[]} pages - {url, frecency} pairs to serve as history.
 * @param {object} [options]
 * @param {string} [options.homePage] - Value for HomePage.get().
 * @param {string} [options.newTabURL] - Value for AboutNewTab.newTabURL.
 * @param {string[]} [options.engineDomains] - Visible search engine domains.
 * @param {string[]} [options.pinnedHosts] - Hosts with an existing Taskbar Tab.
 * @param {string[]} [options.iconlessHosts] - Hosts with no stored favicon.
 * @returns {object} Sinon sandbox
 */
function stubEnvironment(pages, options = {}) {
  const {
    homePage = "about:home",
    newTabURL = "about:newtab",
    engineDomains = [],
    pinnedHosts = [],
    iconlessHosts = [],
  } = options;

  const sandbox = sinon.createSandbox();

  sandbox
    .stub(NewTabUtils.activityStreamProvider, "getTopFrecentSites")
    .resolves(pages);
  sandbox
    .stub(TaskbarTabs, "findTaskbarTab")
    .callsFake(async uri =>
      pinnedHosts.includes(uri.host) ? { id: "already-pinned" } : null
    );
  sandbox.stub(PlacesUtils, "favicons").value({
    getFaviconForPage: async uri =>
      iconlessHosts.includes(uri.host) ? null : { width: 32 },
  });
  sandbox.stub(HomePage, "get").returns(homePage);
  sandbox.stub(AboutNewTab, "newTabURL").get(() => newTabURL);
  sandbox
    .stub(SearchService, "getVisibleEngines")
    .resolves(engineDomains.map(searchUrlDomain => ({ searchUrlDomain })));

  return sandbox;
}

add_task(async function test_ranksByStrongestPageAndPreservesSubdomains() {
  const sandbox = stubEnvironment([
    { url: "https://news.example.com/a", frecency: 180 },
    { url: "https://news.example.com/b", frecency: 175 },
    { url: "https://news.example.com/c", frecency: 160 },
    { url: "https://docs.google.com/", frecency: 400 },
    { url: "https://calendar.google.com/", frecency: 300 },
  ]);

  try {
    const content = await PinnableSitesProvider.populate(
      contentWithTile({ backfill: false })
    );
    const { data } = tileOf(content);

    Assert.deepEqual(
      data.map(item => item.url),
      [
        "https://docs.google.com",
        "https://calendar.google.com",
        "https://news.example.com",
      ],
      "Origins are ranked by their strongest page, subdomains kept distinct"
    );
    Assert.equal(
      data[0].name,
      "Google Docs",
      "The tile label is the same clean app name the taskbar shortcut gets"
    );
    Assert.equal(
      data[0].name,
      generateName(Services.io.newURI("https://docs.google.com/")),
      "The label comes from the shared Taskbar Tabs name helper"
    );
    Assert.equal(
      data[0].iconUrl,
      "page-icon:https://docs.google.com/",
      "Icons resolve through the Places favicon service"
    );
    Assert.deepEqual(
      data.map(item => item.id),
      ["site_1", "site_2", "site_3"],
      "Ids are positional so origin is never reported in telemetry"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_wwwVariantsAreOneAppButSubdomainsAreNot() {
  const sandbox = stubEnvironment([
    { url: "https://www.figma.com/", frecency: 600 },
    { url: "https://figma.com/", frecency: 500 },
    { url: "https://docs.google.com/", frecency: 400 },
    { url: "https://calendar.google.com/", frecency: 300 },
  ]);

  try {
    const content = await PinnableSitesProvider.populate(
      contentWithTile({ backfill: false })
    );
    Assert.deepEqual(
      tileOf(content).data.map(item => item.url),
      [
        // We pin the variant the user uses most.
        "https://www.figma.com",
        "https://docs.google.com",
        "https://calendar.google.com",
      ],
      "www and non-www collapse to one app and subdomains stay distinct"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_strongestPageWinsOverManyWeakerPages() {
  const sandbox = stubEnvironment([
    { url: "https://news.example.com/a", frecency: 180 },
    { url: "https://news.example.com/b", frecency: 175 },
    { url: "https://news.example.com/c", frecency: 160 },
    { url: "https://docs.google.com/", frecency: 400 },
  ]);

  try {
    const content = await PinnableSitesProvider.populate(contentWithTile());
    Assert.equal(
      tileOf(content).data[0].url,
      "https://docs.google.com",
      "An origin scores on its strongest single page, so a news site read across many one-off articles does not outrank a daily use app"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_exclusionsAppliedBeforeRanking() {
  const sandbox = stubEnvironment(
    [
      { url: "http://insecure.example.com/", frecency: 900 },
      { url: "https://localhost/", frecency: 900 },
      { url: "https://127.0.0.1/", frecency: 900 },
      { url: "https://intranet/", frecency: 900 },
      { url: "https://searchy.example/", frecency: 900 },
      { url: "https://www.searchy2.example/", frecency: 900 },
      { url: "https://home.example.com/", frecency: 900 },
      { url: "https://newtab.example.com/", frecency: 900 },
      { url: "https://pinned.example.com/", frecency: 900 },
      { url: "https://keep.example.com/", frecency: 1 },
    ],
    {
      homePage: "https://home.example.com/",
      newTabURL: "https://newtab.example.com/",
      engineDomains: ["www.searchy.example", "searchy2.example"],
      pinnedHosts: ["pinned.example.com"],
    }
  );

  try {
    const content = await PinnableSitesProvider.populate(
      contentWithTile({ backfill: false })
    );
    Assert.deepEqual(
      tileOf(content).data.map(item => item.url),
      ["https://keep.example.com"],
      "non-https, localhost, IP literals, unqualified hosts, search roots the homepage, the newtab page and already-pinned apps are all removed"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_backfillComposesWithPersonalization() {
  const sandbox = stubEnvironment([
    { url: "https://docs.google.com/", frecency: 400 },
  ]);

  try {
    const content = await PinnableSitesProvider.populate(
      contentWithTile({ slots: 3 })
    );
    const { data } = tileOf(content);

    Assert.deepEqual(
      data.map(item => item.id),
      ["site_1", "curated-gmail", "curated-youtube"],
      "Unfilled slots come from the curated array, keeping their authored ids"
    );
    Assert.deepEqual(
      data.map(item => !!item.personalized),
      [true, false, false],
      "Only rows drawn from history are flagged as personalized"
    );
    Assert.equal(data.length, 3, "The slot count is honored");
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_backfillSkipsDuplicateAndPinnedOrigins() {
  const sandbox = stubEnvironment(
    [{ url: "https://mail.google.com/", frecency: 400 }],
    { pinnedHosts: ["www.youtube.com"] }
  );

  try {
    const content = await PinnableSitesProvider.populate(
      contentWithTile({ slots: 5 })
    );
    Assert.deepEqual(
      tileOf(content).data.map(item => item.id),
      ["site_1"],
      "Backfill skips an origin already shown and one already pinned"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_pinnedMatchesEitherWwwVariant() {
  const sandbox = stubEnvironment(
    [
      { url: "https://youtube.com/", frecency: 400 },
      { url: "https://www.figma.com/", frecency: 300 },
      { url: "https://docs.google.com/", frecency: 200 },
    ],
    { pinnedHosts: ["www.youtube.com", "figma.com"] }
  );

  try {
    const content = await PinnableSitesProvider.populate(
      contentWithTile({ backfill: false })
    );
    Assert.deepEqual(
      tileOf(content).data.map(item => item.url),
      ["https://docs.google.com"],
      "An app pinned under the other www variant is still excluded"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_curatedTilesAreLeftAlone() {
  const sandbox = stubEnvironment([
    { url: "https://docs.google.com/", frecency: 400 },
  ]);

  try {
    const content = contentWithTile({ source: "curated" });
    Assert.ok(
      !PinnableSitesProvider.hasPersonalizedTile(content),
      "A curated tile does not register as personalized"
    );

    await PinnableSitesProvider.populate(content);
    Assert.deepEqual(
      tileOf(content).data,
      CURATED,
      "The configured data is untouched"
    );
    Assert.ok(
      NewTabUtils.activityStreamProvider.getTopFrecentSites.notCalled,
      "History is not read for a curated tile"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_historyFailureFallsBackToCurated() {
  const sandbox = stubEnvironment([]);
  NewTabUtils.activityStreamProvider.getTopFrecentSites.rejects(
    new Error("Places is unavailable")
  );

  try {
    const content = await PinnableSitesProvider.populate(contentWithTile());
    Assert.deepEqual(
      tileOf(content).data,
      CURATED,
      "A failure leaves the configured data in place"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_adultSitesAreNeverOffered() {
  const sandbox = stubEnvironment([
    { url: "https://adult.example.com/", frecency: 900 },
    { url: "https://docs.google.com/", frecency: 400 },
  ]);
  sandbox
    .stub(FilterAdult, "filter")
    .callsFake(links =>
      links.filter(({ url }) => !url.startsWith("https://adult."))
    );

  try {
    const content = await PinnableSitesProvider.populate(
      contentWithTile({ backfill: false })
    );
    Assert.deepEqual(
      tileOf(content).data.map(item => item.url),
      ["https://docs.google.com"],
      "A site the adult filter rejects is dropped however high it ranks"
    );
    Assert.ok(
      FilterAdult.filter.calledOnce,
      "Candidates go through the filter"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_floorWithholdsTheMessage() {
  const sandbox = stubEnvironment([
    { url: "https://docs.google.com/", frecency: 400 },
    { url: "https://calendar.google.com/", frecency: 300 },
  ]);

  try {
    Assert.equal(
      await PinnableSitesProvider.populate(
        contentWithTile({ slots: 5, minPersonalized: 3 })
      ),
      null,
      "Too few personalized sites withholds the whole message"
    );

    const content = await PinnableSitesProvider.populate(
      contentWithTile({ slots: 5, minPersonalized: 2 })
    );
    Assert.deepEqual(
      tileOf(content).data.map(item => item.id),
      ["site_1", "site_2", "curated-gmail", "curated-youtube"],
      "Meeting the floor shows the message, still backfilling the spare slots"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_floorIgnoresBackfilledSlots() {
  const sandbox = stubEnvironment([
    { url: "https://docs.google.com/", frecency: 400 },
  ]);

  try {
    Assert.equal(
      await PinnableSitesProvider.populate(
        contentWithTile({ slots: 3, minPersonalized: 2 })
      ),
      null,
      "Curated sites topping up the slots do not count toward the floor"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_floorDefaultsToNeverWithholding() {
  const sandbox = stubEnvironment([]);

  try {
    const content = await PinnableSitesProvider.populate(contentWithTile());
    Assert.deepEqual(
      tileOf(content).data,
      CURATED,
      "With no floor set, a user with no qualifying history still sees the curated list rather than nothing"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_emptyTileWithholdsTheMessage() {
  const sandbox = stubEnvironment([]);

  try {
    Assert.equal(
      await PinnableSitesProvider.populate(
        contentWithTile({ backfill: false })
      ),
      null,
      "No qualifying history and no backfill withholds the message rather than showing an empty list"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_sitesWithoutIconsAreSkipped() {
  const sandbox = stubEnvironment(
    [
      { url: "https://docs.google.com/", frecency: 400 },
      { url: "https://intranet.example.com/", frecency: 300 },
      { url: "https://calendar.google.com/", frecency: 200 },
    ],
    { iconlessHosts: ["intranet.example.com"] }
  );

  try {
    const content = await PinnableSitesProvider.populate(
      contentWithTile({ slots: 3 })
    );
    Assert.deepEqual(
      tileOf(content).data.map(item => item.url),
      [
        "https://docs.google.com",
        "https://calendar.google.com",
        "https://mail.google.com",
      ],
      "A site with no icon is skipped and its slot is backfilled"
    );
  } finally {
    sandbox.restore();
  }
});
