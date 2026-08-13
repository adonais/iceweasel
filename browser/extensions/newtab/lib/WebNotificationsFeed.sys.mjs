/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * NotificationStoreEntry
 * ---
 * What the platform writes to disk for each web notification — one entry
 * per `(origin, id)` pair under `<profileDir>/notificationstore.json`.
 * This is the raw input shape `normalizeEntry` consumes; everything
 * downstream is derived from it.
 *
 * @typedef {object} NotificationStoreEntry
 * @property {string} id
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [tag]
 * @property {string} [dir]
 * @property {string} [icon]
 * @property {boolean} [requireInteraction]
 * @property {number} [timestamp]
 */

/**
 * NormalizedNotification
 * ---
 * A single notification as it appears in the slice — what UI consumers
 * actually iterate over to render a card or count an unread. Mostly a
 * pass-through of `NotificationStoreEntry` with `origin` injected, because
 * the on-disk file keeps origin as the outer map key, not on the entry
 * itself, and flat consumers need to recover it.
 *
 * @typedef {object} NormalizedNotification
 * @property {string} id
 * @property {string} origin
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [tag]
 * @property {string} [dir]
 * @property {string} [icon]
 * @property {boolean} [requireInteraction]
 * @property {number} [timestamp]
 */

/**
 * WebNotificationsUpdatedPayload
 * ---
 * What the feed dispatches when a snapshot finishes successfully. The
 * reducer copies these fields onto the slice verbatim and flips
 * `initialized` to true. If you're a UI consumer you probably want
 * `WebNotificationsSlice` instead — this typedef is for the
 * action-handling layer (reducers, middleware, devtools introspection).
 *
 * @typedef {object} WebNotificationsUpdatedPayload
 * @property {number} lastUpdated
 * @property {{[id: string]: NormalizedNotification}} notifications
 * @property {{[origin: string]: string[]}} byOrigin
 */

/**
 * WebNotificationsError
 * ---
 * Carries why a snapshot didn't make it. Lands on `slice.error` so a
 * debug surface can show "couldn't read notifications: <message>"
 * instead of throwing or silently going stale.
 *
 * @typedef {object} WebNotificationsError
 * @property {string} message - Stringified error.
 */

/**
 * WebNotificationsSlice
 * ---
 * The shape of `state.WebNotifications` that UI consumers actually
 * read. If you're writing a React component or a selector and your
 * code calls `useSelector(s => s.WebNotifications)`, this is the
 * contract you're working against.
 *
 * @typedef {object} WebNotificationsSlice
 * @property {boolean} initialized - True after the first successful snapshot.
 * @property {?number} lastUpdated - ms timestamp of the most recent snapshot.
 * @property {{[id: string]: NormalizedNotification}} notifications
 * @property {{[origin: string]: string[]}} byOrigin
 * @property {?WebNotificationsError} error - Last snapshot error, if any.
 */

import {
  actionCreators as ac,
  actionTypes as at,
} from "resource://newtab/common/Actions.mjs";

// The platform persists web notifications to this file in the user's profile.
// The name is a hardcoded literal in dom/notification/NotificationDB.sys.mjs;
// renaming it would require profile-data migration, so it's the closest thing
// to a stable contract we get without a documented API. Reading is purely an
// observation — there's no file watcher, no reconciliation, no OS effect.
const NOTIFICATION_STORE_FILENAME = "notificationstore.json";

// Fields we copy through from a stored entry. Everything else is
// dropped to keep the IPC payload tight
const PASSTHROUGH_FIELDS = [
  "id",
  "title",
  "dir",
  "body",
  "tag",
  "icon",
  "requireInteraction",
  "timestamp",
];

/**
 * readNotificationStore
 * ---
 * Reads and parses the platform's persisted notification store. The platform
 * writes this file via atomic rename, so we never observe a torn read. A
 * missing file (first-run profile) resolves to an empty object.
 *
 * @returns {Promise<{[origin: string]: {[id: string]: NotificationStoreEntry}}>}
 */
async function readNotificationStore() {
  const path = PathUtils.join(
    PathUtils.profileDir,
    NOTIFICATION_STORE_FILENAME
  );
  try {
    const text = await IOUtils.readUTF8(path);
    return text.length ? JSON.parse(text) : {};
  } catch (e) {
    if (DOMException.isInstance(e) && e.name === "NotFoundError") {
      return {};
    }
    throw e;
  }
}

/**
 * normalizeEntry
 * ---
 * Takes a raw on-disk entry and returns the slim shape consumers see in
 * the slice. We pass through the display-relevant fields, drop everything
 * else (page payloads, SW plumbing, anything no UI needs), and inject
 * `origin` because the on-disk store keeps it as the outer map key, not
 * on the entry itself.
 *
 * @param {NotificationStoreEntry} entry
 * @param {string} origin
 * @returns {NormalizedNotification}
 */
function normalizeEntry(entry, origin) {
  const out = { origin };
  for (const key of PASSTHROUGH_FIELDS) {
    if (entry[key] !== undefined) {
      out[key] = entry[key];
    }
  }
  return out;
}

/**
 * WebNotificationsFeed
 * ---
 * Feed that publishes a snapshot of the platform's persisted web
 * notifications into the newtab Redux slice. Reads `notificationstore.json`
 * directly off disk, normalizes the entries, and dispatches the result.
 *
 * Refresh convention:
 *   - INIT seeds the slice once at feed startup and broadcasts it, so a tab
 *     already open — and, via NewTabInit's full-state reply, every tab opened
 *     afterwards — starts from a snapshot.
 *   - Every later refresh is targeted at a single tab, never broadcast: the feed
 *     re-reads disk and answers just the requesting tab with AlsoToOneContent,
 *     which also runs the main reducer so main state stays warm as the seed for
 *     the next new tab. Blast radius is one tab per event, not a fan-out to
 *     every open page.
 *   - NEW_TAB_LOAD drives a targeted refresh today: (re)loading a tab re-reads
 *     disk for that tab, so "reload to see current counts" works without any UI.
 *   - WEB_NOTIFICATIONS_REQUEST is the entry point content will drive A consumer
 *     dispatches `ac.OnlyToMain({ type: at.WEB_NOTIFICATIONS_REQUEST })` on
 *     mount and on becoming visible; the feed answers that tab only.
 *   - A NotificationDB.save() observer is the eventual true-push that retires
 *     the poll, but it lives in dom/notification/ (platform code, outside this
 *     XPI), so it is non-train-hoppable and rides the release train.
 *
 * Default-off via the `feeds.webnotificationsfeed` pref
 */
export class WebNotificationsFeed {
  /**
   * Routes one snapshot action: to a single tab when `target` is a port id
   * (this also runs the main reducer, keeping main state ready for
   * the next new tab), or to every open tab when it is omitted.
   *
   * @param {object} action
   * @param {string} [target] - Port id of the tab to answer.
   */
  _sendToTabs(action, target) {
    this.store.dispatch(
      target
        ? ac.AlsoToOneContent(action, target)
        : ac.BroadcastToContent(action)
    );
  }

  /**
   * Snapshots the on-disk notification store and dispatches the normalized
   * result. INIT omits `target` to seed all tabs; every other trigger passes
   * the requesting tab's port so the refresh stays scoped to that one tab.
   *
   * @param {string} [target] - Port id from `action.meta.fromTarget`.
   * @returns {Promise<void>}
   */
  async _snapshot(target) {
    let raw;
    try {
      raw = await readNotificationStore();
    } catch (e) {
      this._sendToTabs(
        {
          type: at.WEB_NOTIFICATIONS_ERROR,
          data: { message: String(e) },
        },
        target
      );
      return;
    }

    const notifications = Object.create(null);
    const byOrigin = Object.create(null);

    // Safe to flat-key by id alone: the platform derives id from a hash of
    // (origin, tag-or-uuid), so cross-origin collisions are negligible at
    // any realistic per-user count. Same convention as core notifications
    for (const origin of Object.keys(raw)) {
      const originIds = [];
      for (const id of Object.keys(raw[origin])) {
        notifications[id] = normalizeEntry(raw[origin][id], origin);
        originIds.push(id);
      }
      byOrigin[origin] = originIds;
    }

    this._sendToTabs(
      {
        type: at.WEB_NOTIFICATIONS_UPDATED,
        data: {
          lastUpdated: Date.now(),
          notifications,
          byOrigin,
        },
      },
      target
    );
  }

  onAction(action) {
    switch (action.type) {
      case at.INIT:
        this._snapshot();
        break;
      case at.NEW_TAB_LOAD:
      case at.WEB_NOTIFICATIONS_REQUEST:
        this._snapshot(action.meta?.fromTarget);
        break;
    }
  }
}
