/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ProfilerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ProfilerTestUtils.sys.mjs"
);

/**
 * Drives one real success, one real handled outcome ("document-hidden"),
 * and one real error ("TimeoutError") through PageExtractor: no internals
 * are stubbed, and every status comes from an actual page load. Asserts the
 * resulting marker colors, then dumps the captured profile to disk so it
 * can be dragged into https://profiler.firefox.com to see the blue/yellow/
 * red PageExtractor markers in the marker chart.
 */
add_task(async function test_page_extractor_marker_colors() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  // Registered as each resource is created, so a step that throws partway
  // through still tears down everything before it: a profiler or tab left
  // running would cascade into the tests that follow.
  const cleanups = [];
  let profile;
  await ProfilerTestUtils.startProfilerForMarkerTests();
  try {
    info("Blue marker: extracting a normal foreground page, which succeeds.");
    const { html: foregroundHtml } = await MLTestUtils.serveHTMLInTab({
      browser: gBrowser,
    });
    const { getPageExtractor, cleanup: cleanupForeground } =
      await foregroundHtml`
      <article>
        <h1>Marker colors test</h1>
        <p>This content is extracted to produce a success marker.</p>
      </article>
    `;
    cleanups.push(cleanupForeground);
    await getPageExtractor().getText();

    info(
      "Yellow marker: waiting on a backgrounded tab, where document.hidden " +
        'is genuinely true, so wait-for-ready finishes as "document-hidden" ' +
        'rather than "success".'
    );
    const { html } = MLTestUtils.serveHTML();
    const { url: bgUrl, cleanup: cleanupBgServer } = html`
      <!DOCTYPE html>
      <body>
        Background tab content
      </body>
    `;
    cleanups.push(cleanupBgServer);
    const backgroundTab = await BrowserTestUtils.addTab(gBrowser, bgUrl, {
      inBackground: true,
    });
    cleanups.push(() => BrowserTestUtils.removeTab(backgroundTab));
    await BrowserTestUtils.browserLoaded(backgroundTab.linkedBrowser);
    const backgroundExtractor =
      backgroundTab.linkedBrowser.browsingContext.currentWindowGlobal.getActor(
        "PageExtractor"
      );
    await backgroundExtractor.waitForPageReady();

    info(
      "Red marker: loading a headless page that never commits, which times out."
    );
    await SpecialPowers.pushPrefEnv({
      set: [["browser.ml.pageExtractor.headlessTimeoutMs", 500]],
    });
    cleanups.push(() => SpecialPowers.popPrefEnv());
    const { url: stalledUrl, cleanup: cleanupStalled } =
      MLTestUtils.serveStalledPage();
    cleanups.push(cleanupStalled);
    await Assert.rejects(
      PageExtractorParent.getHeadlessExtractor({
        urlString: stalledUrl,
        callback: () => ok(false, "The callback must not run."),
      }),
      /did not load in a headless browser within 500ms/,
      "The stalled page times out."
    );

    profile = await ProfilerTestUtils.stopNowAndGetProfile();
  } finally {
    if (Services.profiler.IsActive()) {
      await Services.profiler.StopProfiler();
    }
    for (const cleanup of cleanups.reverse()) {
      await cleanup();
    }
  }

  const markers = ProfilerTestUtils.getPayloadsOfTypeFromAllThreads(
    profile,
    "PageExtractor"
  );
  const successMarker = markers.find(
    m => m.phase === "get-text" && m.status === "success"
  );
  const hiddenMarker = markers.find(
    m => m.phase === "wait-for-ready" && m.status === "document-hidden"
  );
  const errorMarker = markers.find(
    m => m.phase === "headless-navigate" && m.status === "error"
  );
  ok(successMarker, "A success marker was recorded.");
  ok(hiddenMarker, "A document-hidden marker was recorded.");
  ok(errorMarker, "An error marker was recorded.");
  is(successMarker.color, "blue", "Success renders blue.");
  is(hiddenMarker.color, "yellow", "A handled outcome renders yellow.");
  is(errorMarker.color, "red", "An error renders red.");

  const path = PathUtils.join(
    PathUtils.tempDir,
    "page_extractor_marker_colors.json"
  );
  await IOUtils.writeUTF8(path, JSON.stringify(profile));
  info(
    `Profile written to ${path} -- drag it into ` +
      "https://profiler.firefox.com to see the blue/yellow/red PageExtractor markers."
  );
});
