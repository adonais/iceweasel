import { actionTypes as at } from "common/Actions.mjs";
import { GlobalOverrider } from "test/unit/utils";
import { WebNotificationsFeed } from "lib/WebNotificationsFeed.sys.mjs";

describe("WebNotificationsFeed", () => {
  let feed;
  let overrider;
  let sandbox;
  let readUTF8Stub;
  let pathJoinSpy;
  let respondOnClickStub;
  let deleteStub;
  let closeAlertStub;
  let createPrincipalStub;
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
    return feed.store.dispatch.lastCall.args[0];
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    overrider = new GlobalOverrider();
    readUTF8Stub = sandbox.stub().resolves("");
    pathJoinSpy = sandbox.spy((...parts) => parts.join("/"));
    respondOnClickStub = sandbox.stub().resolves();
    deleteStub = sandbox.stub();
    closeAlertStub = sandbox.stub();
    createPrincipalStub = sandbox.spy(origin => ({ origin }));
    addObserverStub = sandbox.stub();
    removeObserverStub = sandbox.stub();
    prefs = { "system.showWebNotifications": true, showWebNotifications: true };
    overrider.set({
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
      Services: {
        obs: {
          addObserver: addObserverStub,
          removeObserver: removeObserverStub,
        },
        scriptSecurityManager: {
          createContentPrincipalFromOrigin: createPrincipalStub,
        },
      },
    });
    feed = new WebNotificationsFeed();
    feed.store = {
      dispatch: sandbox.spy(),
      getState: () => ({ Prefs: { values: prefs } }),
    };
  });

  afterEach(() => {
    overrider.restore();
    sandbox.restore();
  });

  it("registers capture observers on INIT when both prefs are set", async () => {
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    assert.calledWith(addObserverStub, feed, "web-notification-shown");
    assert.calledWith(addObserverStub, feed, "web-notification-closed");
  });

  it("does not observe on INIT when the feature gate is off", () => {
    prefs["system.showWebNotifications"] = false;
    feed.onAction({ type: at.INIT });

    assert.notCalled(addObserverStub);
  });

  it("does not observe on INIT when the user pref is off", () => {
    prefs.showWebNotifications = false;
    feed.onAction({ type: at.INIT });

    assert.notCalled(addObserverStub);
  });

  it("observes on INIT when trainhop enables the feature with the system pref off", () => {
    prefs["system.showWebNotifications"] = false;
    prefs.trainhopConfig = { webNotifications: { enabled: true } };
    feed.onAction({ type: at.INIT });

    assert.calledWith(addObserverStub, feed, "web-notification-shown");
    assert.calledWith(addObserverStub, feed, "web-notification-closed");
  });

  it("does not observe when trainhop enables the feature but the user pref is off", () => {
    prefs["system.showWebNotifications"] = false;
    prefs.showWebNotifications = false;
    prefs.trainhopConfig = { webNotifications: { enabled: true } };
    feed.onAction({ type: at.INIT });

    assert.notCalled(addObserverStub);
  });

  it("starts observing when trainhop enrollment arrives mid-session", () => {
    prefs["system.showWebNotifications"] = false;
    feed.onAction({ type: at.INIT });
    assert.notCalled(addObserverStub);

    prefs.trainhopConfig = { webNotifications: { enabled: true } };
    feed.onAction({
      type: at.PREF_CHANGED,
      data: { name: "trainhopConfig", value: prefs.trainhopConfig },
    });

    assert.calledWith(addObserverStub, feed, "web-notification-shown");
  });

  it("starts observing when the user pref is turned on mid-session", () => {
    prefs.showWebNotifications = false;
    feed.onAction({ type: at.INIT });
    assert.notCalled(addObserverStub);

    prefs.showWebNotifications = true;
    feed.onAction({
      type: at.PREF_CHANGED,
      data: { name: "showWebNotifications", value: true },
    });

    assert.calledWith(addObserverStub, feed, "web-notification-shown");
  });

  it("stops observing and clears the slice when the feature is turned off", () => {
    feed.onAction({ type: at.INIT });
    feed.store.dispatch.resetHistory();

    prefs.showWebNotifications = false;
    feed.onAction({
      type: at.PREF_CHANGED,
      data: { name: "showWebNotifications", value: false },
    });

    assert.calledWith(removeObserverStub, feed, "web-notification-shown");
    assert.calledWith(removeObserverStub, feed, "web-notification-closed");
    const [action] = feed.store.dispatch.lastCall.args;
    assert.equal(action.type, at.WEB_NOTIFICATIONS_UPDATED);
    assert.deepEqual(action.data.notifications, {});
    assert.deepEqual(action.data.byOrigin, {});
  });

  it("ignores PREF_CHANGED for unrelated prefs", () => {
    feed.onAction({ type: at.INIT });
    addObserverStub.resetHistory();

    feed.onAction({
      type: at.PREF_CHANGED,
      data: { name: "showWeather", value: false },
    });

    assert.notCalled(removeObserverStub);
    assert.notCalled(addObserverStub);
  });

  it("seeds from disk and broadcasts a snapshot on INIT", async () => {
    readUTF8Stub.resolves(
      buildStoreText([
        { origin: "https://example.com", id: "abc", tag: "inbox" },
        { origin: "https://other.org", id: "ghi" },
      ])
    );

    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    assert.calledWith(
      pathJoinSpy,
      "/tmp/test-profile",
      "notificationstore.json"
    );
    const action = lastAction();
    assert.equal(action.type, at.WEB_NOTIFICATIONS_UPDATED);
    assert.sameMembers(Object.keys(action.data.notifications), ["abc", "ghi"]);
    assert.deepEqual(action.data.byOrigin["https://example.com"], ["abc"]);
  });

  it("broadcasts an ADDED delta when a notification is shown", () => {
    feed.observe(makeAlert(), "web-notification-shown");

    const action = lastAction();
    assert.equal(action.type, at.WEB_NOTIFICATIONS_ADDED);
    assert.equal(action.data.notification.id, "id-1");
    assert.equal(action.data.notification.origin, "https://example.com");
    assert.equal(action.data.notification.body, "world");
  });

  it("broadcasts a REMOVED delta when a notification closes", () => {
    feed.observe(makeAlert(), "web-notification-shown");
    feed.observe(makeAlert(), "web-notification-closed");

    const action = lastAction();
    assert.equal(action.type, at.WEB_NOTIFICATIONS_REMOVED);
    assert.deepEqual(action.data.removed, [
      { origin: "https://example.com", id: "id-1" },
    ]);
  });

  it("does not broadcast a REMOVED for an unknown close", () => {
    feed.observe(makeAlert(), "web-notification-closed");
    assert.notCalled(feed.store.dispatch);
  });

  it("keeps a notification from a bell origin on close", () => {
    const alert = makeAlert({
      principal: { origin: "https://mail.google.com" },
    });
    feed.observe(alert, "web-notification-shown");
    feed.store.dispatch.resetHistory();

    feed.observe(alert, "web-notification-closed");

    assert.notCalled(feed.store.dispatch);
    assert.property(feed._notifications, "id-1");
  });

  it("releases a notification from a non-bell origin on close", () => {
    const alert = makeAlert({
      principal: { origin: "https://calendar.google.com" },
    });
    feed.observe(alert, "web-notification-shown");
    feed.store.dispatch.resetHistory();

    feed.observe(alert, "web-notification-closed");

    assert.equal(lastAction().type, at.WEB_NOTIFICATIONS_REMOVED);
    assert.notProperty(feed._notifications, "id-1");
  });

  it("releases a requireInteraction notification on close", () => {
    const alert = makeAlert({ requireInteraction: true });
    feed.observe(alert, "web-notification-shown");
    feed.store.dispatch.resetHistory();

    feed.observe(alert, "web-notification-closed");

    assert.equal(lastAction().type, at.WEB_NOTIFICATIONS_REMOVED);
    assert.notProperty(feed._notifications, "id-1");
  });

  it("closes a still-showing notification and removes it on dismiss", () => {
    feed.observe(makeAlert(), "web-notification-shown");
    feed.store.dispatch.resetHistory();

    feed.onAction({
      type: at.WEB_NOTIFICATIONS_DISMISS,
      data: { origin: "https://example.com", id: "id-1" },
    });

    assert.calledWith(closeAlertStub, "id-1", false);
    assert.calledWith(deleteStub, "https://example.com", "id-1");
    assert.equal(lastAction().type, at.WEB_NOTIFICATIONS_REMOVED);
  });

  it("replays a click through respondOnClick and removes the entry", () => {
    feed.observe(makeAlert(), "web-notification-shown");
    feed.store.dispatch.resetHistory();

    feed.onAction({
      type: at.WEB_NOTIFICATIONS_CLICK,
      data: { origin: "https://example.com", id: "id-1" },
    });

    assert.calledWith(
      respondOnClickStub,
      { origin: "https://example.com" },
      "id-1",
      "",
      true
    );
    assert.equal(lastAction().type, at.WEB_NOTIFICATIONS_REMOVED);
  });

  it("removes observers on UNINIT", () => {
    feed.onAction({ type: at.INIT });
    feed.onAction({ type: at.UNINIT });

    assert.calledWith(removeObserverStub, feed, "web-notification-shown");
    assert.calledWith(removeObserverStub, feed, "web-notification-closed");
  });

  it("reports a read error without throwing", async () => {
    readUTF8Stub.rejects(new Error("boom"));
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    const errorAction = feed.store.dispatch
      .getCalls()
      .map(c => c.args[0])
      .find(a => a.type === at.WEB_NOTIFICATIONS_ERROR);
    assert.ok(errorAction);
    assert.match(errorAction.data.message, /boom/);
  });

  it("treats a missing store file as empty", async () => {
    readUTF8Stub.rejects(makeNotFoundError());
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    const action = lastAction();
    assert.equal(action.type, at.WEB_NOTIFICATIONS_UPDATED);
    assert.deepEqual(action.data.notifications, {});
  });
});
