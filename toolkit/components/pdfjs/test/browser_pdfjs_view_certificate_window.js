/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Bug 2069514: "View certificate" must open about:certificate in the window
// showing the PDF, not in whichever window happens to be most recent.
//
// _viewPdfCertificate resolves the chrome window off the actor's browser and
// only falls back to Services.wm.getMostRecentBrowserWindow() when that lookup
// fails. Reading a removed property yields undefined rather than throwing, so a
// stale property name here makes the fallback fire every time - invisible with
// one window open, wrong window with two.

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;

// Shape only; filterCertsForView just checks base64 and length.
const CERT_DATA = { certs: ["TUlJQg=="] };

// Returns a restore function rather than registering cleanup, so the stub can
// be undone while the window is still alive.
function stubOpenTrustedLinkIn(win, calls, label) {
  const original = win.openTrustedLinkIn;
  win.openTrustedLinkIn = (url, where, params) => {
    calls.push({ label, url, where, params });
  };
  return () => {
    win.openTrustedLinkIn = original;
  };
}

add_task(async function test_certificate_opens_in_the_pdf_window() {
  await SpecialPowers.pushPrefEnv({
    set: [["pdfjs.enableSignatureVerification", true]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await waitForPdfJS(browser, TESTROOT + "file_pdfjs_test.pdf");

      // Opened second, so this is the window the fallback would pick.
      const otherWin = await BrowserTestUtils.openNewBrowserWindow();
      const restores = [];
      try {
        is(
          Services.wm.getMostRecentBrowserWindow(),
          otherWin,
          "The window without the PDF must be the most recent one, otherwise " +
            "both code paths lead to the same window and prove nothing"
        );

        const calls = [];
        restores.push(stubOpenTrustedLinkIn(window, calls, "pdfWindow"));
        restores.push(stubOpenTrustedLinkIn(otherWin, calls, "otherWindow"));

        const actor =
          browser.browsingContext.currentWindowGlobal.getActor("PdfJs");
        const opened = await actor.receiveMessage({
          name: "PDFJS:Parent:viewPdfCertificate",
          data: CERT_DATA,
        });

        ok(opened, "The certificate view must report success");
        is(calls.length, 1, "Exactly one window must be asked to open the tab");
        is(
          calls[0]?.label,
          "pdfWindow",
          "about:certificate must open in the window showing the PDF"
        );
        ok(
          calls[0]?.url.startsWith("about:certificate?cert="),
          "The URL must carry the certificate"
        );
        is(calls[0]?.where, "tab", "The certificate must open in a tab");
      } finally {
        for (const restore of restores) {
          restore();
        }
        await BrowserTestUtils.closeWindow(otherWin);
      }

      await waitForPdfJSClose(browser);
    }
  );
});
