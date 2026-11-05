// This test verifies that Firefox correctly upgrades an HTTP request to HTTPS
// when the request's domain name matches network.dns.mock_HTTPS_RR_domain,
// and that the upgrade is logged to the web console.

"use strict";

const testPathUpgradeable = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  // eslint-disable-next-line sdl/no-insecure-url
  "http://example.org"
);

const kTestURI = testPathUpgradeable + "dummy.html";

add_task(async function () {
  // Set the mock_HTTPS_RR_domain and tell necko to use HTTPS RR.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["network.dns.mock_HTTPS_RR_domain", "example.org"],
      ["network.dns.force_use_https_rr", true],
      // HTTPS-First is checked before HTTPS RR and would upgrade the request
      // itself.
      ["dom.security.https_first", false],
    ],
  });

  await BrowserTestUtils.withNewTab("about:blank", async function (browser) {
    const loaded = BrowserTestUtils.browserLoaded(browser, false, null, true);
    // The page should be upgraded to HTTPS.
    BrowserTestUtils.startLoadingURIString(browser, kTestURI);
    await loaded;
    await SpecialPowers.spawn(browser, [], async () => {
      ok(
        content.document.location.href.startsWith("https://"),
        "Should be https"
      );
    });

    // The web console shows a message only if it carries the page's inner
    // window ID, so check that the upgrade message does.
    await SpecialPowers.spawn(browser, [], async () => {
      const innerWindowId = content.windowGlobalChild.innerWindowId;
      await ContentTaskUtils.waitForCondition(
        () =>
          Services.console
            .getMessageArray()
            .some(
              msg =>
                msg instanceof Ci.nsIScriptError &&
                msg.innerWindowID == innerWindowId &&
                msg.message.includes("HTTPS RR:") &&
                msg.message.includes("Upgrading insecure request") &&
                msg.message.includes("example.org")
            ),
        "HTTPS RR upgrade message is reported to the loaded document's window"
      );
    });
  });
});
