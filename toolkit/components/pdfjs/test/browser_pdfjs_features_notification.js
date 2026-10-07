/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;

const { PdfJsFeaturesNotification } = ChromeUtils.importESModule(
  "resource://pdf.js/PdfJsFeaturesNotification.sys.mjs"
);

const IMPRESSION_COUNT_PREF = PdfJsFeaturesNotification.IMPRESSION_COUNT_PREF;
const VIEWER_THEME_PREF = "pdfjs.viewerCssTheme";

// Theme and contrast tests load the viewer twice.
requestLongerTimeout(2);

function makeEmbeddedViewerUrl() {
  return (
    "data:text/html," +
    encodeURIComponent(`<iframe src="${TESTROOT}file_pdfjs_test.pdf"></iframe>`)
  );
}

add_task(async function test_shown_styled_layout_and_dismiss() {
  await SpecialPowers.pushPrefEnv({
    set: [[IMPRESSION_COUNT_PREF, 0]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await waitForPdfJS(browser, TESTROOT + "file_pdfjs_test.pdf");

      await SpecialPowers.spawn(browser, [], async function () {
        const doc = content.document;
        const bar = doc.getElementById("pdfFeaturesNotification");
        await ContentTaskUtils.waitForCondition(
          () => !bar.hidden,
          "notification is shown by default"
        );
        Assert.equal(
          bar.localName,
          "moz-message-bar",
          "the viewer hosts the shared bar"
        );
        Assert.ok(bar.shadowRoot, "the chrome:// widget loaded in the viewer");

        // Inspect the rendered DOM without waiving Xrays.
        const closeButton = bar.shadowRoot.querySelector("moz-button.close");
        // Fluent may replace the CTA while translating its parent.
        await ContentTaskUtils.waitForCondition(
          () =>
            bar.getAttribute("heading") &&
            bar.getAttribute("aria-label") &&
            bar.querySelector("a")?.textContent.trim() &&
            closeButton.shadowRoot?.querySelector("button")?.title,
          "notification content and accessible names are localized"
        );

        const icon = bar.shadowRoot.querySelector(".icon");
        Assert.stringContains(
          icon.src,
          "chrome://global/skin/icons/",
          "the icon uses the shared chrome:// asset"
        );
        const loaded = await new Promise(resolve => {
          const image = new content.Image();
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = icon.src;
        });
        Assert.ok(loaded, "the chrome:// icon is loadable by the viewer");

        const cs = content.getComputedStyle(bar);
        await ContentTaskUtils.waitForCondition(
          () => cs.backgroundColor !== "rgba(0, 0, 0, 0)",
          "the widget stylesheet and design tokens apply in the viewer"
        );

        const toolbarRect = doc
          .querySelector(".toolbar")
          .getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        Assert.greater(barRect.height, 0, "notification bar has height");
        Assert.greaterOrEqual(
          barRect.top,
          toolbarRect.bottom - 1,
          "notification bar is below the toolbar"
        );
        // ResizeObserver updates the viewer offset asynchronously.
        const viewerContainer = doc.getElementById("viewerContainer");
        await ContentTaskUtils.waitForCondition(
          () =>
            viewerContainer.getBoundingClientRect().top >=
            bar.getBoundingClientRect().bottom - 1,
          "viewer content is below the bar (top space reserved)"
        );

        closeButton.focus();
        Assert.equal(
          bar.shadowRoot.activeElement,
          closeButton,
          "close button is focused"
        );
        ContentTaskUtils.getEventUtils(content).synthesizeKey(" ", {}, content);
        await ContentTaskUtils.waitForCondition(
          () => !bar.isConnected,
          "notification dropped after Space"
        );
        Assert.equal(
          doc.activeElement,
          doc.getElementById("viewerContainer"),
          "focus moves into the viewer"
        );
      });

      await TestUtils.waitForCondition(
        () => PdfJsFeaturesNotification.isConsumed(),
        "dismissing in the viewer spent the shared budget"
      );

      await waitForPdfJSClose(browser);
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_cta_navigates_to_features() {
  await SpecialPowers.pushPrefEnv({
    set: [[IMPRESSION_COUNT_PREF, 0]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJS(browser, TESTROOT + "file_pdfjs_test.pdf");

      await SpecialPowers.spawn(browser, [], async () => {
        const bar = content.document.getElementById("pdfFeaturesNotification");
        // Fluent may replace the CTA while translating its parent.
        let cta;
        await ContentTaskUtils.waitForCondition(() => {
          cta = bar.querySelector("a");
          return !bar.hidden && cta?.textContent.trim();
        }, "notification CTA is ready");
        Assert.ok(
          !cta.hasAttribute("href"),
          "the CTA exposes no about:pdf URL for content-triggered loads"
        );
        Assert.equal(
          cta.getAttribute("role"),
          "link",
          "the CTA keeps link semantics"
        );
      });

      // Keep link-opening commands off the CTA (bug 2071624).
      const contextMenu = document.getElementById("contentAreaContextMenu");
      const popupShown = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popupshown"
      );
      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#pdfFeaturesNotification a",
        { type: "contextmenu", button: 2 },
        browser
      );
      await popupShown;
      Assert.ok(!gContextMenu.onLink, "the context menu does not see a link");
      Assert.ok(
        document.getElementById("context-openlinkintab").hidden,
        "Open Link in New Tab is not offered for the CTA"
      );
      const popupHidden = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popuphidden"
      );
      contextMenu.hidePopup();
      await popupHidden;

      const locationChanged = BrowserTestUtils.waitForLocationChange(
        gBrowser,
        "about:pdf#features"
      );
      const loaded = BrowserTestUtils.browserLoaded(browser, false, url =>
        url.startsWith("about:pdf")
      );
      await SpecialPowers.spawn(browser, [], () => {
        const cta = content.document.querySelector(
          "#pdfFeaturesNotification a"
        );
        cta.focus();
        Assert.equal(
          content.document.activeElement,
          cta,
          "the CTA is keyboard focusable"
        );
        ContentTaskUtils.getEventUtils(content).synthesizeKey(
          "KEY_Enter",
          {},
          content
        );
      });
      await Promise.all([locationChanged, loaded]);

      await SpecialPowers.spawn(browser, [], async () => {
        Assert.equal(
          content.location.href,
          "about:pdf#features",
          "CTA opens the features destination"
        );
        await ContentTaskUtils.waitForCondition(
          () =>
            content.document.getElementById("features-view").checkVisibility(),
          "features view is shown"
        );
      });

      const pdfUrl = TESTROOT + "file_pdfjs_test.pdf";
      const backToPdf = BrowserTestUtils.waitForLocationChange(
        gBrowser,
        pdfUrl
      );
      await SpecialPowers.spawn(browser, [], () => {
        content.document.getElementById("features-back").click();
      });
      await backToPdf;
      Assert.equal(browser.currentURI.spec, pdfUrl, "Back returns to the PDF");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.wrappedJSObject.PDFViewerApplication?.pdfDocument,
          "the PDF viewer has loaded the document after Back"
        );
      });

      await waitForPdfJSClose(browser);
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_hidden_when_dismissed() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [IMPRESSION_COUNT_PREF, PdfJsFeaturesNotification.impressionLimit + 1],
    ],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await waitForPdfJS(browser, TESTROOT + "file_pdfjs_test.pdf");

      // Check the dismissal option as well as the initially hidden bar.
      const dismissed = await SpecialPowers.spawn(
        browser,
        [],
        async function () {
          const viewer = content.wrappedJSObject.PDFViewerApplication;
          await viewer.preferences.initializedPromise;
          const bar = content.document.getElementById(
            "pdfFeaturesNotification"
          );
          Assert.ok(
            bar.hidden,
            "notification stays hidden once it was dismissed"
          );
          return content.wrappedJSObject.PDFViewerApplicationOptions.get(
            "featuresNotificationDismissed"
          );
        }
      );
      Assert.ok(dismissed, "the viewer is told the notification is dismissed");

      await waitForPdfJSClose(browser);
    }
  );

  Assert.equal(
    Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0),
    PdfJsFeaturesNotification.impressionLimit + 1,
    "a suppressed viewer does not spend an impression"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_hidden_in_embedded_viewer() {
  await SpecialPowers.pushPrefEnv({
    set: [[IMPRESSION_COUNT_PREF, 0]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: makeEmbeddedViewerUrl() },
    async function (browser) {
      await TestUtils.waitForCondition(
        () => browser.browsingContext.children.length === 1,
        "embedded PDF browsing context is created"
      );
      const iframe = browser.browsingContext.children[0];

      await SpecialPowers.spawn(iframe, [], async function () {
        const getApp = () => content.wrappedJSObject.PDFViewerApplication;
        await ContentTaskUtils.waitForCondition(
          () => getApp()?.initialized,
          "embedded PDF viewer is initialized"
        );
        await getApp().initializedPromise;
        // Wait past the point when a top-level viewer would load the widget.
        await ContentTaskUtils.waitForCondition(
          () => !!getApp().pdfViewer.onePageRendered,
          "PDF viewer has a document"
        );
        await getApp().pdfViewer.onePageRendered;
        await new Promise(resolve => content.requestAnimationFrame(resolve));

        const bar = content.document.getElementById("pdfFeaturesNotification");
        Assert.ok(getApp().isViewerEmbedded, "viewer detects embedded mode");
        Assert.ok(bar, "notification element is present");
        Assert.ok(bar.hidden, "notification stays hidden in embedded viewers");
        Assert.equal(
          content.customElements.get("moz-message-bar"),
          undefined,
          "the moz-message-bar module is not loaded in embedded viewers"
        );
      });

      await waitForPdfJSClose(iframe);
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_inherits_forced_viewer_theme() {
  for (const [theme, colorScheme] of [
    [1, "light"],
    [2, "dark"],
  ]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        [IMPRESSION_COUNT_PREF, 0],
        [VIEWER_THEME_PREF, theme],
      ],
    });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:blank" },
      async function (browser) {
        await waitForPdfJS(browser, TESTROOT + "file_pdfjs_test.pdf");

        await SpecialPowers.spawn(
          browser,
          [colorScheme],
          async function (expectedColorScheme) {
            const doc = content.document;
            const bar = doc.getElementById("pdfFeaturesNotification");
            await ContentTaskUtils.waitForCondition(
              () => !bar.hidden,
              "notification is shown"
            );

            Assert.equal(
              content.getComputedStyle(doc.documentElement).colorScheme,
              expectedColorScheme,
              `viewer uses the forced ${expectedColorScheme} theme`
            );
            Assert.equal(
              content.getComputedStyle(bar).colorScheme,
              expectedColorScheme,
              `notification inherits the forced ${expectedColorScheme} theme`
            );
          }
        );

        await waitForPdfJSClose(browser);
      }
    );

    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_contrast_modes_preserve_boundaries() {
  const modes = [
    {
      name: "increased contrast",
      prefs: [
        ["ui.useAccessibilityTheme", 1],
        ["browser.display.document_color_use", 1],
      ],
      forcedColors: false,
    },
    {
      name: "forced colors",
      prefs: [
        ["ui.useAccessibilityTheme", 1],
        ["browser.display.document_color_use", 2],
      ],
      forcedColors: true,
    },
  ];

  for (const { name, prefs, forcedColors } of modes) {
    await SpecialPowers.pushPrefEnv({
      set: [[IMPRESSION_COUNT_PREF, 0], ...prefs],
    });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:blank" },
      async browser => {
        await waitForPdfJS(browser, TESTROOT + "file_pdfjs_test.pdf");

        await SpecialPowers.spawn(
          browser,
          [name, forcedColors],
          async (modeName, expectForcedColors) => {
            const bar = content.document.getElementById(
              "pdfFeaturesNotification"
            );
            await ContentTaskUtils.waitForCondition(
              () => !bar.hidden,
              `notification is shown in ${modeName}`
            );

            Assert.ok(
              content.matchMedia("(prefers-contrast)").matches,
              `${modeName} enables prefers-contrast`
            );
            Assert.equal(
              content.matchMedia("(forced-colors: active)").matches,
              expectForcedColors,
              `${modeName} has the expected forced-colors state`
            );

            const style = content.getComputedStyle(bar);
            await ContentTaskUtils.waitForCondition(
              () => parseFloat(style.borderBottomWidth) > 0,
              `${modeName} keeps the notification boundary`
            );
            Assert.notEqual(
              style.borderBottomColor,
              "rgba(0, 0, 0, 0)",
              `${modeName} gives the notification a visible border`
            );
          }
        );

        await waitForPdfJSClose(browser);
      }
    );

    await SpecialPowers.popPrefEnv();
  }
});
