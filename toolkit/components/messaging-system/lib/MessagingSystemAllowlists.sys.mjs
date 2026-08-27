/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Remote Settings backed cache that allows for extending the in-tree
 * messaging-system allowlist off-train. Consumers union their hardcoded
 * baseline with the getters here, so an empty or unavailable collection means
 * only items in the baseline list will be allowed.
 *
 * Records in the `ms-action-allowlists` collection are discriminated by a
 * `list` field:
 *   { id, list: "actionOnly", value: "<SpecialMessageAction type>" }
 *   { id, list: "setPref", value: "<pref name>" }
 *
 * Three lists decide whether a capability is granted:
 *
 *   1. The in-tree baseline allowlist, hardcoded in the consumer. It always
 *      wins, and adding to it takes a patch and code review. For `actionOnly`
 *      it is ALLOWED_ACTION_MESSAGE_ACTIONS in
 *      _ASRouter._isAllowedActionOnlyMessageAction (ASRouter.sys.mjs); for
 *      `setPref` it is allowedPrefs in SpecialMessageActions.setPref.
 *   2. The in-tree blocklist in MessagingSystemBlocklists.sys.mjs. It discards
 *      matching records from this collection and does nothing else. It cannot
 *      revoke a baseline entry.
 *   3. The records in this collection, which grant whatever survives step 2.
 *
 * That is: allowed = baseline + (collection records - blocklist). The caches
 * below hold step 3 only, never the baseline.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  MessagingSystemBlocklists:
    "resource://messaging-system/lib/MessagingSystemBlocklists.sys.mjs",
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
});

const COLLECTION_ID = "ms-action-allowlists";
// Caches of Remote Settings supplied entries, keyed by the record's `list`
// discriminator. Empty until the first successful load. These never hold the
// in-tree baseline entries, which each consumer keeps for itself.
let gActionOnly = new Set();
let gSetPref = new Set();
let gClient = null;
let gInitPromise = null;

// Where each list's in-tree baseline lives, so the error below can point at the
// one place that grants a blocklisted entry.
const BASELINE_LOCATIONS = {
  actionOnly: "ALLOWED_ACTION_MESSAGE_ACTIONS in ASRouter.sys.mjs",
  setPref: "allowedPrefs in SpecialMessageActions.setPref",
};

function reject(list, value) {
  console.error(
    `${COLLECTION_ID}: ignoring blocklisted ${list} entry "${value}". ` +
      `Remote Settings cannot grant it. Granting it takes a patch adding it to ` +
      `${BASELINE_LOCATIONS[list]}.`
  );
}

function update({ actionOnly: actionOnlyValues, setPref: setPrefValues }) {
  const actionOnly = new Set();
  for (const value of actionOnlyValues) {
    if (lazy.MessagingSystemBlocklists.isActionOnlyActionBlocked(value)) {
      reject("actionOnly", value);
      continue;
    }
    actionOnly.add(value);
  }

  const setPref = new Set();
  for (const value of setPrefValues) {
    if (lazy.MessagingSystemBlocklists.isSetPrefBlocked(value)) {
      reject("setPref", value);
      continue;
    }
    setPref.add(value);
  }

  gActionOnly = actionOnly;
  gSetPref = setPref;
}

function updateFromRecords(records) {
  const actionOnly = [];
  const setPref = [];
  for (const record of records ?? []) {
    if (typeof record?.value !== "string") {
      continue;
    }
    if (record.list === "actionOnly") {
      actionOnly.push(record.value);
    } else if (record.list === "setPref") {
      setPref.push(record.value);
    }
  }
  update({ actionOnly, setPref });
}

function onSync({ data: { current } }) {
  updateFromRecords(current);
}

export const MessagingSystemAllowlists = {
  // Wrapper around lazy.RemoteSettings for stubbing in tests.
  RemoteSettings(...args) {
    return lazy.RemoteSettings(...args);
  },

  /**
   * Idempotently create the Remote Settings client, subscribe to updates, and
   * load the collection into the cache. Safe to call repeatedly and from
   * multiple callers concurrently. Never throws.
   *
   * @returns {Promise<void>}
   */
  ensureInit() {
    if (!gInitPromise) {
      gInitPromise = (async () => {
        try {
          gClient = this.RemoteSettings(COLLECTION_ID);
          gClient.on("sync", onSync);
          updateFromRecords(await gClient.get());
        } catch (error) {
          console.error(`Failed to load ${COLLECTION_ID}:`, error);
          if (gClient) {
            gClient.off("sync", onSync);
            gClient = null;
          }
          gInitPromise = null;
        }
      })();
    }
    return gInitPromise;
  },

  /**
   * Remote Settings supplied action types allowed for action_only messages.
   *
   * @returns {string[]}
   */
  getActionOnlyActions() {
    return [...gActionOnly];
  },

  /**
   * Remote Settings supplied pref names allowed for the SET_PREF special
   * message action.
   *
   * @returns {string[]}
   */
  getAllowedPrefs() {
    return [...gSetPref];
  },

  // TEST-ONLY: seed the cache directly without Remote Settings. Goes through
  // the same blocklist filtering as a real sync, so a test cannot assert a
  // capability that Remote Settings could never actually grant.
  _setForTest({ actionOnly = [], setPref = [] } = {}) {
    update({ actionOnly, setPref });
  },

  // TEST-ONLY: reset all cached state and the Remote Settings client.
  _resetForTest() {
    if (gClient) {
      gClient.off("sync", onSync);
    }
    gActionOnly = new Set();
    gSetPref = new Set();
    gClient = null;
    gInitPromise = null;
  },
};
