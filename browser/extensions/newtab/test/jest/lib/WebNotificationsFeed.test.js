/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionTypes as at } from "common/Actions.mjs";
import { mockServices, stubGlobals } from "test/jest/test-utils";
import { WebNotificationsFeed } from "lib/WebNotificationsFeed.sys.mjs";

describe("WebNotificationsFeed", () => {
  let feed;
  let restoreGlobals;
  let readUTF8Stub;
  let pathJoinSpy;
  let respondOnClickStub;
  let deleteStub;
  let closeAlertStub;
  let fakeServices;
  let addObserverStub;
  let removeObserverStub;
  let prefs;

  function buildStoreText(entries) {
    const store = {};
    for (const e of entries) {
      if (!store[e.origin]) {
        store[e.origin] = {};
      }
      store[e.origin][e.id] = {
        id: e.id,
        title: e.title ?? "t",
        body: e.body ?? "b",
        tag: e.tag ?? "",
        serviceWorkerRegistrationScope: e.scope ?? "https://example.com/sw",
      };
    }
    return JSON.stringify(store);
  }

  // Minimal nsIAlertNotification stand-in: QueryInterface returns itself.
  // `name` mirrors `id` as the platform does for content principals.
  function makeAlert(overrides = {}) {
    const alert = {
      id: "id-1",
      name: "id-1",
      title: "hello",
      text: "world",
      dir: "auto",
      imageURL: "https://example.com/icon.png",
      requireInteraction: false,
      principal: { origin: "https://example.com" },
      QueryInterface: () => alert,
      ...overrides,
    };
    return alert;
  }

  function makeNotFoundError() {
    const err = new Error("file not found");
    err.name = "NotFoundError";
    return err;
  }

  function lastAction() {
    return feed.store.dispatch.mock.lastCall[0];
  }

  beforeEach(() => {
    readUTF8Stub = jest.fn().mockResolvedValue("");
    pathJoinSpy = jest.fn((...parts) => parts.join("/"));
    respondOnClickStub = jest.fn().mockResolvedValue(undefined);
    deleteStub = jest.fn();
    closeAlertStub = jest.fn();
    fakeServices = mockServices(["obs", "scriptSecurityManager"]);
    addObserverStub = fakeServices.obs.addObserver;
    removeObserverStub = fakeServices.obs.removeObserver;
    prefs = { "system.showWebNotifications": true, showWebNotifications: true };
    restoreGlobals = stubGlobals({
      IOUtils: { readUTF8: readUTF8Stub },
      PathUtils: { profileDir: "/tmp/test-profile", join: pathJoinSpy },
      DOMException: {
        isInstance(e) {
          return !!e && typeof e === "object" && "name" in e;
        },
      },
      Ci: {
        nsIAlertNotification: "nsIAlertNotification",
        nsIAlertsService: "nsIAlertsService",
        nsINotificationHandler: "nsINotificationHandler",
        nsINotificationStorage: "nsINotificationStorage",
      },
      Cc: {
        "@mozilla.org/alerts-service;1": {
          getService: () => ({ closeAlert: closeAlertStub }),
        },
        "@mozilla.org/notification-handler;1": {
          getService: () => ({ respondOnClick: respondOnClickStub }),
        },
        "@mozilla.org/notificationStorage;1": {
          getService: () => ({ delete: deleteStub }),
        },
      },
      Services: fakeServices,
    });
    feed = new WebNotificationsFeed();
    feed.store = {
      dispatch: jest.fn(),
      getState: () => ({ Prefs: { values: prefs } }),
    };
  });

  afterEach(() => {
    restoreGlobals();
  });

  it("registers capture observers on INIT when both prefs are set", async () => {
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    expect(addObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-shown"
    );
    expect(addObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-closed"
    );
  });

  it("does not observe on INIT when the feature gate is off", () => {
    prefs["system.showWebNotifications"] = false;
    feed.onAction({ type: at.INIT });

    expect(addObserverStub).not.toHaveBeenCalled();
  });

  it("does not observe on INIT when the user pref is off", () => {
    prefs.showWebNotifications = false;
    feed.onAction({ type: at.INIT });

    expect(addObserverStub).not.toHaveBeenCalled();
  });

  it("observes on INIT when trainhop enables the feature with the system pref off", async () => {
    prefs["system.showWebNotifications"] = false;
    prefs.trainhopConfig = { webNotifications: { enabled: true } };
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    expect(addObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-shown"
    );
    expect(addObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-closed"
    );
  });

  it("does not observe when trainhop enables the feature but the user pref is off", () => {
    prefs["system.showWebNotifications"] = false;
    prefs.showWebNotifications = false;
    prefs.trainhopConfig = { webNotifications: { enabled: true } };
    feed.onAction({ type: at.INIT });

    expect(addObserverStub).not.toHaveBeenCalled();
  });

  it("starts observing when trainhop enrollment arrives mid-session", () => {
    prefs["system.showWebNotifications"] = false;
    feed.onAction({ type: at.INIT });
    expect(addObserverStub).not.toHaveBeenCalled();

    prefs.trainhopConfig = { webNotifications: { enabled: true } };
    feed.onAction({
      type: at.PREF_CHANGED,
      data: { name: "trainhopConfig", value: prefs.trainhopConfig },
    });

    expect(addObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-shown"
    );
  });

  it("starts observing when the user pref is turned on mid-session", () => {
    prefs.showWebNotifications = false;
    feed.onAction({ type: at.INIT });
    expect(addObserverStub).not.toHaveBeenCalled();

    prefs.showWebNotifications = true;
    feed.onAction({
      type: at.PREF_CHANGED,
      data: { name: "showWebNotifications", value: true },
    });

    expect(addObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-shown"
    );
  });

  it("stops observing and clears the slice when the feature is turned off", () => {
    feed.onAction({ type: at.INIT });
    feed.store.dispatch.mockClear();

    prefs.showWebNotifications = false;
    feed.onAction({
      type: at.PREF_CHANGED,
      data: { name: "showWebNotifications", value: false },
    });

    expect(removeObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-shown"
    );
    expect(removeObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-closed"
    );
    const [action] = feed.store.dispatch.mock.lastCall;
    expect(action.type).toEqual(at.WEB_NOTIFICATIONS_UPDATED);
    expect(action.data.notifications).toEqual({});
    expect(action.data.byOrigin).toEqual({});
  });

  it("ignores PREF_CHANGED for unrelated prefs", () => {
    feed.onAction({ type: at.INIT });
    addObserverStub.mockClear();

    feed.onAction({
      type: at.PREF_CHANGED,
      data: { name: "showWeather", value: false },
    });

    expect(removeObserverStub).not.toHaveBeenCalled();
    expect(addObserverStub).not.toHaveBeenCalled();
  });

  it("seeds from disk and broadcasts a snapshot on INIT", async () => {
    readUTF8Stub.mockResolvedValue(
      buildStoreText([
        { origin: "https://example.com", id: "abc", tag: "inbox" },
        { origin: "https://other.org", id: "ghi" },
      ])
    );

    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    expect(pathJoinSpy).toHaveBeenCalledWith(
      "/tmp/test-profile",
      "notificationstore.json"
    );
    const action = lastAction();
    expect(action.type).toEqual(at.WEB_NOTIFICATIONS_UPDATED);
    expect(Object.keys(action.data.notifications).sort()).toEqual([
      "abc",
      "ghi",
    ]);
    expect(action.data.byOrigin["https://example.com"]).toEqual(["abc"]);
  });

  it("broadcasts an ADDED delta when a notification is shown", () => {
    feed.observe(makeAlert(), "web-notification-shown");

    const action = lastAction();
    expect(action.type).toEqual(at.WEB_NOTIFICATIONS_ADDED);
    expect(action.data.notification.id).toEqual("id-1");
    expect(action.data.notification.origin).toEqual("https://example.com");
    expect(action.data.notification.body).toEqual("world");
  });

  it("broadcasts a REMOVED delta when a notification closes", () => {
    feed.observe(makeAlert(), "web-notification-shown");
    feed.observe(makeAlert(), "web-notification-closed");

    const action = lastAction();
    expect(action.type).toEqual(at.WEB_NOTIFICATIONS_REMOVED);
    expect(action.data.removed).toEqual([
      { origin: "https://example.com", id: "id-1" },
    ]);
  });

  it("does not broadcast a REMOVED for an unknown close", () => {
    feed.observe(makeAlert(), "web-notification-closed");
    expect(feed.store.dispatch).not.toHaveBeenCalled();
  });

  it("keeps a notification from a bell origin on close", () => {
    const alert = makeAlert({
      principal: { origin: "https://mail.google.com" },
    });
    feed.observe(alert, "web-notification-shown");
    feed.store.dispatch.mockClear();

    feed.observe(alert, "web-notification-closed");

    expect(feed.store.dispatch).not.toHaveBeenCalled();
    expect(feed._notifications).toHaveProperty("id-1");
  });

  it("releases a notification from a non-bell origin on close", () => {
    const alert = makeAlert({
      principal: { origin: "https://calendar.google.com" },
    });
    feed.observe(alert, "web-notification-shown");
    feed.store.dispatch.mockClear();

    feed.observe(alert, "web-notification-closed");

    expect(lastAction().type).toEqual(at.WEB_NOTIFICATIONS_REMOVED);
    expect(feed._notifications).not.toHaveProperty("id-1");
  });

  it("releases a requireInteraction notification on close", () => {
    const alert = makeAlert({ requireInteraction: true });
    feed.observe(alert, "web-notification-shown");
    feed.store.dispatch.mockClear();

    feed.observe(alert, "web-notification-closed");

    expect(lastAction().type).toEqual(at.WEB_NOTIFICATIONS_REMOVED);
    expect(feed._notifications).not.toHaveProperty("id-1");
  });

  it("closes a still-showing notification and removes it on dismiss", () => {
    feed.observe(makeAlert(), "web-notification-shown");
    feed.store.dispatch.mockClear();

    feed.onAction({
      type: at.WEB_NOTIFICATIONS_DISMISS,
      data: { origin: "https://example.com", id: "id-1" },
    });

    expect(closeAlertStub).toHaveBeenCalledWith("id-1", false);
    expect(deleteStub).toHaveBeenCalledWith("https://example.com", "id-1");
    expect(lastAction().type).toEqual(at.WEB_NOTIFICATIONS_REMOVED);
  });

  it("replays a click through respondOnClick and removes the entry", () => {
    feed.observe(makeAlert(), "web-notification-shown");
    feed.store.dispatch.mockClear();

    feed.onAction({
      type: at.WEB_NOTIFICATIONS_CLICK,
      data: { origin: "https://example.com", id: "id-1" },
    });

    expect(respondOnClickStub).toHaveBeenCalledWith(
      { origin: "https://example.com" },
      "id-1",
      "",
      true
    );
    expect(lastAction().type).toEqual(at.WEB_NOTIFICATIONS_REMOVED);
  });

  it("removes observers on UNINIT", () => {
    feed.onAction({ type: at.INIT });
    feed.onAction({ type: at.UNINIT });

    expect(removeObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-shown"
    );
    expect(removeObserverStub).toHaveBeenCalledWith(
      feed,
      "web-notification-closed"
    );
  });

  it("reports a read error without throwing", async () => {
    readUTF8Stub.mockRejectedValue(new Error("boom"));
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    const errorAction = feed.store.dispatch.mock.calls
      .map(c => c[0])
      .find(a => a.type === at.WEB_NOTIFICATIONS_ERROR);
    expect(errorAction).toBeTruthy();
    expect(errorAction.data.message).toMatch(/boom/);
  });

  it("treats a missing store file as empty", async () => {
    readUTF8Stub.mockRejectedValue(makeNotFoundError());
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    const action = lastAction();
    expect(action.type).toEqual(at.WEB_NOTIFICATIONS_UPDATED);
    expect(action.data.notifications).toEqual({});
  });
});
