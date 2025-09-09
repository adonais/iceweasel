/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { IPProtectionPanel } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs"
);

const { IPProtection, IPProtectionWidget } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtection.sys.mjs"
);

const { IPProtectionService } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionService.sys.mjs"
);

const { HttpServer, HTTP_403 } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  sinon: "resource://testing-common/Sinon.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
  ExperimentAPI: "resource://nimbus/ExperimentAPI.sys.mjs",
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

const { ProxyPass } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/GuardianClient.sys.mjs"
);
const { RemoteSettings } = ChromeUtils.importESModule(
  "resource://services-settings/remote-settings.sys.mjs"
);

// Adapted from devtools/client/performance-new/test/browser/helpers.js
function waitForPanelEvent(document, eventName) {
  return BrowserTestUtils.waitForEvent(document, eventName, false, event => {
    if (event.target.getAttribute("viewId") === "PanelUI-ipprotection") {
      return true;
    }
    return false;
  });
}
/* exported waitForPanelEvent */

async function waitForWidgetAdded() {
  let widget = CustomizableUI.getWidget(IPProtectionWidget.WIDGET_ID);
  if (widget) {
    return;
  }
  await new Promise(resolve => {
    let listener = {
      onWidgetAdded: widgetId => {
        if (widgetId == IPProtectionWidget.WIDGET_ID) {
          CustomizableUI.removeListener(listener);
          resolve();
        }
      },
    };
    CustomizableUI.addListener(listener);
  });
}
/* exported waitForWidgetAdded */

const defaultState = new IPProtectionPanel().state;

/**
 * Opens the IP Protection panel with a given state, waits for the content to be ready
 * and returns the content element.
 *
 * @param {object} state - The state to set for the panel.
 * @param {Window} win - The window the panel should be opened in.
 * @returns {Promise<IPProtectionContentElement>} - The <ipprotection-content> element of the panel.
 */
async function openPanel(state, win = window) {
  let panel = IPProtection.getPanel(win);
  if (state) {
    panel.setState(state);
  }

  IPProtection.openPanel(win);

  let panelShownPromise = waitForPanelEvent(win.document, "popupshown");
  let panelInitPromise = BrowserTestUtils.waitForEvent(
    win.document,
    "IPProtection:Init"
  );
  await Promise.all([panelShownPromise, panelInitPromise]);

  let panelView = PanelMultiView.getViewNode(
    win.document,
    IPProtectionWidget.PANEL_ID
  );
  let content = panelView.querySelector(IPProtectionPanel.CONTENT_TAGNAME);

  await content.updateComplete;

  return content;
}
/* exported openPanel */

/**
 * Sets the state of the IP Protection panel and waits for the content to be updated.
 *
 * @param {object} state - The state to set for the panel.
 * @param {Window} win - The window the panel is in.
 * @returns {Promise<void>}
 */
async function setPanelState(state = defaultState, win = window) {
  let panel = IPProtection.getPanel(win);
  panel.setState(state);

  let panelView = PanelMultiView.getViewNode(
    win.document,
    IPProtectionWidget.PANEL_ID
  );
  let content = panelView.querySelector(IPProtectionPanel.CONTENT_TAGNAME);
  if (content) {
    await content.updateComplete;
  }
}

/* exported setPanelState */

/**
 * Closes the IP Protection panel and resets the state to the default.
 *
 * @param {Window} win - The window the panel is in.
 * @returns {Promise<void>}
 */
async function closePanel(win = window) {
  // Reset the state
  let panel = IPProtection.getPanel(win);
  panel.setState(defaultState);
  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(win.document, "popuphidden");
  panel.close();
  await panelHiddenPromise;
}
/* exported closePanel */

/**
 * Creates a fake proxy server for testing.
 * Verifies that the server receives a CONNECT request with the expected headers.
 * Does not proxy anything really.
 * Given it refuses the proxy connection, it will be removed from as proxy-info of the channel.
 *
 * @param {*} testFn
 * @param {Function<Promise<void>>} handler - A custom path handler for "/" requests.
 */
async function withProxyServer(testFn, handler) {
  const server = new HttpServer();
  let { promise, resolve } = Promise.withResolvers();

  server.registerPathHandler("/", (request, response) => {
    console.log("Received request:", request.method, request.path);
    if (handler) {
      handler(request, response);
      resolve();
      return;
    }
    if (request.host !== "example.com") {
      throw HTTP_403;
    }

    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "text/plain");
    response.write("hello world");
    resolve();
  });

  server.registerPathHandler("CONNECT", (request, response) => {
    console.log("Received request:", request.method, request.path);
    if (handler) {
      handler(request, response);
      resolve();
      return;
    }
    let hostHeader = request.getHeader("host");
    Assert.equal(
      hostHeader,
      "example.com:443",
      'Host header should be "example.com:443"'
    );
    Assert.equal(request.method, "CONNECT", "Request method should be CONNECT");

    resolve();
    // Close the connection after verification
    throw HTTP_403;
  });
  // If the Test is Trying to Proxy an http request
  // our server will get a GET request with that host.
  server.identity.add("http", "example.com", "80");
  server.identity.add("http", "example.com", "443");

  server.start(-1);
  await testFn({
    host: `localhost`,
    port: server.identity.primaryPort,
    type: "http",
    gotConnection: promise,
  });
  return server;
}
/* exported withProxyServer */

let DEFAULT_EXPERIMENT = {
  enabled: true,
  variant: "alpha",
  isRollout: false,
};
/* exported SETUP_EXPERIMENT */

let DEFAULT_SERVICE_STATUS = {
  isSignedIn: false,
  isEnrolled: false,
  canEnroll: true,
  entitlement: {
    status: 200,
    error: undefined,
    entitlement: {
      subscribed: false,
      uid: 42,
      created_at: "2023-01-01T12:00:00.000Z",
    },
  },
  proxyPass: {
    status: 200,
    error: undefined,
    pass: makePass(),
  },
};
/* exported DEFAULT_SERVICE_STATUS */

let STUBS = {
  UIState: undefined,
  isLinkedToGuardian: undefined,
  enroll: undefined,
  fetchUserInfo: undefined,
  fetchProxyPass: undefined,
};
/* exported STUBS */

let setupSandbox = sinon.createSandbox();
add_setup(async function setupVPN() {
  setupStubs();

  setupService();

  await putServerInRemoteSettings(DEFAULT_SERVICE_STATUS.serverList);
  IPProtectionService.init();

  if (DEFAULT_EXPERIMENT) {
    await setupExperiment();
  }

  registerCleanupFunction(async () => {
    cleanupService();
    IPProtectionService.uninit();
    setupSandbox.restore();
    cleanupExperiment();
    CustomizableUI.reset();
  });
});

function setupStubs(stubs = STUBS) {
  stubs.UIState = setupSandbox.stub(UIState, "get");
  stubs.isLinkedToGuardian = setupSandbox.stub(
    IPProtectionService.guardian,
    "isLinkedToGuardian"
  );
  stubs.enroll = setupSandbox.stub(IPProtectionService.guardian, "enroll");
  stubs.fetchUserInfo = setupSandbox.stub(
    IPProtectionService.guardian,
    "fetchUserInfo"
  );
  stubs.fetchProxyPass = setupSandbox.stub(
    IPProtectionService.guardian,
    "fetchProxyPass"
  );
}
/* exported setupStubs */

function setupService(
  {
    isSignedIn,
    isEnrolled,
    canEnroll,
    entitlement,
    proxyPass,
  } = DEFAULT_SERVICE_STATUS,
  stubs = STUBS
) {
  if (typeof isSignedIn != "undefined") {
    stubs.UIState.returns({
      status: isSignedIn
        ? UIState.STATUS_SIGNED_IN
        : UIState.STATUS_NOT_CONFIGURED,
    });
  }

  if (typeof isEnrolled != "undefined") {
    stubs.isLinkedToGuardian.returns(isEnrolled);
  }

  if (typeof canEnroll != "undefined") {
    stubs.enroll.returns({
      ok: canEnroll,
    });
  }

  if (typeof entitlement != "undefined") {
    stubs.fetchUserInfo.returns(entitlement);
  }

  if (typeof proxyPass != "undefined") {
    stubs.fetchProxyPass.returns(proxyPass);
  }
}
/* exported setupService */

async function cleanupService() {
  setupService(DEFAULT_SERVICE_STATUS);
}
/* exported cleanupService */

NimbusTestUtils.init(this);
let cleanupExistingExperiment;
async function setupExperiment({
  enabled,
  variant,
  isRollout,
} = DEFAULT_EXPERIMENT) {
  await ExperimentAPI.ready();
  cleanupExistingExperiment = await NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: "ipProtection",
      value: {
        enabled,
        variant,
      },
    },
    {
      slug: "vpn-test",
      branchSlug: variant,
      isRollout,
    }
  );
  return cleanupExistingExperiment;
}
/* exported setupExperiment */

async function cleanupExperiment() {
  if (cleanupExistingExperiment) {
    await cleanupExistingExperiment();
  }
}
/* exported cleanupExperiment */

function makePass() {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30";
  return new ProxyPass(token, Date.now() + 31536000 * 1000);
}
/* exported makePass */

async function putServerInRemoteSettings(
  server = {
    hostname: "test1.example.com",
    port: 443,
    quarantined: false,
  }
) {
  const TEST_US_CITY = {
    name: "Test City",
    code: "TC",
    servers: [server],
  };
  const US = {
    name: "United States",
    code: "US",
    cities: [TEST_US_CITY],
  };
  const client = RemoteSettings("vpn-serverlist");
  if (client && client.db) {
    await client.db.clear();
    await client.db.create(US);
    await client.db.importChanges({}, Date.now());
  }
}
/* exported putServerInRemoteSettings */
