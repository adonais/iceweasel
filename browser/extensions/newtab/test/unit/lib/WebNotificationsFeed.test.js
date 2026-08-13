import { actionTypes as at } from "common/Actions.mjs";
import { GlobalOverrider } from "test/unit/utils";
import { WebNotificationsFeed } from "lib/WebNotificationsFeed.sys.mjs";

describe("WebNotificationsFeed", () => {
  let feed;
  let overrider;
  let sandbox;
  let readUTF8Stub;
  let pathJoinSpy;

  function buildStoreText(entries) {
    // entries: [{ origin, id, tag?, title? }]
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
      };
    }
    return JSON.stringify(store);
  }

  function makeNotFoundError() {
    const err = new Error("file not found");
    err.name = "NotFoundError";
    return err;
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    overrider = new GlobalOverrider();
    readUTF8Stub = sandbox.stub().resolves("");
    pathJoinSpy = sandbox.spy((...parts) => parts.join("/"));
    overrider.set({
      IOUtils: { readUTF8: readUTF8Stub },
      PathUtils: {
        profileDir: "/tmp/test-profile",
        join: pathJoinSpy,
      },
      // Production code uses chrome's DOMException.isInstance; in the karma
      // env there's only the standard DOM constructor, so we stub the static
      // helper to recognize anything with a `.name` of "NotFoundError".
      DOMException: {
        isInstance(e) {
          return !!e && typeof e === "object" && "name" in e;
        },
      },
    });
    feed = new WebNotificationsFeed();
    feed.store = { dispatch: sandbox.spy() };
  });

  afterEach(() => {
    overrider.restore();
    sandbox.restore();
  });

  it("reads from notificationstore.json in the profile dir", async () => {
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();
    assert.calledOnce(pathJoinSpy);
    assert.calledWith(
      pathJoinSpy,
      "/tmp/test-profile",
      "notificationstore.json"
    );
    assert.calledOnce(readUTF8Stub);
  });

  it("dispatches WEB_NOTIFICATIONS_UPDATED on INIT with a normalized payload", async () => {
    readUTF8Stub.resolves(
      buildStoreText([
        { origin: "https://example.com", id: "abc", tag: "inbox" },
        { origin: "https://example.com", id: "def" },
        { origin: "https://other.org", id: "ghi", tag: "ping" },
      ])
    );

    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    assert.calledOnce(feed.store.dispatch);
    const [action] = feed.store.dispatch.firstCall.args;
    assert.equal(action.type, at.WEB_NOTIFICATIONS_UPDATED);
    assert.isObject(action.meta);
    assert.equal(action.meta.to, "ActivityStream:Content");
    assert.isUndefined(action.meta.toTarget);

    const { data } = action;
    assert.isNumber(data.lastUpdated);
    assert.sameMembers(Object.keys(data.notifications), ["abc", "def", "ghi"]);
    assert.equal(data.notifications.abc.origin, "https://example.com");
    assert.equal(data.notifications.abc.tag, "inbox");
    assert.isUndefined(data.notifications.abc.dataSerialized);
    assert.deepEqual(data.byOrigin["https://example.com"].sort(), [
      "abc",
      "def",
    ]);
    assert.deepEqual(data.byOrigin["https://other.org"], ["ghi"]);
  });

  it("answers NEW_TAB_LOAD with a snapshot targeted at the loading tab", async () => {
    feed.onAction({ type: at.NEW_TAB_LOAD, meta: { fromTarget: "port-123" } });
    await Promise.resolve();
    await Promise.resolve();
    assert.calledOnce(readUTF8Stub);
    assert.calledOnce(feed.store.dispatch);
    const [action] = feed.store.dispatch.firstCall.args;
    assert.equal(action.type, at.WEB_NOTIFICATIONS_UPDATED);
    assert.equal(action.meta.to, "ActivityStream:Content");
    assert.equal(action.meta.toTarget, "port-123");
  });

  it("answers WEB_NOTIFICATIONS_REQUEST with a snapshot targeted at the requesting tab", async () => {
    feed.onAction({
      type: at.WEB_NOTIFICATIONS_REQUEST,
      meta: { fromTarget: "port-abc" },
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.calledOnce(readUTF8Stub);
    assert.calledOnce(feed.store.dispatch);
    const [action] = feed.store.dispatch.firstCall.args;
    assert.equal(action.type, at.WEB_NOTIFICATIONS_UPDATED);
    assert.equal(action.meta.toTarget, "port-abc");
  });

  it("produces an empty snapshot when the file is empty", async () => {
    readUTF8Stub.resolves("");
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    const [action] = feed.store.dispatch.firstCall.args;
    assert.equal(action.type, at.WEB_NOTIFICATIONS_UPDATED);
    assert.deepEqual(action.data.notifications, {});
    assert.deepEqual(action.data.byOrigin, {});
  });

  it("treats a missing file as an empty snapshot (first-run profile)", async () => {
    readUTF8Stub.rejects(makeNotFoundError());
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    assert.calledOnce(feed.store.dispatch);
    const [action] = feed.store.dispatch.firstCall.args;
    assert.equal(action.type, at.WEB_NOTIFICATIONS_UPDATED);
    assert.deepEqual(action.data.notifications, {});
    assert.deepEqual(action.data.byOrigin, {});
  });

  it("dispatches WEB_NOTIFICATIONS_ERROR when the read fails with a non-NotFound error", async () => {
    readUTF8Stub.rejects(new Error("boom"));
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    assert.calledOnce(feed.store.dispatch);
    const [action] = feed.store.dispatch.firstCall.args;
    assert.equal(action.type, at.WEB_NOTIFICATIONS_ERROR);
    assert.include(action.data.message, "boom");
  });

  it("dispatches WEB_NOTIFICATIONS_ERROR when the JSON is malformed", async () => {
    readUTF8Stub.resolves("not valid json {{{");
    feed.onAction({ type: at.INIT });
    await Promise.resolve();
    await Promise.resolve();

    assert.calledOnce(feed.store.dispatch);
    const [action] = feed.store.dispatch.firstCall.args;
    assert.equal(action.type, at.WEB_NOTIFICATIONS_ERROR);
    assert.isString(action.data.message);
  });

  it("ignores unrelated actions", () => {
    feed.onAction({ type: at.UNINIT });
    feed.onAction({ type: at.SYSTEM_TICK });
    assert.notCalled(feed.store.dispatch);
    assert.notCalled(readUTF8Stub);
  });
});
