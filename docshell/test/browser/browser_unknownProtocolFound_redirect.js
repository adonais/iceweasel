/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const REDIRECT_URL =
  "https://example.com/browser/docshell/test/browser/redirect_to_unknown_protocol.sjs";

function getErrorDescription(documentURI) {
  const query = documentURI.substring(documentURI.indexOf("?"));
  return new URLSearchParams(query).get("d");
}

add_task(async function test_scheme_of_redirect_target_is_reported() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    const errorPageLoaded = BrowserTestUtils.waitForErrorPage(browser);
    BrowserTestUtils.startLoadingURIString(browser, REDIRECT_URL);
    await errorPageLoaded;

    const documentURI = await SpecialPowers.spawn(
      browser,
      [],
      () => content.document.documentURI
    );

    ok(
      documentURI.startsWith("about:neterror"),
      `Expected a neterror page, got ${documentURI}`
    );
    ok(
      documentURI.includes("e=unknownProtocolFound"),
      `Expected an unknownProtocolFound error, got ${documentURI}`
    );

    const description = getErrorDescription(documentURI);
    ok(
      description.includes("hackbotunknownprotocol"),
      `Description should name the redirect target scheme, got: ${description}`
    );
    ok(
      !description.includes("(https)"),
      `Description should not name the scheme of the redirecting server, got: ${description}`
    );
  });
});
