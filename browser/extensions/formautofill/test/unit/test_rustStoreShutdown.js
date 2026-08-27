/*
 * Unit tests for RustAutofillStore's shutdown handling: finalize() and the
 * profile-teardown blocker registered by _registerShutdownBlocker().
 *
 * These exercise the logic in isolation with a fake store and a fake
 * AsyncShutdown phase, so no real SQLite store is opened.
 */

"use strict";

const { RustAutofillStore } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillStore.sys.mjs"
);

/**
 * Constructing normally hands back the shared instance, so drop it first to
 * get a handler with fresh state.
 *
 * @returns {RustAutofillStore}
 */
function makeHandler() {
  RustAutofillStore._instance = null;
  return new RustAutofillStore();
}

function makeFakeStore() {
  return {
    shutdownCount: 0,
    async shutdown() {
      this.shutdownCount++;
    },
  };
}

function makeFakePhase({ isClosed = false } = {}) {
  return {
    isClosed,
    blockers: [],
    addBlocker(name, callback) {
      this.blockers.push({ name, callback });
    },
  };
}

add_task(async function finalize_without_open_store_is_noop() {
  const handler = makeHandler();
  // The store was never opened, so this must resolve without doing anything.
  await handler.finalize();
  Assert.ok(true, "resolves when the store was never opened");
});

add_task(async function finalize_closes_open_store() {
  const handler = makeHandler();
  const store = makeFakeStore();
  handler._storePromise = Promise.resolve(store);

  await handler.finalize();
  Assert.equal(store.shutdownCount, 1, "shutdown() called once");
});

add_task(async function finalize_tolerates_failed_store_open() {
  const handler = makeHandler();
  handler._storePromise = Promise.reject(new Error("open failed"));

  // The store never opened, so there is nothing to close and finalize must not
  // reject -- otherwise the shutdown blocker would fail at teardown.
  await handler.finalize();
  Assert.ok(true, "resolves when the store failed to open");
});

add_task(async function constructing_returns_the_shared_instance() {
  const handler = makeHandler();
  Assert.equal(new RustAutofillStore(), handler, "the singleton is reused");
});

add_task(async function ensure_open_reuses_an_open_store() {
  const handler = makeHandler();
  const store = makeFakeStore();
  handler._storePromise = Promise.resolve(store);

  // Already open, so this must hand back the same store rather than opening a
  // second connection to the same file.
  Assert.equal(await handler.ensureOpen(), store, "the same store is used");
});

add_task(async function blocker_registers_while_phase_open() {
  const handler = makeHandler();
  const store = makeFakeStore();
  handler._storePromise = Promise.resolve(store);
  const phase = makeFakePhase();

  await handler._registerShutdownBlocker(phase);
  Assert.equal(phase.blockers.length, 1, "a blocker was registered");
  Assert.equal(typeof phase.blockers[0].name, "string", "blocker has a name");
  Assert.equal(
    store.shutdownCount,
    0,
    "store not closed until the blocker runs"
  );

  // Running the blocker closes the store.
  await phase.blockers[0].callback();
  Assert.equal(store.shutdownCount, 1, "running the blocker closes the store");
});

add_task(async function store_closes_immediately_when_phase_closed() {
  const handler = makeHandler();
  const store = makeFakeStore();
  handler._storePromise = Promise.resolve(store);
  const phase = makeFakePhase({ isClosed: true });
  phase.addBlocker = () => {
    Assert.ok(false, "addBlocker must not run once the phase is closed");
  };

  await handler._registerShutdownBlocker(phase);
  Assert.equal(store.shutdownCount, 1, "store closed immediately");
});
