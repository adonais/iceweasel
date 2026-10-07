/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Bug 2068800: a connection reset or interruption on an https URI used to be
// relabelled as an SSL error, on the assumption that it meant TLS version
// intolerance. Check that these errors reach their own error pages instead.

async function errorPageFor(browser, errorName, uri) {
  const loaded = BrowserTestUtils.browserLoaded(browser, false, uri, true);
  await SpecialPowers.spawn(browser, [errorName, uri], (name, spec) => {
    docShell.displayLoadError(Cr[name], Services.io.newURI(spec), null, null);
  });
  const internalURL = await loaded;
  return new URLSearchParams(internalURL.split("?")[1]).get("e");
}

add_task(async function test_net_errors_are_not_ssl_errors() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    for (const [errorName, expected] of [
      ["NS_ERROR_NET_RESET", "netReset"],
      ["NS_ERROR_NET_INTERRUPT", "netInterrupt"],
    ]) {
      for (const scheme of ["https", "http"]) {
        const shown = await errorPageFor(
          browser,
          errorName,
          `${scheme}://example.com/`
        );
        Assert.equal(
          shown,
          expected,
          `${errorName} on ${scheme} shows the ${expected} page`
        );
      }
    }
  });
});
