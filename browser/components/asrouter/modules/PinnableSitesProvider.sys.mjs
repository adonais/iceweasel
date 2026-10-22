/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Populates `pinnable_sites` content tiles from the user's most-used web apps,
 * computed locally from Places.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  FilterAdult: "resource:///modules/FilterAdult.sys.mjs",
  generateName:
    "moz-src:///browser/components/taskbartabs/TaskbarTabsRegistry.sys.mjs",
  HomePage: "resource:///modules/HomePage.sys.mjs",
  NewTabUtils: "resource://gre/modules/NewTabUtils.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
  TaskbarTabs: "moz-src:///browser/components/taskbartabs/TaskbarTabs.sys.mjs",
});

const SOURCE_TOP_FRECENT_SITES = "topFrecentSites";
const DEFAULT_SLOTS = 5;

// Pages, not sites (one site can occupy many rows of the query).
const CANDIDATE_PAGE_LIMIT = 200;

// Must match the container PIN_TASKBAR_TAB pins into.
const PIN_USER_CONTEXT_ID = 0;

/**
 * @param {string} host - The host to normalize.
 * @returns {string} The host without a leading `www.`, lowercased.
 */
function normalizeHost(host) {
  return host.replace(/^www\./i, "").toLowerCase();
}

/**
 * @returns {Promise<Set<string>>} Normalized hosts that are never offered.
 */
async function getExcludedHosts() {
  const excluded = new Set();

  const addHost = url => {
    const host = URL.parse(url)?.hostname;
    if (host) {
      excluded.add(normalizeHost(host));
    }
  };

  try {
    for (const page of lazy.HomePage.get().split("|")) {
      addHost(page);
    }
  } catch (e) {
    console.error("Failed to read the homepage:", e);
  }
  addHost(lazy.AboutNewTab.newTabURL);

  try {
    const engines = await lazy.SearchService.getVisibleEngines();
    for (const engine of engines) {
      if (engine.searchUrlDomain) {
        excluded.add(normalizeHost(engine.searchUrlDomain));
      }
    }
  } catch (e) {
    console.error("Failed to read search engines:", e);
  }

  return excluded;
}

async function isAlreadyPinned(origin) {
  try {
    const uri = Services.io.newURI(`${origin}/`);
    const host = normalizeHost(uri.host);
    for (const variant of [host, `www.${host}`]) {
      const variantUri = uri
        .mutate()
        .setHost(variant)
        .finalize()
        .QueryInterface(Ci.nsIURL);
      if (
        await lazy.TaskbarTabs.findTaskbarTab(variantUri, PIN_USER_CONTEXT_ID)
      ) {
        return true;
      }
    }
    return false;
  } catch (e) {
    // An origin we can't represent isn't pinnable either.
    return true;
  }
}

async function hasIcon(origin) {
  return !!(await lazy.PlacesUtils.favicons.getFaviconForPage(
    Services.io.newURI(`${origin}/`)
  ));
}

/**
 * @param {object} options
 * @param {number} options.slots - Maximum number of tiles to produce.
 * @returns {Promise<object[]>} Tile data items, best first.
 */
async function getPersonalizedSites({ slots }) {
  const pages = lazy.FilterAdult.filter(
    await lazy.NewTabUtils.activityStreamProvider.getTopFrecentSites({
      onePerDomain: false,
      includeFavicon: false,
      numItems: CANDIDATE_PAGE_LIMIT,
      // Match the `topFrecentSites` targeting attribute, which decides whether
      // the message shows at all.
      topsiteFrecency: lazy.PlacesUtils.history.pageFrecencyThreshold(
        30,
        2,
        false
      ),
    })
  );

  const byHost = new Map();
  for (const page of pages) {
    let uri;
    try {
      uri = Services.io.newURI(page.url);
      // Throws for IP literals and single-label hosts, neither of which names
      // a web app.
      Services.eTLD.getBaseDomain(uri);
    } catch (e) {
      continue;
    }

    if (uri.scheme !== "https") {
      continue;
    }

    const host = normalizeHost(uri.host);
    const entry = byHost.get(host);
    if (!entry) {
      byHost.set(host, { origin: uri.prePath, score: page.frecency });
      continue;
    }
    if (page.frecency > entry.score) {
      entry.origin = uri.prePath;
      entry.score = page.frecency;
    }
  }

  const excludedHosts = await getExcludedHosts();
  const candidates = [];
  for (const [host, entry] of byHost) {
    if (!excludedHosts.has(host)) {
      candidates.push(entry);
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const sites = [];
  for (const entry of candidates) {
    if (sites.length >= slots) {
      break;
    }
    if (
      !(await isAlreadyPinned(entry.origin)) &&
      (await hasIcon(entry.origin))
    ) {
      sites.push(entry);
    }
  }

  return sites.map(({ origin }, index) => {
    const uri = Services.io.newURI(`${origin}/`);
    return {
      id: `site_${index + 1}`,
      name: lazy.generateName(uri),
      description: normalizeHost(uri.host),
      iconUrl: `page-icon:${origin}/`,
      url: origin,
      personalized: true,
    };
  });
}

function* personalizedTiles(content) {
  for (const screen of content?.screens ?? []) {
    const tiles = screen?.content?.tiles;
    if (!tiles) {
      continue;
    }
    for (const tile of Array.isArray(tiles) ? tiles : [tiles]) {
      if (
        tile?.type === "pinnable_sites" &&
        tile.source === SOURCE_TOP_FRECENT_SITES
      ) {
        yield tile;
      }
    }
  }
}

/**
 * @param {object} tile - The tile to rewrite in place.
 * @returns {Promise<boolean>} `false` if the tile produced fewer personalized
 *   sites than `minPersonalized`, or no sites at all, meaning the message must
 *   not be shown.
 */
async function populateTile(tile) {
  const slots = tile.slots ?? DEFAULT_SLOTS;
  const curated = Array.isArray(tile.data) ? tile.data : [];

  let sites = [];
  try {
    sites = await getPersonalizedSites({ slots });
  } catch (e) {
    console.error("Failed to personalize pinnable sites tile:", e);
  }

  if (sites.length < (tile.minPersonalized ?? 0)) {
    return false;
  }

  if (tile.backfill !== false && sites.length < slots) {
    const taken = new Set(sites.map(site => site.url));
    for (const item of curated) {
      if (sites.length >= slots) {
        break;
      }
      const origin = URL.parse(item.url)?.origin;
      if (!origin || taken.has(origin) || (await isAlreadyPinned(origin))) {
        continue;
      }
      taken.add(origin);
      sites.push(item);
    }
  }

  tile.data = sites;
  return !!sites.length;
}

export const PinnableSitesProvider = {
  /**
   * @param {object} content - Message content with a `screens` array.
   * @returns {boolean} `true` if `populate` would do work.
   */
  hasPersonalizedTile(content) {
    return !personalizedTiles(content).next().done;
  },

  /**
   * @param {object} content - Message content with a `screens` array.
   * @returns {Promise<?object>} The same content object, or `null` if a tile
   *   did not meet its `minPersonalized` floor or was left with no sites.
   */
  async populate(content) {
    for (const tile of personalizedTiles(content)) {
      if (!(await populateTile(tile))) {
        return null;
      }
    }
    return content;
  },
};
