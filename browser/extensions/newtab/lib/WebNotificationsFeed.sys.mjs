/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * NormalizedNotification
 * ---
 * A single notification as it appears in the slice — what UI consumers
 * iterate over to render a card or count a badge. The feed produces this
 * shape from two sources that it reconciles into one live map: the on-disk
 * store (Service-Worker-backed, survives restart) and the platform's live
 * capture observers (which also see transient page `new Notification()`
 * notifications the disk store never records).
 *
 * @typedef {object} NormalizedNotification
 * @property {string} id
 * @property {string} origin
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [tag] The app-chosen tag, present only on entries read
 *   from the on-disk store: `nsIAlertNotification` reports `id` rather than the
 *   tag as its name for content principals, so the live capture path cannot
 *   recover it. Kept in the slice for parity with the on-disk shape; not
 *   rendered, and not the key anything is closed by.
 * @property {string} [dir]
 * @property {string} [icon]
 * @property {boolean} [requireInteraction]
 * @property {number} [timestamp]
 */

/**
 * WebNotificationsSlice
 * ---
 * The shape of `state.WebNotifications` that UI consumers read.
 *
 * @typedef {object} WebNotificationsSlice
 * @property {boolean} initialized True after the first snapshot.
 * @property {?number} lastUpdated ms timestamp of the last change.
 * @property {{[id: string]: NormalizedNotification}} notifications
 * @property {{[origin: string]: string[]}} byOrigin id index, per origin.
 * @property {?{message: string}} error Last snapshot error, if any.
 */

import {
  actionCreators as ac,
  actionTypes as at,
} from "resource://newtab/common/Actions.mjs";

// The platform persists Service-Worker-backed web notifications to this file in
// the user's profile. The name is a hardcoded literal in
// dom/notification/NotificationDB.sys.mjs; renaming it would require
// profile-data migration, so it is the closest thing to a stable contract we
// get. Reading it is pure observation — no file watcher, no OS effect.
const NOTIFICATION_STORE_FILENAME = "notificationstore.json";

// Parent-process observer topics fired by toolkit/components/alerts for every
// web notification shown/closed. The subject is an nsIAlertNotification.
const TOPIC_SHOWN = "web-notification-shown";
const TOPIC_CLOSED = "web-notification-closed";

// The feature gate (Nimbus/about:config; decides whether the feature exists at
// all) and the user preference the customize toggle writes. Both must be set
// for the feed to observe: the platform reports notifications regardless, but
// with no observer registered that reporting goes nowhere.
const PREF_SYSTEM = "system.showWebNotifications";
const PREF_USER = "showWebNotifications";

const ALERTS_SERVICE = "@mozilla.org/alerts-service;1";
const NOTIFICATION_STORAGE = "@mozilla.org/notificationStorage;1";
const NOTIFICATION_HANDLER = "@mozilla.org/notification-handler;1";

// Origins that fire a notification and immediately close it themselves, using it
// as a bell rather than as a durable item. The feed otherwise mirrors the system
// and releases on close, which would drop these before they were ever seen (see
// `_shouldReleaseOnClose`). This is for sites whose close says nothing about the
// item's fate, not for sites whose notifications are merely short-lived: a site
// that lets its toast run its course is held up by the system for as long as it
// asked for, and its close is a real one. Keyed by the origin the notification is
// delivered under (post-alias app origin), which `alert.principal.origin` reports.
const STICKY_ORIGINS = new Set(["https://mail.google.com"]);

// Fields copied through from a stored (on-disk) entry. Everything else the
// platform keeps (page payloads, worker plumbing) is dropped.
const DISK_PASSTHROUGH_FIELDS = [
  "id",
  "title",
  "body",
  "tag",
  "dir",
  "icon",
  "requireInteraction",
  "timestamp",
];

/**
 * Reads and parses the platform's persisted notification store. The platform
 * writes it via atomic rename, so we never observe a torn read. A missing file
 * (first-run profile) resolves to an empty object.
 *
 * @returns {Promise<{[origin: string]: {[id: string]: object}}>}
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
 * Normalizes a raw on-disk entry.
 *
 * @param {object} entry
 * @param {string} origin
 * @returns {NormalizedNotification}
 */
function normalizeDiskEntry(entry, origin) {
  const out = { origin };
  for (const key of DISK_PASSTHROUGH_FIELDS) {
    if (entry[key] !== undefined) {
      out[key] = entry[key];
    }
  }
  return out;
}

/**
 * WebNotificationsFeed
 * ---
 * Publishes a live view of the user's web notifications into the newtab slice.
 *
 * The feed owns the authoritative map in the parent process:
 *   - Seeding reads `notificationstore.json` (Service-Worker history that
 *     survives restart) and broadcasts a full snapshot to open tabs.
 *   - Two platform observers keep it current: a notification being shown adds
 *     an entry (and broadcasts an ADDED delta); being closed removes it (a
 *     REMOVED delta). This is the only place transient page notifications are
 *     ever seen, so they live only for as long as their OS toast does.
 *   - Content is a pure projection: it dispatches intents (dismiss, click) to
 *     main and re-renders from the broadcast result, never mutating locally.
 *
 * New tabs need no special handling — the main reducer stays current from the
 * broadcasts, so NewTabInit hands each new tab an up-to-date snapshot.
 *
 * This is a system feed: it is constructed for every profile and does nothing
 * until the feature gate (`system.showWebNotifications`, or a trainhop
 * enrollment via `trainhopConfig.webNotifications.enabled`) and the user
 * preference (`showWebNotifications`) are set. It observes only while they are,
 * which is what keeps platform capture inert for everyone else — the platform
 * reports notifications either way, but to no one.
 */
export class WebNotificationsFeed {
  constructor() {
    /** @type {{[id: string]: NormalizedNotification}} */
    this._notifications = Object.create(null);
    /** @type {Map<string, Set<string>>} origin -> set of ids */
    this._byOrigin = new Map();
    this._observing = false;
  }

  _broadcast(action) {
    this.store.dispatch(ac.BroadcastToContent(action));
  }

  /** Builds the plain `byOrigin` object the slice expects from the id sets. */
  _byOriginSnapshot() {
    const out = Object.create(null);
    for (const [origin, ids] of this._byOrigin) {
      out[origin] = [...ids];
    }
    return out;
  }

  /** Inserts a normalized notification into the live map. */
  _add(notification) {
    const { id, origin } = notification;
    this._notifications[id] = notification;
    let ids = this._byOrigin.get(origin);
    if (!ids) {
      ids = new Set();
      this._byOrigin.set(origin, ids);
    }
    ids.add(id);
  }

  /**
   * Removes an id from the live map.
   *
   * @returns {boolean} True if it was present (so callers avoid empty deltas).
   */
  _remove(origin, id) {
    if (!(id in this._notifications)) {
      return false;
    }
    delete this._notifications[id];
    const ids = this._byOrigin.get(origin);
    if (ids) {
      ids.delete(id);
      if (!ids.size) {
        this._byOrigin.delete(origin);
      }
    }
    return true;
  }

  async _seedFromDisk() {
    let raw;
    try {
      raw = await readNotificationStore();
    } catch (e) {
      this._broadcast({
        type: at.WEB_NOTIFICATIONS_ERROR,
        data: { message: String(e) },
      });
      return;
    }
    for (const origin of Object.keys(raw)) {
      for (const id of Object.keys(raw[origin])) {
        this._add(normalizeDiskEntry(raw[origin][id], origin));
      }
    }
    this._broadcast({
      type: at.WEB_NOTIFICATIONS_UPDATED,
      data: {
        lastUpdated: Date.now(),
        notifications: { ...this._notifications },
        byOrigin: this._byOriginSnapshot(),
      },
    });
  }

  /**
   * Answers a single tab with the current snapshot, without a disk re-read.
   * Used for an explicit content-side refresh (e.g. on becoming visible).
   */
  _answer(target) {
    this.store.dispatch(
      ac.AlsoToOneContent(
        {
          type: at.WEB_NOTIFICATIONS_UPDATED,
          data: {
            lastUpdated: Date.now(),
            notifications: { ...this._notifications },
            byOrigin: this._byOriginSnapshot(),
          },
        },
        target
      )
    );
  }

  // nsIObserver. The platform already excludes private-browsing notifications,
  // so anything arriving here is safe to surface.
  observe(subject, topic) {
    const alert = subject?.QueryInterface(Ci.nsIAlertNotification);
    if (!alert) {
      return;
    }
    const origin = alert.principal?.origin;
    if (!origin) {
      return;
    }
    if (topic === TOPIC_SHOWN) {
      this._add(this._normalizeAlert(alert, origin));
      this._broadcast({
        type: at.WEB_NOTIFICATIONS_ADDED,
        data: { notification: this._notifications[alert.id] },
      });
    } else if (topic === TOPIC_CLOSED) {
      const existing = this._notifications[alert.id];
      if (
        existing &&
        this._shouldReleaseOnClose(existing) &&
        this._remove(origin, alert.id)
      ) {
        this._broadcast({
          type: at.WEB_NOTIFICATIONS_REMOVED,
          data: { removed: [{ origin, id: alert.id }] },
        });
      }
    }
  }

  /**
   * Whether a close event should drop a notification from the feed. The feed
   * mirrors what the system still holds, so a close releases: it is the system
   * reporting the notification is spent, which is the only judgement available
   * and a better one than we could make. A close carries no reason we can trust
   * (on macOS a page calling `close()`, a user swipe, and a toast timeout are
   * indistinguishable, and a timeout may fire no close at all), and it needs
   * none — what the site wanted is already reflected in whether a close arrives
   * at all. `requireInteraction` in particular is honoured by the system, which
   * holds the toast up until it is addressed; reading it here too would keep a
   * notification the system has since dismissed.
   *
   * Bell origins are the one exception: they close their own notification within
   * moments of showing it, so mirroring would drop them before they were ever
   * seen. See `STICKY_ORIGINS`.
   *
   * @param {NormalizedNotification} notification
   * @returns {boolean}
   */
  _shouldReleaseOnClose(notification) {
    return !STICKY_ORIGINS.has(notification.origin);
  }

  /**
   * @param {nsIAlertNotification} alert
   * @param {string} origin
   * @returns {NormalizedNotification}
   */
  _normalizeAlert(alert, origin) {
    return {
      id: alert.id,
      origin,
      title: alert.title,
      body: alert.text,
      dir: alert.dir,
      icon: alert.imageURL,
      requireInteraction: alert.requireInteraction,
      timestamp: Date.now(),
    };
  }

  _principalFor(origin) {
    try {
      return Services.scriptSecurityManager.createContentPrincipalFromOrigin(
        origin
      );
    } catch (e) {
      return null;
    }
  }

  /**
   * Replays a notification click: fires the origin's service worker
   * `notificationclick` (same path a real OS click takes) and, via
   * `autoClosed`, purges the stored entry. The removal is reflected by the
   * authoritative map below.
   */
  _click({ origin, id }) {
    const principal = this._principalFor(origin);
    if (principal) {
      try {
        Cc[NOTIFICATION_HANDLER].getService(Ci.nsINotificationHandler)
          .respondOnClick(principal, id, "", /* autoClosed */ true)
          .catch(() => {});
      } catch (e) {}
    }
    if (this._remove(origin, id)) {
      this._broadcast({
        type: at.WEB_NOTIFICATIONS_REMOVED,
        data: { removed: [{ origin, id }] },
      });
    }
  }

  /**
   * Dismisses one notification. Prefers the real close path (closing a still-
   * showing alert fires the page's `notificationclose` and unpersists it); for
   * a Service-Worker notification persisted from a previous session there is no
   * live alert, so it falls back to a storage delete. Either way the entry
   * leaves the authoritative map.
   */
  _dismiss({ origin, id }) {
    const notification = this._notifications[id];
    if (!notification) {
      return;
    }
    try {
      Cc[ALERTS_SERVICE].getService(Ci.nsIAlertsService).closeAlert(
        id,
        /* aContextClosed */ false
      );
    } catch (e) {}
    try {
      Cc[NOTIFICATION_STORAGE].getService(Ci.nsINotificationStorage).delete(
        origin,
        id
      );
    } catch (e) {}
    if (this._remove(origin, id)) {
      this._broadcast({
        type: at.WEB_NOTIFICATIONS_REMOVED,
        data: { removed: [{ origin, id }] },
      });
    }
  }

  /** Dismisses every notification, or every one for a single origin. */
  _dismissAll({ origin } = {}) {
    const targets = [];
    for (const id of Object.keys(this._notifications)) {
      const entry = this._notifications[id];
      if (!origin || entry.origin === origin) {
        targets.push({ origin: entry.origin, id });
      }
    }
    for (const target of targets) {
      this._dismiss(target);
    }
  }

  /**
   * The feature exists (gate) and the user wants it (preference). The gate is
   * satisfied by either the system pref or a trainhop enrollment, so the
   * feature can roll out ahead of the release train without the system pref.
   */
  get _enabled() {
    const prefs = this.store.getState().Prefs.values;
    const systemValue =
      prefs[PREF_SYSTEM] || prefs.trainhopConfig?.webNotifications?.enabled;
    return Boolean(systemValue && prefs[PREF_USER]);
  }

  _startObserving() {
    if (this._observing) {
      return;
    }
    Services.obs.addObserver(this, TOPIC_SHOWN);
    Services.obs.addObserver(this, TOPIC_CLOSED);
    this._observing = true;
  }

  _stopObserving() {
    if (!this._observing) {
      return;
    }
    Services.obs.removeObserver(this, TOPIC_SHOWN);
    Services.obs.removeObserver(this, TOPIC_CLOSED);
    this._observing = false;
  }

  /** Drops everything captured so far and tells content the slice is empty. */
  _clear() {
    this._notifications = Object.create(null);
    this._byOrigin.clear();
    this._broadcast({
      type: at.WEB_NOTIFICATIONS_UPDATED,
      data: {
        lastUpdated: Date.now(),
        notifications: {},
        byOrigin: {},
      },
    });
  }

  /**
   * Brings observation in line with the prefs. The feed is a system feed, so it
   * is constructed for every profile and sits idle until both prefs are set;
   * turning the feature off mid-session drops the captured state rather than
   * leaving content rendering a frozen snapshot.
   */
  _updateEnabled() {
    if (this._enabled) {
      if (!this._observing) {
        this._startObserving();
        this._seedFromDisk();
      }
    } else if (this._observing) {
      this._stopObserving();
      this._clear();
    }
  }

  onAction(action) {
    switch (action.type) {
      case at.INIT:
        this._updateEnabled();
        break;
      case at.UNINIT:
        this._stopObserving();
        break;
      case at.PREF_CHANGED:
        if (
          action.data.name === PREF_SYSTEM ||
          action.data.name === PREF_USER ||
          action.data.name === "trainhopConfig"
        ) {
          this._updateEnabled();
        }
        break;
      case at.WEB_NOTIFICATIONS_REQUEST:
        this._answer(action.meta?.fromTarget);
        break;
      case at.WEB_NOTIFICATIONS_CLICK:
        this._click(action.data);
        break;
      case at.WEB_NOTIFICATIONS_DISMISS:
        this._dismiss(action.data);
        break;
      case at.WEB_NOTIFICATIONS_DISMISS_ALL:
        this._dismissAll(action.data);
        break;
    }
  }
}
