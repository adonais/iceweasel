/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Closing the connection right after accepting it, before any response is
// sent, surfaces as NS_ERROR_NET_RESET.
function startDropServer() {
  const server = Cc["@mozilla.org/network/server-socket;1"].createInstance(
    Ci.nsIServerSocket
  );
  server.init(-1, true, -1);
  server.asyncListen({
    onSocketAccepted(socket, transport) {
      transport.close(Cr.NS_OK);
    },
    onStopListening() {},
  });
  registerCleanupFunction(() => server.close());
  return server.port;
}

// nsITLSServerSocket needs a certificate with a corresponding private key
// available. In mochitests, the certificate with the common name "Mochitest
// client" has such a key.
async function getTestServerCertificate() {
  const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  for (const cert of await certDB.getCerts()) {
    if (cert.commonName == "Mochitest client") {
      return cert;
    }
  }
  return null;
}

// Completes the TLS handshake, then closes the connection right after, also
// surfacing as NS_ERROR_NET_RESET (see browser_navigation_failures.js).
function startTLSDropServer(cert) {
  const server = Cc["@mozilla.org/network/tls-server-socket;1"].createInstance(
    Ci.nsITLSServerSocket
  );
  server.init(-1, true, -1);
  server.serverCert = cert;

  let input, output;
  const listener = {
    onSocketAccepted(socket, transport) {
      const connectionInfo = transport.securityCallbacks.getInterface(
        Ci.nsITLSServerConnectionInfo
      );
      connectionInfo.setSecurityObserver(listener);
      input = transport.openInputStream(0, 0, 0);
      output = transport.openOutputStream(0, 0, 0);
    },
    onHandshakeDone() {
      input.asyncWait(
        {
          onInputStreamReady() {
            input.close();
            output.close();
          },
        },
        0,
        0,
        Services.tm.currentThread
      );
    },
    onStopListening() {},
  };

  server.setSessionTickets(false);
  server.asyncListen(listener);
  registerCleanupFunction(() => server.close());
  return server;
}

async function loadDroppedConnectionErrorPage(url) {
  let browser, tab;
  let pageLoaded;
  await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, url);
      browser = gBrowser.selectedBrowser;
      tab = gBrowser.selectedTab;
      pageLoaded = BrowserTestUtils.waitForErrorPage(browser);
    },
    false
  );
  await pageLoaded;
  return { browser, tab };
}

add_task(async function test_netReset_from_dropped_connection_http() {
  const port = startDropServer();
  const { browser, tab } = await loadDroppedConnectionErrorPage(
    `http://127.0.0.1:${port}/`
  );

  await SpecialPowers.spawn(browser, [], () => {
    Assert.ok(
      content.document.documentURI.includes("e=netReset"),
      "A dropped http connection shows the netReset error page"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_netReset_from_dropped_connection_https() {
  await SpecialPowers.pushPrefEnv({
    // This test fails on some platforms if we leave IPv6 enabled.
    set: [["network.dns.disableIPv6", true]],
  });

  const certOverrideService = Cc[
    "@mozilla.org/security/certoverride;1"
  ].getService(Ci.nsICertOverrideService);
  const cert = await getTestServerCertificate();
  const server = startTLSDropServer(cert);
  certOverrideService.rememberValidityOverride(
    "localhost",
    server.port,
    {},
    cert,
    true
  );
  registerCleanupFunction(() => {
    certOverrideService.clearValidityOverride("localhost", server.port, {});
  });

  const { browser, tab } = await loadDroppedConnectionErrorPage(
    `https://localhost:${server.port}/`
  );

  await SpecialPowers.spawn(browser, [], () => {
    Assert.ok(
      content.document.documentURI.includes("e=netReset"),
      "A dropped https connection shows the netReset error page"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_netReset_error_page_elements() {
  const { browser, tab } = await loadNetErrorPage("netReset", "127.0.0.1");

  await SpecialPowers.spawn(browser, [], async function () {
    await ContentTaskUtils.waitForCondition(
      () => content?.document?.querySelector("net-error-card"),
      "Wait for net-error-card to render"
    );
    const doc = content.document;
    const netErrorCard = doc.querySelector("net-error-card").wrappedJSObject;
    await netErrorCard.getUpdateComplete();

    Assert.equal(
      netErrorCard.errorTitle.dataset.l10nId,
      "netReset-title",
      "Using the netReset title"
    );
    Assert.equal(
      netErrorCard.errorIntro.dataset.l10nId,
      "fp-neterror-offline-intro",
      "Using the netReset intro"
    );
    const list = netErrorCard.renderRoot.querySelector(".what-can-you-do-list");
    Assert.ok(list, "NetErrorCard has what-can-you-do list");
    Assert.ok(
      list.querySelector('[data-l10n-id="neterror-load-error-try-again"]'),
      "List includes try-again item"
    );
    Assert.ok(
      list.querySelector('[data-l10n-id="neterror-load-error-connection"]'),
      "List includes connection item"
    );
    Assert.ok(
      list.querySelector('[data-l10n-id="neterror-load-error-firewall"]'),
      "List includes firewall item"
    );
    Assert.ok(
      ContentTaskUtils.isVisible(netErrorCard.tryAgainButton),
      "The 'Try Again' button is shown"
    );
    Assert.ok(
      !netErrorCard.renderRoot.querySelector(
        '[data-l10n-id="fp-cert-error-code"]'
      ),
      "No error code is shown for netReset"
    );
  });

  BrowserTestUtils.removeTab(tab);
});
