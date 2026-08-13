/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;

// Both fixtures are produced by test/pdfs/sig_corpus/generate.py against the
// `pdf-sign-ca` test trust anchor that ships in
// security/manager/ssl/pdf_trust_anchors/. With the
// `enable_test_trust_anchors` pref set, the verified fixture should reach
// `Status: Signature verified` + `Certificate: Trusted` and the invalid
// fixture should reach `Status: Signature invalid`.
const VERIFIED_PDF = "file_pdfjs_signed_verified.pdf";
const INVALID_PDF = "file_pdfjs_signed_invalid.pdf";

/**
 * Wait for the signature properties verification to have settled, then open
 * the panel.
 *
 * @param {object} browser  The browser hosting the viewer.
 * @param {string} buttonState  CSS class the toolbar button must end up in
 *   (e.g. "state-verified" / "state-error"). Used to wait past the
 *   transient "state-loading" while NSS is checking.
 */
async function openSignaturePropertiesPanel(browser, buttonState) {
  // The button is hidden until `loadFromDocument` confirms the PDF has at
  // least one signature.
  await waitForSelector(
    browser,
    "#signaturePropertiesButton",
    "Signature properties button is rendered"
  );
  await waitForSelector(
    browser,
    `#signaturePropertiesButton.${buttonState}`,
    `Toolbar badge settles into ${buttonState}`
  );
  await click(browser, "#signaturePropertiesButton");
  await waitForSelector(
    browser,
    "#signaturePropertiesPanel:not(.hidden)",
    "Panel doorhanger opens"
  );
  // The list contains at least one card.
  await waitForSelector(
    browser,
    "#signaturePropertiesList .sigCard",
    "Panel lists at least one signature card"
  );
}

add_task(async function test_setup() {
  await SpecialPowers.pushPrefEnv({
    set: [
      // Turn the feature on (off by default in shipping Firefox).
      ["pdfjs.enableSignatureVerification", true],
      // Let `pdf-sign-ca` participate in chain validation so the bundled
      // test fixture validates against a real trust anchor without
      // touching the live root store.
      ["security.pdf_signature_verification.enable_test_trust_anchors", true],
    ],
  });
});

add_task(async function test_signed_verified_pdf_renders_verified_panel() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await waitForPdfJSAnnotationLayer(browser, TESTROOT + VERIFIED_PDF);
      await openSignaturePropertiesPanel(browser, "state-verified");

      await SpecialPowers.spawn(browser, [], () => {
        const { document } = content;

        const banner = document.querySelector(
          "#signaturePropertiesBanner.sigBanner"
        );
        Assert.ok(banner, "Banner is rendered");
        Assert.ok(
          banner.classList.contains("verified"),
          "Banner uses the verified severity class"
        );
        Assert.equal(
          banner.getAttribute("data-l10n-id"),
          "pdfjs-digital-signature-properties-banner-verified",
          "Banner Fluent id matches the verified state"
        );

        const cards = document.querySelectorAll(
          "#signaturePropertiesList .sigCard"
        );
        Assert.equal(cards.length, 1, "Exactly one signature card");

        const statusRow = cards[0].querySelector(".row.status--verified");
        Assert.ok(statusRow, "Status row marks the signature as verified");
        Assert.equal(
          statusRow.querySelector("span").getAttribute("data-l10n-id"),
          "pdfjs-digital-signature-properties-status-verified",
          "Status row resolves to the verified Fluent id"
        );

        const certRow = cards[0].querySelector(".row.cert--trusted");
        Assert.ok(certRow, "Certificate row marks the chain as trusted");
        Assert.equal(
          certRow.querySelector("span").getAttribute("data-l10n-id"),
          "pdfjs-digital-signature-properties-certificate-trusted",
          "Cert row resolves to the trusted Fluent id"
        );
      });

      await waitForPdfJSClose(browser);
    }
  );
});

add_task(async function test_signed_invalid_pdf_renders_invalid_panel() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await waitForPdfJSAnnotationLayer(browser, TESTROOT + INVALID_PDF);
      await openSignaturePropertiesPanel(browser, "state-error");

      await SpecialPowers.spawn(browser, [], () => {
        const { document } = content;

        const banner = document.querySelector(
          "#signaturePropertiesBanner.sigBanner"
        );
        Assert.ok(banner, "Banner is rendered");
        Assert.ok(
          banner.classList.contains("error"),
          "Banner uses the error severity class"
        );
        Assert.equal(
          banner.getAttribute("data-l10n-id"),
          "pdfjs-digital-signature-properties-banner-invalid",
          "Banner Fluent id matches the invalid state"
        );

        const cards = document.querySelectorAll(
          "#signaturePropertiesList .sigCard"
        );
        Assert.equal(cards.length, 1, "Exactly one signature card");

        const statusRow = cards[0].querySelector(".row.status--invalid");
        Assert.ok(statusRow, "Status row marks the signature as invalid");
        Assert.equal(
          statusRow.querySelector("span").getAttribute("data-l10n-id"),
          "pdfjs-digital-signature-properties-status-invalid",
          "Status row resolves to the invalid Fluent id"
        );

        // The cert row is intentionally omitted when the signature itself is
        // invalid — NSS doesn't surface a signerCertificate in that case.
        const certRow = cards[0].querySelector(".row[class*='cert--']");
        Assert.ok(
          !certRow,
          "Cert row is omitted when the signature is invalid"
        );
      });

      await waitForPdfJSClose(browser);
    }
  );
});
