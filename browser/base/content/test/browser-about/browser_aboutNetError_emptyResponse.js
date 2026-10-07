/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { NodeHTTPServer } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

// A 4xx response with no body is what nsURILoader turns into
// NS_ERROR_NET_EMPTY_RESPONSE.
//
// registerPathHandler ships the handler to a separate Node process via
// handler.toString(), so it must not close over anything from this scope;
// pick a self-contained handler before registering it.
async function startEmptyResponseServer(setContentLength) {
  const server = new NodeHTTPServer();
  await server.start();
  registerCleanupFunction(() => server.stop());
  const handler = setContentLength
    ? (req, resp) => {
        resp.writeHead(404, { "Content-Length": "0" });
        resp.end();
      }
    : (req, resp) => {
        resp.writeHead(404);
        resp.end();
      };
  await server.registerPathHandler("/empty", handler);
  return `${server.origin()}/empty`;
}

async function loadEmptyResponseErrorPage(url) {
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

  info("Loading and waiting for the net error.");
  await pageLoaded;
  return { browser, tab };
}

async function assertEmptyResponseCopy(browser) {
  await SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content?.document?.querySelector("net-error-card"),
      "Wait for empty-response copy to render"
    );
    const doc = content.document;
    const netErrorCard = doc.querySelector("net-error-card").wrappedJSObject;
    Assert.ok(netErrorCard, "NetErrorCard supports empty server responses.");
    Assert.ok(netErrorCard.errorTitle, "NetErrorCard has errorTitle.");
    Assert.ok(netErrorCard.errorIntro, "NetErrorCard has errorIntro.");
    Assert.ok(netErrorCard.tryAgainButton, "NetErrorCard has tryAgainButton.");
    Assert.equal(
      netErrorCard.errorTitle.dataset.l10nId,
      "problem-with-this-site-title",
      "Using the 'problem with this site' title"
    );
    Assert.equal(
      netErrorCard.errorIntro.dataset.l10nId,
      "fp-neterror-http-error-intro",
      "Using the HTTP error intro."
    );
    const list = netErrorCard.renderRoot.querySelector(".what-can-you-do-list");
    Assert.ok(list, "NetErrorCard has what-can-you-do list.");
    Assert.ok(
      list.querySelector('[data-l10n-id="neterror-http-error-page"]'),
      "List includes check-the-address item"
    );
    Assert.ok(
      list.querySelector('[data-l10n-id="neterror-load-error-try-again"]'),
      "List includes try-again item"
    );
    Assert.ok(
      ContentTaskUtils.isVisible(netErrorCard.tryAgainButton),
      "The 'Try Again' button is shown."
    );
  });
}

add_task(async function test_net_empty_response_copy() {
  await setSecurityCertErrorsFeltPrivacyToTrue();

  const url = await startEmptyResponseServer(true);
  const { browser, tab } = await loadEmptyResponseErrorPage(url);
  await assertEmptyResponseCopy(browser);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_net_empty_response_copy_no_content_length() {
  await setSecurityCertErrorsFeltPrivacyToTrue();

  const url = await startEmptyResponseServer(false);
  const { browser, tab } = await loadEmptyResponseErrorPage(url);
  await assertEmptyResponseCopy(browser);
  BrowserTestUtils.removeTab(tab);
});
