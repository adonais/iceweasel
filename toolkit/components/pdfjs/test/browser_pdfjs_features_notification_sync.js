/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;
const PDF_URL = TESTROOT + "file_pdfjs_test.pdf";

const { PdfJsFeaturesNotification } = ChromeUtils.importESModule(
  "resource://pdf.js/PdfJsFeaturesNotification.sys.mjs"
);
const IMPRESSION_COUNT_PREF = PdfJsFeaturesNotification.IMPRESSION_COUNT_PREF;

function waitForBarShown(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(() => {
      const el = content.document.querySelector("moz-message-bar");
      return el && !el.hidden;
    }, "features-notification bar is visible");
  });
}

function waitForBarHidden(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(() => {
      const el = content.document.querySelector("moz-message-bar");
      // Hosts may either hide or remove a consumed notification.
      return !el || el.hidden;
    }, "features-notification bar is no longer shown");
  });
}

function dismissBar(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const bar = content.document.querySelector("moz-message-bar");
    // Query the shadow DOM without waiving Xrays.
    const closeButton = () => bar.shadowRoot?.querySelector("moz-button.close");
    await ContentTaskUtils.waitForCondition(
      () => closeButton(),
      "close button is rendered"
    );
    closeButton().click();
  });
}

// Computed styles to compare across both hosts.
const SHARED_STYLES = {
  bar: [
    "colorScheme",
    "backgroundColor",
    "color",
    "borderBottomColor",
    "fontFamily",
    "fontSize",
    "lineHeight",
  ],
  heading: ["fontWeight", "fontSize"],
  link: ["color", "textDecorationLine"],
};

// Set the root color scheme and font size for the comparison.
function setDocumentStyles(browser, scheme) {
  return SpecialPowers.spawn(browser, [scheme], value => {
    content.document.documentElement.style.colorScheme = value;
    content.document.documentElement.style.fontSize = content.getComputedStyle(
      content.document.querySelector("moz-message-bar")
    ).fontSize;
  });
}

function getBarStyles(browser) {
  return SpecialPowers.spawn(browser, [SHARED_STYLES], async parts => {
    const bar = content.document.querySelector("moz-message-bar");
    const barStyle = content.getComputedStyle(bar);
    await ContentTaskUtils.waitForCondition(
      () =>
        barStyle.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        bar.shadowRoot?.querySelector(".heading"),
      "the widget stylesheet is applied and the heading is rendered"
    );
    const elements = {
      bar,
      heading: bar.shadowRoot.querySelector(".heading"),
      link: bar.querySelector("a"),
    };
    const styles = {};
    for (const [part, properties] of Object.entries(parts)) {
      const style = content.getComputedStyle(elements[part]);
      for (const property of properties) {
        styles[`${part} ${property}`] = style[property];
      }
    }
    styles.height = bar.getBoundingClientRect().height;
    return styles;
  });
}

async function openViewer() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  await waitForPdfJS(tab.linkedBrowser, PDF_URL);
  return tab;
}

function resetNotificationBudget() {
  Services.prefs.clearUserPref(IMPRESSION_COUNT_PREF);
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [[IMPRESSION_COUNT_PREF, 0]],
  });
  registerCleanupFunction(resetNotificationBudget);
});

add_task(async function dismiss_in_viewer_hides_about_pdf_live() {
  resetNotificationBudget();

  const viewerTab = await openViewer();
  await waitForBarShown(viewerTab.linkedBrowser);

  const aboutTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:pdf"
  );
  await waitForBarShown(aboutTab.linkedBrowser);

  await dismissBar(viewerTab.linkedBrowser);
  await waitForBarHidden(aboutTab.linkedBrowser);
  await waitForBarHidden(viewerTab.linkedBrowser);

  Assert.ok(
    PdfJsFeaturesNotification.isConsumed(),
    "dismissing in the viewer spent the shared budget"
  );

  BrowserTestUtils.removeTab(aboutTab);
  await waitForPdfJSClose(viewerTab.linkedBrowser, true);
});

add_task(async function dismiss_in_about_pdf_hides_viewer_live() {
  resetNotificationBudget();

  const viewerTab = await openViewer();
  await waitForBarShown(viewerTab.linkedBrowser);

  const aboutTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:pdf"
  );
  await waitForBarShown(aboutTab.linkedBrowser);

  await dismissBar(aboutTab.linkedBrowser);
  await waitForBarHidden(viewerTab.linkedBrowser);
  await waitForBarHidden(aboutTab.linkedBrowser);

  Assert.ok(
    PdfJsFeaturesNotification.isConsumed(),
    "dismissing on about:pdf spent the shared budget"
  );

  BrowserTestUtils.removeTab(aboutTab);
  await waitForPdfJSClose(viewerTab.linkedBrowser, true);
});

add_task(async function bar_styles_match_across_hosts() {
  resetNotificationBudget();
  await SpecialPowers.pushPrefEnv({ set: [[IMPRESSION_COUNT_PREF, 0]] });

  const viewerTab = await openViewer();
  await waitForBarShown(viewerTab.linkedBrowser);
  const aboutTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:pdf"
  );
  await waitForBarShown(aboutTab.linkedBrowser);

  for (const scheme of ["light", "dark"]) {
    await setDocumentStyles(viewerTab.linkedBrowser, scheme);
    await setDocumentStyles(aboutTab.linkedBrowser, scheme);

    const viewerStyles = await getBarStyles(viewerTab.linkedBrowser);
    const aboutStyles = await getBarStyles(aboutTab.linkedBrowser);
    Assert.equal(
      aboutStyles["bar colorScheme"],
      scheme,
      `about:pdf renders the bar in ${scheme} mode`
    );
    for (const [key, value] of Object.entries(aboutStyles)) {
      Assert.equal(
        viewerStyles[key],
        value,
        `${scheme}: viewer ${key} matches about:pdf`
      );
    }
  }

  BrowserTestUtils.removeTab(aboutTab);
  await waitForPdfJSClose(viewerTab.linkedBrowser, true);
  await SpecialPowers.popPrefEnv();
});

add_task(async function dismiss_in_one_viewer_hides_the_other_live() {
  resetNotificationBudget();

  const tabA = await openViewer();
  const tabB = await openViewer();
  await waitForBarShown(tabA.linkedBrowser);
  await waitForBarShown(tabB.linkedBrowser);

  await dismissBar(tabA.linkedBrowser);
  await waitForBarHidden(tabB.linkedBrowser);
  await waitForBarHidden(tabA.linkedBrowser);

  await waitForPdfJSClose(tabB.linkedBrowser, true);
  await waitForPdfJSClose(tabA.linkedBrowser, true);
});

add_task(async function concurrent_viewers_claim_one_impression() {
  resetNotificationBudget();
  await SpecialPowers.pushPrefEnv({
    set: [[PdfJsFeaturesNotification.IMPRESSION_LIMIT_PREF, 1]],
  });

  const tabA = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const tabB = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  await Promise.all(
    [tabA, tabB].map(tab => {
      const browser = tab.linkedBrowser;
      const loaded = BrowserTestUtils.browserLoaded(browser, false, PDF_URL);
      BrowserTestUtils.startLoadingURIString(browser, PDF_URL);
      return loaded;
    })
  );

  // A background winner may not render its bar, so compare claim results.
  const dismissed = await Promise.all(
    [tabA, tabB].map(tab =>
      SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
        // Wait for document loading without requiring a rendered page.
        await ContentTaskUtils.waitForCondition(
          () => content.wrappedJSObject.PDFViewerApplication?.pdfDocument,
          "the PDF document is loaded"
        );
        await content.wrappedJSObject.PDFViewerApplication.preferences
          .initializedPromise;
        return content.wrappedJSObject.PDFViewerApplicationOptions.get(
          "featuresNotificationDismissed"
        );
      })
    )
  );
  Assert.equal(
    dismissed.filter(value => !value).length,
    1,
    "only one concurrent viewer claims the last impression"
  );
  Assert.equal(
    Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0),
    1,
    "the concurrent loads spend exactly one impression"
  );

  const winner = dismissed[0] ? tabB : tabA,
    loser = dismissed[0] ? tabA : tabB;
  gBrowser.selectedTab = winner;
  await waitForBarShown(winner.linkedBrowser);
  await SpecialPowers.spawn(loser.linkedBrowser, [], async () => {
    Assert.ok(
      content.document.querySelector("moz-message-bar").hidden,
      "the other viewer keeps the notification hidden"
    );
    Assert.equal(
      content.customElements.get("moz-message-bar"),
      undefined,
      "the other viewer doesn't load the moz-message-bar module"
    );
  });

  await waitForPdfJSClose(tabB.linkedBrowser, true);
  await waitForPdfJSClose(tabA.linkedBrowser, true);
  await SpecialPowers.popPrefEnv();
});

// Reaching the limit must leave both existing bars open.
add_task(async function last_impression_keeps_open_bars() {
  resetNotificationBudget();
  await SpecialPowers.pushPrefEnv({
    set: [[PdfJsFeaturesNotification.IMPRESSION_LIMIT_PREF, 2]],
  });

  const viewerTab = await openViewer();
  await waitForBarShown(viewerTab.linkedBrowser);
  const aboutTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:pdf"
  );
  await waitForBarShown(aboutTab.linkedBrowser);

  Assert.equal(
    Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0),
    2,
    "the two showings spent the whole budget"
  );
  Assert.ok(
    !PdfJsFeaturesNotification.isEligible(),
    "no further showing is allowed"
  );
  Assert.ok(
    !PdfJsFeaturesNotification.isConsumed(),
    "an exhausted budget is not a dismissal"
  );

  await TestUtils.waitForTick();
  for (const [host, browser] of [
    ["viewer", viewerTab.linkedBrowser],
    ["about:pdf", aboutTab.linkedBrowser],
  ]) {
    const hidden = await SpecialPowers.spawn(browser, [], () => {
      return content.document.querySelector("moz-message-bar").hidden;
    });
    Assert.ok(!hidden, `the ${host} bar stays open once the budget is spent`);
  }

  BrowserTestUtils.removeTab(aboutTab);
  await waitForPdfJSClose(viewerTab.linkedBrowser, true);
  await SpecialPowers.popPrefEnv();
});
