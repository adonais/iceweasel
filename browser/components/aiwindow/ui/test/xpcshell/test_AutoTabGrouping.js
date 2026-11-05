/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AutoTabGroupingSuggestions } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AutoTabGroupingSuggestions.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

NimbusTestUtils.init(this);

function makeTab({
  url = "https://example.com/",
  pinned = false,
  closing = false,
  group = null,
  hidden = false,
  busy = false,
  label = "Example Page",
  iconUrl = null,
  lastAccessed = 0,
} = {}) {
  return {
    pinned,
    closing,
    group,
    hidden,
    label,
    lastAccessed,
    hasAttribute(attr) {
      return attr === "busy" && busy;
    },
    linkedBrowser: url
      ? { currentURI: Services.io.newURI(url), mIconURL: iconUrl }
      : null,
  };
}

function makeWin(tabs) {
  return { gBrowser: { tabs } };
}

function makeCluster(size, cohesion = 0.5) {
  return {
    tabs: Array.from({ length: size }, (_, i) => ({ index: i })),
    cohesion,
  };
}

/**
 * Makes `locales` available so a task can switch the app locale through
 * Services.locale.requestedLocales.
 *
 * @param {string[]} locales
 * @returns {Function} Restores the original available and requested locales.
 */
function useAppLocales(locales) {
  const { availableLocales, requestedLocales } = Services.locale;
  Services.locale.availableLocales = locales;
  return () => {
    Services.locale.availableLocales = availableLocales;
    Services.locale.requestedLocales = requestedLocales;
  };
}

add_setup(function () {
  do_get_profile();
  Services.prefs.setIntPref(
    "browser.smartwindow.autoTabGrouping.minTabsPerGroup",
    2
  );
  Services.prefs.setIntPref("browser.smartwindow.autoTabGrouping.maxGroups", 3);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(
      "browser.smartwindow.autoTabGrouping.minTabsPerGroup"
    );
    Services.prefs.clearUserPref(
      "browser.smartwindow.autoTabGrouping.maxGroups"
    );
  });
});

add_task(function test_getCandidateTabs_keepsOnlyUngroupedWebTabs() {
  const httpsTab = makeTab({ url: "https://a.example/" });
  const httpTab = makeTab({ url: "http://b.example/" });
  const pinnedTab = makeTab({ pinned: true });
  const closingTab = makeTab({ closing: true });
  const groupedTab = makeTab({ group: { id: "g1" } });
  const hiddenTab = makeTab({ hidden: true });
  const aboutTab = makeTab({ url: "about:newtab" });
  const chromeTab = makeTab({ url: "chrome://browser/content/browser.xhtml" });
  const noBrowserTab = makeTab({ url: null });

  const win = makeWin([
    httpsTab,
    httpTab,
    pinnedTab,
    closingTab,
    groupedTab,
    hiddenTab,
    aboutTab,
    chromeTab,
    noBrowserTab,
  ]);

  const candidates = AutoTabGroupingSuggestions.getCandidateTabs(win);

  Assert.deepEqual(
    candidates,
    [httpsTab, httpTab],
    "Only ungrouped, non-pinned, visible http(s) tabs are candidates"
  );
});

add_task(function test_getCandidateTabs_excludesStillLoadingTabs() {
  const loaded = makeTab({ url: "https://a.example/" });
  const busyTab = makeTab({ url: "https://b.example/", busy: true });
  const untitledTab = makeTab({ url: "https://c.example/", label: "" });
  const win = makeWin([loaded, busyTab, untitledTab]);

  const candidates = AutoTabGroupingSuggestions.getCandidateTabs(win);

  Assert.deepEqual(
    candidates,
    [loaded],
    "Still-loading and untitled tabs are excluded so clustering sees resolved titles"
  );
});

add_task(function test_getCandidateTabs_keepsMostRecentlyUsedPastTheCap() {
  const PREF = "browser.smartwindow.autoTabGrouping.maxCandidateTabs";
  const tabs = [5, 1, 4, 2, 3].map(lastAccessed =>
    makeTab({ url: `https://${lastAccessed}.example/`, lastAccessed })
  );
  const win = makeWin(tabs);
  try {
    Services.prefs.setIntPref(PREF, 5);
    Assert.deepEqual(
      AutoTabGroupingSuggestions.getCandidateTabs(win),
      tabs,
      "A window at the cap keeps every tab"
    );

    Services.prefs.setIntPref(PREF, 3);
    Assert.deepEqual(
      AutoTabGroupingSuggestions.getCandidateTabs(win),
      [tabs[0], tabs[2], tabs[4]],
      "Past the cap, the most recently used tabs are kept in tab strip order"
    );
  } finally {
    Services.prefs.clearUserPref(PREF);
  }
});

add_task(function test_selectClusters_filtersSortsAndCaps() {
  // Sizes 1 and 1 are below minTabsPerGroup (2) and dropped; the rest are
  // ordered largest-first and capped at maxGroups (3).
  const clusters = [
    makeCluster(1),
    makeCluster(5),
    makeCluster(3),
    makeCluster(2),
    makeCluster(4),
    makeCluster(1),
  ];

  const selected = AutoTabGroupingSuggestions.selectClusters(clusters);

  Assert.equal(selected.length, 3, "Capped at maxGroups");
  Assert.deepEqual(
    selected.map(c => c.tabs.length),
    [5, 4, 3],
    "Largest clusters first, small ones dropped, capped at maxGroups"
  );
});

add_task(function test_selectClusters_dropsLowCohesion() {
  // A large but incohesive cluster (below the 0.15 threshold) is dropped even
  // though it clears the size minimum, so weakly-related tabs aren't grouped.
  const clusters = [makeCluster(5, 0.05), makeCluster(3, 0.4)];

  const selected = AutoTabGroupingSuggestions.selectClusters(clusters);

  Assert.deepEqual(
    selected.map(c => c.tabs.length),
    [3],
    "Clusters below the cohesion threshold are dropped regardless of size"
  );
});

add_task(function test_selectClusters_minCohesionPrefTunesThreshold() {
  // Raising the pref to 0.5 now drops a 0.4-cohesion cluster that the default
  // 0.15 threshold would have kept.
  Services.prefs.setCharPref(
    "browser.smartwindow.autoTabGrouping.minCohesion",
    "0.5"
  );
  try {
    const selected = AutoTabGroupingSuggestions.selectClusters([
      makeCluster(5, 0.4),
      makeCluster(3, 0.6),
    ]);
    Assert.deepEqual(
      selected.map(c => c.tabs.length),
      [3],
      "Only clusters at or above the pref-configured threshold are kept"
    );
  } finally {
    Services.prefs.clearUserPref(
      "browser.smartwindow.autoTabGrouping.minCohesion"
    );
  }
});

add_task(function test_selectClusters_handlesEmptyInput() {
  Assert.deepEqual(
    AutoTabGroupingSuggestions.selectClusters(undefined),
    [],
    "undefined clusters -> no proposals"
  );
  Assert.deepEqual(
    AutoTabGroupingSuggestions.selectClusters([]),
    [],
    "no clusters -> no proposals"
  );
  Assert.deepEqual(
    AutoTabGroupingSuggestions.selectClusters([makeCluster(1), { tabs: null }]),
    [],
    "clusters below the minimum (or missing tabs) -> no proposals"
  );
});

add_task(function test_manager_usesSmartWindowTopicModelSlot() {
  const originalManager = AutoTabGroupingSuggestions._manager;
  AutoTabGroupingSuggestions._manager = null;
  try {
    const { topicGeneration } = AutoTabGroupingSuggestions.manager.config;
    // The SW naming model lives in its own featureId/engine slot so it can be
    // updated independently of the shared Smart Tab Grouping model; the model
    // itself resolves from the smart-window-tab-topic Remote Settings record.
    Assert.equal(
      topicGeneration.featureId,
      "smart-window-tab-topic",
      "manager uses the Smart Window topic featureId, not the shared one"
    );
    Assert.equal(
      topicGeneration.engineId,
      "smart-window-tab-topic-engine",
      "manager uses the Smart Window topic engineId"
    );
  } finally {
    AutoTabGroupingSuggestions._manager = originalManager;
  }
});

add_task(async function test_buildProposals_dropsUntitledGroups() {
  const originalManager = AutoTabGroupingSuggestions._manager;
  const originalLlm = AutoTabGroupingSuggestions._llmLabelForGroup;
  // LLM unavailable -> exercise the on-device path.
  AutoTabGroupingSuggestions._llmLabelForGroup = async () => {
    throw new Error("force on-device");
  };
  AutoTabGroupingSuggestions._manager = {
    async generateClusters() {
      return {
        clusterRepresentations: [makeCluster(3, 0.9), makeCluster(2, 0.9)],
      };
    },
    async getPredictedLabelForGroup(tabs) {
      // The larger cluster comes back unlabeled (a Trust & Safety signal).
      return tabs.length === 3 ? "" : "Work";
    },
  };
  AutoTabGroupingSuggestions._labelCache.clear();
  try {
    const proposals = await AutoTabGroupingSuggestions.buildProposals([]);
    Assert.equal(proposals.length, 1, "The untitled group is dropped");
    Assert.equal(proposals[0].label, "Work", "The labeled group is kept");
  } finally {
    AutoTabGroupingSuggestions._manager = originalManager;
    AutoTabGroupingSuggestions._llmLabelForGroup = originalLlm;
    AutoTabGroupingSuggestions._labelCache.clear();
  }
});

add_task(async function test_buildProposals_cachesLabelsBySourceTabs() {
  const originalManager = AutoTabGroupingSuggestions._manager;
  const originalLlm = AutoTabGroupingSuggestions._llmLabelForGroup;
  AutoTabGroupingSuggestions._llmLabelForGroup = async () => {
    throw new Error("force on-device");
  };
  const tabs = [
    makeTab({ url: "https://a.example/" }),
    makeTab({ url: "https://b.example/" }),
  ];
  let labelCalls = 0;
  AutoTabGroupingSuggestions._manager = {
    async generateClusters() {
      return { clusterRepresentations: [{ tabs, cohesion: 0.9 }] };
    },
    async getPredictedLabelForGroup() {
      labelCalls++;
      return "Work";
    },
  };
  AutoTabGroupingSuggestions._labelCache.clear();
  try {
    const first = await AutoTabGroupingSuggestions.buildProposals([]);
    const second = await AutoTabGroupingSuggestions.buildProposals([]);
    Assert.equal(
      labelCalls,
      1,
      "The label is generated once and reused for the same source tabs"
    );
    Assert.equal(first[0].label, "Work", "First run labels the group");
    Assert.equal(
      second[0].label,
      "Work",
      "Second run returns the cached label"
    );
  } finally {
    AutoTabGroupingSuggestions._manager = originalManager;
    AutoTabGroupingSuggestions._llmLabelForGroup = originalLlm;
    AutoTabGroupingSuggestions._labelCache.clear();
  }
});

add_task(function test_uniqueLabel_avoidsTakenLabels() {
  const taken = new Set(["news", "shopping 2"]);

  Assert.equal(
    AutoTabGroupingSuggestions.uniqueLabel("Work", taken),
    "Work",
    "A label nothing uses is kept as is"
  );
  Assert.equal(
    AutoTabGroupingSuggestions.uniqueLabel("NEWS", taken),
    "NEWS 2",
    "A label a group already has gets a suffix, whatever its case"
  );
  Assert.equal(
    AutoTabGroupingSuggestions.uniqueLabel("Shopping", taken),
    "Shopping",
    "Only the exact label counts as taken, not one with a suffix"
  );
  Assert.equal(
    AutoTabGroupingSuggestions.uniqueLabel("Shopping", taken),
    "Shopping 3",
    "The suffix skips the ones already in use, including the label just chosen"
  );
});

add_task(async function test_buildProposals_avoidsExistingGroupNames() {
  const originalManager = AutoTabGroupingSuggestions._manager;
  const originalLlm = AutoTabGroupingSuggestions._llmLabelForGroup;
  AutoTabGroupingSuggestions._llmLabelForGroup = async () => {
    throw new Error("force on-device");
  };
  AutoTabGroupingSuggestions._manager = {
    async generateClusters() {
      return {
        clusterRepresentations: [makeCluster(3, 0.9), makeCluster(2, 0.9)],
      };
    },
    async getPredictedLabelForGroup() {
      return "Work";
    },
  };
  AutoTabGroupingSuggestions._labelCache.clear();
  try {
    const proposals = await AutoTabGroupingSuggestions.buildProposals(
      [],
      ["Work"]
    );
    Assert.deepEqual(
      proposals.map(p => p.label),
      ["Work 2", "Work 3"],
      "Neither proposal repeats the existing group's name, nor each other's"
    );
  } finally {
    AutoTabGroupingSuggestions._manager = originalManager;
    AutoTabGroupingSuggestions._llmLabelForGroup = originalLlm;
    AutoTabGroupingSuggestions._labelCache.clear();
  }
});

add_task(function test_tabInfo_resolvesFaviconAndTitle() {
  const cached = AutoTabGroupingSuggestions.toTabInfo(
    makeTab({ url: "https://example.com/kids-bikes", label: "Kids Bikes" })
  );
  Assert.equal(
    cached.iconUrl,
    "page-icon:https://example.com/kids-bikes",
    "A tab with no live icon falls back to the Places-cached icon"
  );
  Assert.equal(cached.title, "Kids Bikes", "The tab label is the title");

  Assert.equal(
    AutoTabGroupingSuggestions.toTabInfo(
      makeTab({ iconUrl: "https://example.com/favicon.ico" })
    ).iconUrl,
    "page-icon:https://example.com/",
    "A web favicon is loaded through page-icon: rather than the network"
  );

  Assert.equal(
    AutoTabGroupingSuggestions.toTabInfo(
      makeTab({ iconUrl: "data:image/png;base64,AAAA" })
    ).iconUrl,
    "data:image/png;base64,AAAA",
    "A non-web icon is used as-is"
  );

  Assert.equal(
    AutoTabGroupingSuggestions.toTabInfo(makeTab({ url: null })).iconUrl,
    "chrome://global/skin/icons/defaultFavicon.svg",
    "A tab with no URI falls back to the default favicon"
  );

  Assert.equal(
    AutoTabGroupingSuggestions.toTabInfo(
      makeTab({ url: "https://example.com/", label: "" })
    ).title,
    "example.com",
    "A tab with no label falls back to its site name"
  );
});

add_task(function test_hasEnoughMemory_respectsThreshold() {
  const minimumPref = "browser.ml.minimumPhysicalMemory";
  const checkPref = "browser.ml.checkForMemory";
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(minimumPref);
    Services.prefs.clearUserPref(checkPref);
  });

  Services.prefs.setIntPref(minimumPref, 1024);
  Assert.ok(
    !AutoTabGroupingSuggestions.hasEnoughMemory,
    "Machines below the threshold do not qualify"
  );
  Assert.ok(
    !AutoTabGroupingSuggestions.isAvailable,
    "Not enough memory hides the feature"
  );

  Services.prefs.setBoolPref(checkPref, false);
  Assert.ok(
    AutoTabGroupingSuggestions.hasEnoughMemory,
    "Turning off the platform memory check turns off this one too"
  );
});

add_task(function test_isAvailable_followsEnabledPref() {
  const enabledPref = "browser.smartwindow.autoTabGrouping.enabled";
  const checkPref = "browser.ml.checkForMemory";
  Services.prefs.setBoolPref(checkPref, false);
  Services.prefs.setBoolPref(enabledPref, true);
  try {
    Assert.ok(
      AutoTabGroupingSuggestions.isAvailable,
      "Available while the feature is enabled"
    );
    Services.prefs.setBoolPref(enabledPref, false);
    Assert.ok(
      !AutoTabGroupingSuggestions.isAvailable,
      "Turning the feature off makes it unavailable"
    );
  } finally {
    Services.prefs.clearUserPref(enabledPref);
    Services.prefs.clearUserPref(checkPref);
  }
});

add_task(function test_isLocaleSupported_followsSupportedLocalesPref() {
  const PREF = "browser.smartwindow.autoTabGrouping.supportedLocales";
  const restoreLocales = useAppLocales(["en-US", "fr", "fr-CA", "es-ES"]);
  try {
    for (const [supported, locale, expected] of [
      ["en", "en-US", true],
      ["en", "fr", false],
      ["en,fr", "fr", true],
      ["en, fr", "fr-CA", true],
      ["en,fr", "es-ES", false],
      ["fr", "en-US", false],
    ]) {
      Services.prefs.setCharPref(PREF, supported);
      Services.locale.requestedLocales = [locale];
      Assert.equal(
        AutoTabGroupingSuggestions.isLocaleSupported,
        expected,
        `${locale} with supportedLocales "${supported}"`
      );
    }
  } finally {
    Services.prefs.clearUserPref(PREF);
    restoreLocales();
  }
});

add_task(async function test_buildProposals_followsThresholdPrefs() {
  const SHARED_PREF = "browser.tabs.groups.smart.agglomerativeThresholdInt";
  const NON_ENGLISH_PREF =
    "browser.smartwindow.autoTabGrouping.nonEnglishThresholdInt";
  const originalManager = AutoTabGroupingSuggestions._manager;
  const restoreLocales = useAppLocales(["en-US", "fr"]);
  Services.prefs.setIntPref(SHARED_PREF, 650);

  async function clusteringThreshold() {
    const { manager } = AutoTabGroupingSuggestions;
    let threshold;
    manager.generateClusters = async () => {
      threshold = manager.config.clustering.agglomerativeThreshold;
      return { clusterRepresentations: [] };
    };
    await AutoTabGroupingSuggestions.buildProposals([]);
    return threshold;
  }

  try {
    Services.locale.requestedLocales = ["en-US"];
    AutoTabGroupingSuggestions._manager = null;
    Assert.equal(await clusteringThreshold(), 0.65, "en-US uses the cutoff");
    Services.prefs.setIntPref(SHARED_PREF, 700);
    Assert.equal(
      await clusteringThreshold(),
      0.7,
      "A cutoff changed after the manager was built applies to the next run"
    );

    Services.locale.requestedLocales = ["fr"];
    AutoTabGroupingSuggestions._manager = null;
    Assert.equal(
      await clusteringThreshold(),
      0.55,
      "fr uses the non-English cutoff"
    );
    Services.prefs.setIntPref(NON_ENGLISH_PREF, 500);
    Assert.equal(
      await clusteringThreshold(),
      0.5,
      "A non-English cutoff changed after the manager was built applies too"
    );
    Services.prefs.setIntPref(NON_ENGLISH_PREF, 0);
    Assert.equal(
      await clusteringThreshold(),
      0.7,
      "A non-English cutoff of 0 falls back to the shared cutoff"
    );
  } finally {
    Services.prefs.clearUserPref(SHARED_PREF);
    Services.prefs.clearUserPref(NON_ENGLISH_PREF);
    AutoTabGroupingSuggestions._manager = originalManager;
    restoreLocales();
  }
});

add_task(
  async function test_labelForGroup_dropsGroupForNonEnglishWhenLlmFails() {
    const originalManager = AutoTabGroupingSuggestions._manager;
    const originalLlm = AutoTabGroupingSuggestions._llmLabelForGroup;
    const restoreLocales = useAppLocales(["en-US", "fr"]);
    Services.locale.requestedLocales = ["fr"];
    let llmCalls = 0;
    let onDeviceCalls = 0;
    AutoTabGroupingSuggestions._llmLabelForGroup = async () => {
      llmCalls++;
      throw new Error("LLM unavailable");
    };
    AutoTabGroupingSuggestions._manager = {
      async getPredictedLabelForGroup() {
        onDeviceCalls++;
        return "English name";
      },
    };
    AutoTabGroupingSuggestions._labelCache.clear();
    const tabs = [
      makeTab({ url: "https://example.com/a" }),
      makeTab({ url: "https://example.com/b" }),
    ];
    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        Assert.equal(
          await AutoTabGroupingSuggestions._labelForGroup(tabs, []),
          "",
          `Attempt ${attempt} returns no name, so the group is dropped`
        );
      }
      Assert.equal(
        onDeviceCalls,
        0,
        "The English-only on-device model is not used"
      );
      Assert.equal(
        llmCalls,
        2,
        "The failure is not cached, so the next open retries the LLM"
      );
    } finally {
      AutoTabGroupingSuggestions._manager = originalManager;
      AutoTabGroupingSuggestions._llmLabelForGroup = originalLlm;
      AutoTabGroupingSuggestions._labelCache.clear();
      restoreLocales();
    }
  }
);

add_task(async function test_preloadModels_skipsNamingModelForNonEnglish() {
  const originalManager = AutoTabGroupingSuggestions._manager;
  const restoreLocales = useAppLocales(["en-US", "fr"]);
  const calls = [];
  AutoTabGroupingSuggestions._manager = {
    async preloadAllModels() {
      calls.push("all models");
    },
    async initEmbeddingEngine() {
      calls.push("embedding engine");
    },
  };
  try {
    for (const [locale, expected] of [
      ["fr", "embedding engine"],
      ["en-US", "all models"],
    ]) {
      Services.locale.requestedLocales = [locale];
      calls.length = 0;
      await AutoTabGroupingSuggestions._preloadModels();
      Assert.deepEqual(calls, [expected], `${locale} preloads ${expected}`);
    }
  } finally {
    AutoTabGroupingSuggestions._manager = originalManager;
    restoreLocales();
  }
});

add_task(function test_trimLabel_dropsDanglingConnectives() {
  for (const [label, expected] of [
    ["Python", "Python"],
    ["Bijoux en or", "Bijoux en or"],
    ["Meetings ET", "Meetings ET"],
    ["Personal Tasks and Communications", "Personal Tasks"],
    ["Télémétrie et performances", "Télémétrie"],
    ["Reiseplanung oder Urlaubsziele", "Reiseplanung"],
    ["Programmation et développement web", "Programmation"],
  ]) {
    Assert.equal(
      AutoTabGroupingSuggestions.trimLabel(label),
      expected,
      `"${label}" becomes "${expected}"`
    );
  }
});

add_task(async function test_nimbus_overwrites_atg_prefs() {
  // Proves the `autoTabGrouping` Nimbus feature's setPref variables actually
  // reach their prefs -- the FeatureManifest name -> pref mapping is not checked
  // at build time. The variables use branch:default, which Nimbus only reverts on
  // restart (not this session), so this asserts the override, not restoration.
  const PREF_MIN_CANDIDATE_TABS =
    "browser.smartwindow.autoTabGrouping.minCandidateTabs";
  const PREF_MAX_CANDIDATE_TABS =
    "browser.smartwindow.autoTabGrouping.maxCandidateTabs";
  const PREF_MIN_COHESION = "browser.smartwindow.autoTabGrouping.minCohesion";
  const PREF_SUPPORTED_LOCALES =
    "browser.smartwindow.autoTabGrouping.supportedLocales";
  const PREF_THRESHOLD = "browser.tabs.groups.smart.agglomerativeThresholdInt";
  const PREF_NON_ENGLISH_THRESHOLD =
    "browser.smartwindow.autoTabGrouping.nonEnglishThresholdInt";

  const defaults = Services.prefs.getDefaultBranch("");
  defaults.setIntPref(PREF_MIN_CANDIDATE_TABS, 2);
  defaults.setIntPref(PREF_MAX_CANDIDATE_TABS, 200);
  defaults.setCharPref(PREF_MIN_COHESION, "0.15");
  defaults.setCharPref(PREF_SUPPORTED_LOCALES, "en");
  defaults.setIntPref(PREF_THRESHOLD, 650);
  defaults.setIntPref(PREF_NON_ENGLISH_THRESHOLD, 550);
  Assert.equal(
    Services.prefs.getIntPref(PREF_MIN_CANDIDATE_TABS),
    2,
    "minCandidateTabs starts at its in-tree default"
  );

  const { cleanup } = await NimbusTestUtils.setupTest();
  const unenroll = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "autoTabGrouping",
    value: {
      minCandidateTabs: 5,
      maxCandidateTabs: 150,
      minCohesion: "0.5",
      supportedLocales: "en,fr",
      thresholdInt: 700,
      nonEnglishThresholdInt: 600,
    },
  });

  Assert.equal(
    Services.prefs.getIntPref(PREF_MIN_CANDIDATE_TABS),
    5,
    "enrolling overwrites the int pref (minCandidateTabs)"
  );
  Assert.equal(
    Services.prefs.getIntPref(PREF_MAX_CANDIDATE_TABS),
    150,
    "enrolling overwrites the tab cap (maxCandidateTabs)"
  );
  // minCohesion is a float stored as a string pref; the Nimbus variable is typed
  // string, so the enrolled value must arrive verbatim in the string pref.
  Assert.equal(
    Services.prefs.getCharPref(PREF_MIN_COHESION),
    "0.5",
    "enrolling overwrites the float-as-string pref (minCohesion)"
  );
  Assert.equal(
    Services.prefs.getCharPref(PREF_SUPPORTED_LOCALES),
    "en,fr",
    "enrolling overwrites the supported locales (supportedLocales)"
  );
  Assert.equal(
    Services.prefs.getIntPref(PREF_THRESHOLD),
    700,
    "enrolling overwrites the cutoff (thresholdInt)"
  );
  Assert.equal(
    Services.prefs.getIntPref(PREF_NON_ENGLISH_THRESHOLD),
    600,
    "enrolling overwrites the non-English cutoff (nonEnglishThresholdInt)"
  );

  await unenroll();
  await cleanup();
});
