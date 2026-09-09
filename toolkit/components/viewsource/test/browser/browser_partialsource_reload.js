/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// Bug 2061546: "View Selection Source" uses LoadURIOptions to pass an explicit
// base URI for the view-source: URI so that relative URIs are resolved.
// A reload should preserve this instead of hitting validation checks due to the
// changing base.

const RELATIVE_LINK = "relative-target.html";
const EXPECTED_HREF = `view-source:https://example.com/${RELATIVE_LINK}`;

const PAGE_HTML = `<html><body><a id="rel" href="${RELATIVE_LINK}">some text</a></body></html>`;
const PAGE_URL = `https://example.com/document-builder.sjs?html=${encodeURIComponent(
  PAGE_HTML
)}`;

// Assert page contains the relative link and it was resolved agains the right base
async function assertViewSourceBase(browser, when) {
  let hrefs = await SpecialPowers.spawn(browser, [], () =>
    Array.from(content.document.querySelectorAll("a[href]"), a => a.href)
  );
  is(hrefs.length, 1);
  is(hrefs[0], EXPECTED_HREF, `Relative URL ${when} correctly resolved`);
}

add_task(async function partial_source_base_survives_SH_load() {
  // Disable the bfcache, so that the history traversal below performs a real
  // load through DocumentLoadListener instead of restoring a cached viewer.
  await pushPrefs(["browser.sessionhistory.max_total_viewers", 0]);

  let sourceTab = await openDocumentSelect(PAGE_URL, "#rel");
  let browser = sourceTab.linkedBrowser;

  await assertViewSourceBase(browser, "initially");

  // Test reload
  await BrowserTestUtils.reloadTab(sourceTab);
  await assertViewSourceBase(browser, "after a reload");

  // Test traversal
  let loaded = BrowserTestUtils.browserLoaded(browser, false, "about:blank");
  BrowserTestUtils.startLoadingURIString(browser, "about:blank");
  await loaded;
  let pageShown = waitForSourceLoaded(sourceTab);
  browser.goBack();
  await pageShown;
  await assertViewSourceBase(browser, "after traversal");

  gBrowser.removeTab(sourceTab);
});
