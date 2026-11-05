/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";
import {
  getNotificationSites,
  isClosedDeliveryAvailable,
  isNotificationChange,
} from "chrome://browser/content/preferences/config/notification-permissions.mjs";

const FILTER_ID = "notificationsFilter";
const LIST_ID = "notification-sites-list";

/**
 * Case- and diacritic-insensitive, so searching "uber" matches "über.example".
 *
 * @param {string} value
 * @returns {string}
 */
function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * @param {boolean} withState Whether to label the state column. The empty and
 *   no-results states have no rows to put under it.
 * @returns {object} The list's header row.
 */
function listHeader(withState) {
  return {
    key: "list-header",
    control: "moz-box-item",
    slot: "header",
    l10nId: withState
      ? "notifications-list-header"
      : "notifications-list-header-empty",
    controlAttrs: {
      class: "box-header-bold",
    },
    options: withState
      ? [
          {
            key: "list-header-state",
            control: "span",
            slot: "actions",
            l10nId: "notifications-list-header-state",
          },
        ]
      : [],
  };
}

/**
 * @param {string} id
 * @param {string} l10nId
 * @returns {object} A row standing in for the list, under its header.
 */
function messageRow(id, l10nId) {
  return { id, key: id, control: "moz-box-item", l10nId };
}

Preferences.addSetting({
  id: FILTER_ID,
  get(val) {
    return val || "";
  },
});

Preferences.addSetting(
  class extends Preferences.AsyncSetting {
    static id = LIST_ID;

    sites = [];
    query = "";

    beforeRefresh() {
      this.sites = getNotificationSites();
    }

    // Every branch returns options rather than items, because setting-control
    // merges each config into the last one and renders items in preference to
    // options, so a config that once had items can never show options again.
    async getControlConfig() {
      if (!this.sites.length) {
        return {
          options: [
            listHeader(false),
            messageRow("notifications-empty", "notifications-empty-message"),
          ],
        };
      }

      let query = normalize(this.query);
      let matches = query
        ? this.sites.filter(site => normalize(site.displayHost).includes(query))
        : this.sites;

      if (!matches.length) {
        return {
          options: [
            listHeader(false),
            messageRow(
              "notifications-no-results",
              "notifications-no-results-message"
            ),
          ],
        };
      }

      // Where closed delivery is available, every allowed site reads as Always
      // until bug 2073602 introduces the per-site closed-delivery exclusion.
      let grantedL10nId = isClosedDeliveryAvailable()
        ? "notifications-state-always"
        : "notifications-state-allow";
      // The medium-icon layout draws favicons at 24px, larger than the 16px
      // page-icon defaults to.
      let iconSize = Math.ceil(24 * window.devicePixelRatio);

      return {
        options: [
          listHeader(true),
          ...matches.map(site => ({
            key: site.origin,
            control: "moz-box-item",
            iconSrc: `page-icon:${site.origin}/#size=${iconSize}`,
            controlAttrs: {
              label: site.displayHost,
              value: site.origin,
              layout: "medium-icon",
            },
            options: [
              {
                key: `${site.origin}-state`,
                control: "span",
                slot: "actions",
                l10nId:
                  site.capability === Services.perms.ALLOW_ACTION
                    ? grantedL10nId
                    : "notifications-state-never",
              },
            ],
          })),
        ],
      };
    }

    setup() {
      Services.obs.addObserver(this.#onPermissionChanged, "perm-changed");
      document.addEventListener("MozInputSearch:search", this.#onSearch);

      return () => {
        Services.obs.removeObserver(this.#onPermissionChanged, "perm-changed");
        document.removeEventListener("MozInputSearch:search", this.#onSearch);
      };
    }

    #onPermissionChanged = subject => {
      if (isNotificationChange(subject)) {
        this.emitChange();
      }
    };

    // The event is composed, so it reaches the document from the input.
    #onSearch = event => {
      if (event.target.id !== FILTER_ID) {
        return;
      }
      this.query = event.detail.query;
      this.emitChange();
    };
  }
);

SettingGroupManager.registerGroups({
  websiteNotifications: {
    l10nId: "notifications-website-card-header",
    headingLevel: 2,
    items: [
      {
        id: FILTER_ID,
        control: "moz-input-search",
        l10nId: "notifications-filter",
        controlAttrs: {
          "aria-controls": LIST_ID,
          "data-l10n-attrs": "placeholder",
        },
      },
      {
        id: LIST_ID,
        control: "moz-box-group",
        controlAttrs: {
          type: "list",
        },
      },
    ],
  },
});
