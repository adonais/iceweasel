/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPProtectionPanel } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs"
);
const { IPPEnrollAndEntitleManager } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPEnrollAndEntitleManager.sys.mjs"
);

/**
 * A class that mocks the IP Protection panel.
 */
class FakeIPProtectionPanelElement {
  constructor() {
    this.state = {
      isSignedOut: true,
      isProtectionEnabled: false,
      protectionEnabledSince: null,
    };
    this.isConnected = false;
  }

  requestUpdate() {
    /* NOOP */
  }

  closest() {
    return {
      state: "open",
    };
  }
}

add_setup(async function () {
  // FxAccountsStorage.sys.mjs requires a profile directory.
  do_get_profile();
  await putServerInRemoteSettings();

  await IPProtectionService.init();

  registerCleanupFunction(async () => {
    IPProtectionService.uninit();
  });
});

/**
 * Tests that we can set a state and pass it to a fake element.
 */
add_task(async function test_setState() {
  let ipProtectionPanel = new IPProtectionPanel();
  let fakeElement = new FakeIPProtectionPanelElement();
  ipProtectionPanel.panel = fakeElement;

  ipProtectionPanel.state = {};
  fakeElement.state = {};

  ipProtectionPanel.setState({
    foo: "bar",
  });

  Assert.deepEqual(
    ipProtectionPanel.state,
    { foo: "bar" },
    "The state should be set on the IPProtectionPanel instance"
  );

  Assert.deepEqual(
    fakeElement.state,
    {},
    "The state should not be set on the fake element, as it is not connected"
  );

  fakeElement.isConnected = true;

  ipProtectionPanel.setState({
    isFoo: true,
  });

  Assert.deepEqual(
    ipProtectionPanel.state,
    { foo: "bar", isFoo: true },
    "The state should be set on the IPProtectionPanel instance"
  );

  Assert.deepEqual(
    fakeElement.state,
    { foo: "bar", isFoo: true },
    "The state should be set on the fake element"
  );
});

/**
 * Tests that the whole state will be updated when calling updateState directly.
 */
add_task(async function test_updateState() {
  let ipProtectionPanel = new IPProtectionPanel();
  let fakeElement = new FakeIPProtectionPanelElement();
  ipProtectionPanel.panel = fakeElement;

  ipProtectionPanel.state = {};
  fakeElement.state = {};

  ipProtectionPanel.setState({
    foo: "bar",
  });

  Assert.deepEqual(
    fakeElement.state,
    {},
    "The state should not be set on the fake element, as it is not connected"
  );

  fakeElement.isConnected = true;
  ipProtectionPanel.updateState();

  Assert.deepEqual(
    fakeElement.state,
    { foo: "bar" },
    "The state should be set on the fake element"
  );
});

/**
 * Tests that IPProtectionService ready state event updates the state.
 */
add_task(async function test_IPProtectionPanel_signedIn() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox
    .stub(IPPEnrollAndEntitleManager, "isEnrolledAndEntitled")
    .get(() => true);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: null,
    entitlement: {
      subscribed: true,
      uid: 42,
      created_at: "2023-01-01T12:00:00.000Z",
    },
  });

  let ipProtectionPanel = new IPProtectionPanel();
  let fakeElement = new FakeIPProtectionPanelElement();
  ipProtectionPanel.panel = fakeElement;
  fakeElement.isConnected = true;

  let signedInEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );
  IPProtectionService.updateState();

  await signedInEventPromise;

  Assert.equal(
    ipProtectionPanel.state.isSignedOut,
    false,
    "isSignedOut should be false in the IPProtectionPanel state"
  );

  Assert.equal(
    fakeElement.state.isSignedOut,
    false,
    "isSignedOut should be false in the fake elements state"
  );

  sandbox.restore();
});

/**
 * Tests that IPProtectionService unavailable state event updates the state.
 */
add_task(async function test_IPProtectionPanel_signedOut() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => false);

  let ipProtectionPanel = new IPProtectionPanel();
  let fakeElement = new FakeIPProtectionPanelElement();
  ipProtectionPanel.panel = fakeElement;
  fakeElement.isConnected = true;

  IPProtectionService.setState(IPProtectionStates.READY);
  let signedOutEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.UNAVAILABLE
  );
  IPProtectionService.updateState();

  await signedOutEventPromise;

  Assert.equal(
    ipProtectionPanel.state.isSignedOut,
    true,
    "isSignedOut should be true in the IPProtectionPanel state"
  );

  Assert.equal(
    fakeElement.state.isSignedOut,
    true,
    "isSignedOut should be true in the fake elements state"
  );

  sandbox.restore();
});

/**
 * Tests that start and stopping the IPProtectionService updates the state.
 */
add_task(async function test_IPProtectionPanel_started_stopped() {
  let ipProtectionPanel = new IPProtectionPanel();
  let fakeElement = new FakeIPProtectionPanelElement();
  ipProtectionPanel.panel = fakeElement;
  fakeElement.isConnected = true;

  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox
    .stub(IPPEnrollAndEntitleManager, "isEnrolledAndEntitled")
    .get(() => true);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: null,
    entitlement: {
      subscribed: true,
      uid: 42,
      created_at: "2023-01-01T12:00:00.000Z",
    },
  });
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 200,
    error: undefined,
    pass: {
      isValid: () => true,
      asBearerToken: () => "Bearer helloworld",
    },
  });

  IPProtectionService.updateState();

  let startedEventPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE
  );

  IPPProxyManager.start();

  await startedEventPromise;

  Assert.equal(
    ipProtectionPanel.state.isProtectionEnabled,
    true,
    "isProtectionEnabled should be true in the IPProtectionPanel state"
  );

  Assert.equal(
    fakeElement.state.isProtectionEnabled,
    true,
    "isProtectionEnabled should be true in the fake elements state"
  );

  let stoppedEventPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state !== IPPProxyStates.ACTIVE
  );

  await IPPProxyManager.stop();

  await stoppedEventPromise;

  Assert.equal(
    ipProtectionPanel.state.isProtectionEnabled,
    false,
    "isProtectionEnabled should be false in the IPProtectionPanel state"
  );

  Assert.equal(
    fakeElement.state.isProtectionEnabled,
    false,
    "isProtectionEnabled should be false in the fake elements state"
  );
  sandbox.restore();
});

/**
 * Tests that IPProtectionPanel state isAlpha property is correct
 * when IPPEnrollAndEntitleManager.isAlpha is true.
 */
add_task(async function test_IPProtectionPanel_isAlpha_true() {
  let sandbox = sinon.createSandbox();

  sandbox
    .stub(IPPEnrollAndEntitleManager, "isEnrolledAndEntitled")
    .get(() => true);
  sandbox.stub(IPPEnrollAndEntitleManager, "isAlpha").get(() => true);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(true);

  let ipProtectionPanel = new IPProtectionPanel();
  let fakeElement = new FakeIPProtectionPanelElement();
  ipProtectionPanel.panel = fakeElement;
  fakeElement.isConnected = true;

  IPProtectionService.updateState();

  Assert.equal(
    ipProtectionPanel.state.isAlpha,
    true,
    "isAlpha should be true in the IPProtectionPanel state"
  );

  sandbox.restore();
});

/**
 * Tests that IPProtectionPanel state isAlpha property is correct
 * when IPPEnrollAndEntitleManager.isAlpha is false.
 */
add_task(async function test_IPProtectionPanel_isAlpha_false() {
  let sandbox = sinon.createSandbox();

  sandbox
    .stub(IPPEnrollAndEntitleManager, "isEnrolledAndEntitled")
    .get(() => true);
  sandbox.stub(IPPEnrollAndEntitleManager, "isAlpha").get(() => false);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(true);

  let ipProtectionPanel = new IPProtectionPanel();
  let fakeElement = new FakeIPProtectionPanelElement();
  ipProtectionPanel.panel = fakeElement;
  fakeElement.isConnected = true;

  IPProtectionService.updateState();

  Assert.equal(
    ipProtectionPanel.state.isAlpha,
    false,
    "isAlpha should be false in the IPProtectionPanel state"
  );

  sandbox.restore();
});
