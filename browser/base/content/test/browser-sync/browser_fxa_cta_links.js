/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  FX_MONITOR_OAUTH_CLIENT_ID,
  FX_RELAY_OAUTH_CLIENT_ID,
  VPN_OAUTH_CLIENT_ID,
} = ChromeUtils.importESModule(
  "resource://gre/modules/FxAccountsCommon.sys.mjs"
);

const UTM =
  "utm_medium=referral&utm_source=firefox-desktop&utm_campaign=toolbar";
const NEW_USER = `${UTM}&utm_content=new-user-global`;
const EXISTING_USER = `${UTM}&utm_content=existing-user-global`;

// The exact destinations the growth team measures. These are asserted as whole
// strings so a dropped or reordered campaign param fails the test.
const PRODUCTS = [
  {
    name: "monitor",
    method: "openMonitorLink",
    clientId: FX_MONITOR_OAUTH_CLIENT_ID,
    newUserURL: `https://monitor.mozilla.org/?${NEW_USER}`,
    existingUserURL: `https://monitor.mozilla.org/user/dashboard/?${EXISTING_USER}`,
  },
  {
    name: "relay",
    method: "openRelayLink",
    clientId: FX_RELAY_OAUTH_CLIENT_ID,
    newUserURL: `https://relay.firefox.com/?${NEW_USER}`,
    existingUserURL: `https://relay.firefox.com/accounts/profile/?${EXISTING_USER}`,
  },
  {
    name: "vpn",
    method: "openVPNLink",
    clientId: VPN_OAUTH_CLIENT_ID,
    newUserURL: `https://www.mozilla.org/products/vpn/?${NEW_USER}`,
    existingUserURL: `https://www.mozilla.org/products/vpn/download/?${EXISTING_USER}`,
  },
];

/**
 * Invokes a product CTA with a stubbed account state and returns the URL that
 * would have been opened.
 *
 * @param {object} product
 *   An entry from PRODUCTS.
 * @param {object} options
 * @param {string} options.status
 *   A UIState.STATUS_* value.
 * @param {?string[]} options.attachedClients
 *   OAuth client Ids attached to the account, or null if never fetched.
 * @returns {string}
 */
function ctaURLFor(product, { status, attachedClients }) {
  const sandbox = sinon.createSandbox();
  const origClients = gSync._attachedClients;
  try {
    sandbox.stub(UIState, "get").returns({ status, syncEnabled: true });
    // Guards against the real network fetch replacing our injected list.
    sandbox.stub(gSync, "fetchListOfOAuthClients").resolves(true);
    sandbox.stub(gSync, "emitFxaToolbarTelemetry");
    const openLink = sandbox.stub(gSync, "openLink");
    const hide = sandbox.stub(PanelUI, "hide");

    gSync._attachedClients = attachedClients?.map(id => ({ id })) ?? null;
    gSync[product.method](null);

    Assert.ok(
      openLink.calledOnce,
      `${product.name}: opened exactly one link, and did so synchronously`
    );
    Assert.ok(hide.calledOnce, `${product.name}: closed the panel`);
    return openLink.firstCall.args[0].href;
  } finally {
    gSync._attachedClients = origClients;
    sandbox.restore();
  }
}

add_setup(async function () {
  gSync.init();
});

add_task(async function test_cta_new_user_urls() {
  for (const product of PRODUCTS) {
    const url = ctaURLFor(product, {
      status: UIState.STATUS_NOT_CONFIGURED,
      attachedClients: null,
    });
    Assert.equal(
      url,
      product.newUserURL,
      `${product.name}: signed-out users go to the landing page`
    );
  }
});

add_task(async function test_cta_signed_in_without_the_product() {
  for (const product of PRODUCTS) {
    const url = ctaURLFor(product, {
      status: UIState.STATUS_SIGNED_IN,
      attachedClients: [],
    });
    Assert.equal(
      url,
      product.newUserURL,
      `${product.name}: signed in but not subscribed still gets the landing page`
    );
  }
});

add_task(async function test_cta_existing_user_urls() {
  for (const product of PRODUCTS) {
    const url = ctaURLFor(product, {
      status: UIState.STATUS_SIGNED_IN,
      attachedClients: [product.clientId],
    });
    Assert.equal(
      url,
      product.existingUserURL,
      `${product.name}: subscribers deep-link into the product`
    );
  }
});

// Each CTA must key off its own client Id: having Relay attached must not
// promote the Monitor or VPN link to its existing-user destination.
add_task(async function test_cta_client_ids_do_not_cross_talk() {
  for (const attached of PRODUCTS) {
    for (const product of PRODUCTS) {
      const url = ctaURLFor(product, {
        status: UIState.STATUS_SIGNED_IN,
        attachedClients: [attached.clientId],
      });
      Assert.equal(
        url,
        product === attached ? product.existingUserURL : product.newUserURL,
        `${product.name}: correct destination when only ${attached.name} is attached`
      );
    }
  }
});

add_task(async function test_cta_all_products_attached() {
  const allClientIds = PRODUCTS.map(p => p.clientId);
  for (const product of PRODUCTS) {
    const url = ctaURLFor(product, {
      status: UIState.STATUS_SIGNED_IN,
      attachedClients: allClientIds,
    });
    Assert.equal(
      url,
      product.existingUserURL,
      `${product.name}: deep-links when every product is attached`
    );
  }
});

// The signed-in check is not redundant with the attached-client check.
// _attachedClients is only cleared on an explicit sign-out notification, so a
// stale list can outlive the signed-in state. In every non-signed-in status we
// must fall back to the landing page rather than deep-link an account the user
// can no longer access.
add_task(async function test_cta_stale_clients_in_non_signed_in_states() {
  const NON_SIGNED_IN = [
    UIState.STATUS_NOT_CONFIGURED,
    UIState.STATUS_NOT_VERIFIED,
    UIState.STATUS_LOGIN_FAILED,
  ];

  for (const status of NON_SIGNED_IN) {
    for (const product of PRODUCTS) {
      const url = ctaURLFor(product, {
        status,
        attachedClients: [product.clientId],
      });
      Assert.equal(
        url,
        product.newUserURL,
        `${product.name}: stale attached client is ignored in ${status}`
      );
    }
  }
});

add_task(async function test_cta_emits_telemetry() {
  const EVENTS = {
    openMonitorLink: "monitor_cta",
    openRelayLink: "relay_cta",
    openVPNLink: "vpn_cta",
  };

  for (const product of PRODUCTS) {
    const sandbox = sinon.createSandbox();
    try {
      sandbox
        .stub(UIState, "get")
        .returns({ status: UIState.STATUS_SIGNED_IN, syncEnabled: true });
      sandbox.stub(gSync, "openLink");
      sandbox.stub(PanelUI, "hide");
      const telemetry = sandbox.stub(gSync, "emitFxaToolbarTelemetry");

      const sourceElement = document.getElementById("fxa-toolbar-menu-button");
      gSync[product.method](sourceElement);

      Assert.ok(
        telemetry.calledOnceWith(EVENTS[product.method], sourceElement),
        `${product.name}: records the CTA click with its source element`
      );
    } finally {
      sandbox.restore();
    }
  }
});
