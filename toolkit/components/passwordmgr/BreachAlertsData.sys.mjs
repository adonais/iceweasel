/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  LoginHelper: "resource://gre/modules/LoginHelper.sys.mjs",
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
  RemoteSettingsClient:
    "resource://services-settings/RemoteSettingsClient.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return lazy.LoginHelper.createLogger("BreachAlertsData");
});

/**
 * Retrieve breach data from Firefox Monitor via RemoteSettings.
 */
export class BreachAlertsData {
  /**
   * @type RemoteSettingsClient
   * @memberof BreachAlertsData
   */
  #breachClient = null;

  /**
   * For the exact data structure, see https://github.com/mozilla/blurts-server/blob/6e248770134b0763f60dbac8a17f57803f6760be/src/scripts/cronjobs/updateBreachesInRemoteSettings/updateBreachesInRemoteSettings.ts#L16-L19
   *
   * @type object[]
   * @memberof BreachAlertsData
   */
  #breachData = [];

  /**
   * @type string
   * @memberof BreachAlertsData
   */
  static REMOTE_SETTINGS_COLLECTION = "fxmonitor-breaches";

  /**
   * Handles the Remote Settings sync event
   *
   * @param {object} aEvent
   * @param {Array} aEvent.current Records that are currently in the collection after the sync event
   * @param {Array} aEvent.created Records that were created
   * @param {Array} aEvent.updated Records that were updated
   * @param {Array} aEvent.deleted Records that were deleted
   * @memberof BreachAlertsData
   */
  onRemoteSettingsSync(aEvent) {
    let {
      data: { current },
    } = aEvent;
    this.#breachData = current;
    lazy.log.debug("Breach data synced from Remote Settings");
  }

  /**
   * Initialize the breach data client and load initial data
   *
   * @returns {Promise<object[]>} The breach data array. For the exact data structure, see https://github.com/mozilla/blurts-server/blob/6e248770134b0763f60dbac8a17f57803f6760be/src/scripts/cronjobs/updateBreachesInRemoteSettings/updateBreachesInRemoteSettings.ts#L16-L19
   * @memberof BreachAlertsData
   */
  async getAllBreaches() {
    if (!this.#breachClient) {
      try {
        this.#breachClient = lazy.RemoteSettings(
          BreachAlertsData.REMOTE_SETTINGS_COLLECTION
        );
        this.#breachClient.on("sync", event =>
          this.onRemoteSettingsSync(event)
        );
        this.#breachData = await this.#breachClient.get();
        lazy.log.debug(`Loaded ${this.#breachData.length} breach records`);
      } catch (ex) {
        if (ex instanceof lazy.RemoteSettingsClient.UnknownCollectionError) {
          lazy.log.warn(
            "Could not get Remote Settings collection.",
            BreachAlertsData.REMOTE_SETTINGS_COLLECTION,
            ex
          );
          return [];
        }
        lazy.log.error("Error loading breach data from Remote Settings:", ex);
        return [];
      }
    }
    return this.#breachData;
  }

  /**
   * Register a callback to be invoked with the current breach records
   * whenever the underlying Remote Settings collection syncs.
   *
   * @param {Function} callback Invoked with the array of current breach records.
   * @memberof BreachAlertsData
   */
  async subscribe(callback) {
    await this.getAllBreaches();
    this.#breachClient.on("sync", event => callback(event.data.current));
  }

  /**
   * Find a breach that affects the given site/host
   *
   * @param {string} site The hostname to check for breaches
   * @returns {Promise<object|null>} The breach object if found, null otherwise
   * @memberof BreachAlertsData
   */
  async getBreachForSite(site) {
    if (!site) {
      return null;
    }

    const breaches = await this.getAllBreaches();
    if (breaches.length === 0) {
      return null;
    }

    return breaches.find(breach => {
      return breach.Domain && Services.eTLD.hasRootDomain(site, breach.Domain);
    });
  }
}
