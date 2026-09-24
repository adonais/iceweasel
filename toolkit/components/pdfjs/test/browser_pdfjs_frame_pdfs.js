/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

requestLongerTimeout(2);

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;
const CROSS_SITE_TESTROOT = "https://example.org/browser/" + RELATIVE_DIR;
const PDF_URL = TESTROOT + "file_pdfjs_test.pdf";
const EMBED_URL = TESTROOT + "file_pdfjs_embed.html";
const PDFJS_ORIGIN = "resource://pdf.js";

const { alwaysAsk, handleInternally, saveToDisk } = Ci.nsIHandlerInfo;

// Run embedding scenarios with same-site and cross-site PDFs.
const SITES = [
  {
    name: "same-site",
    suffix: "",
    pdfURL: PDF_URL,
    attachmentURL: TESTROOT + "file_pdfjs_attachment.sjs",
  },
  {
    name: "cross-site",
    suffix: "_cross_site",
    pdfURL: CROSS_SITE_TESTROOT + "file_pdfjs_test.pdf",
    attachmentURL: CROSS_SITE_TESTROOT + "file_pdfjs_attachment.sjs",
  },
];

function pageURL(name, { suffix }) {
  return `${TESTROOT}file_pdfjs_${name}${suffix}.html`;
}

function promiseDownloadFinished(list) {
  return new Promise(resolve => {
    list.addView({
      onDownloadChanged(download) {
        download.launchWhenSucceeded = false;
        if (download.succeeded || download.error) {
          list.removeView(this);
          resolve(download);
        }
      },
    });
  });
}

// The unknown-content prompt opens a DOM window.
function watchForPrompts() {
  const windows = [];
  const observer = {
    observe(subject) {
      windows.push(subject);
    },
  };
  Services.obs.addObserver(observer, "domwindowopened");
  return {
    windows,
    stop() {
      Services.obs.removeObserver(observer, "domwindowopened");
      // Close prompts left by a failed test.
      windows.forEach(win => win.close());
    },
  };
}

async function downloadsOf(urlPrefix) {
  const downloads = await Downloads.getList(Downloads.PUBLIC);
  return (await downloads.getAll()).filter(download =>
    download.source.url.startsWith(urlPrefix)
  );
}

function isDisplayedWithPdfJs(frame) {
  return (
    frame.currentWindowGlobal?.documentPrincipal.originNoSuffix === PDFJS_ORIGIN
  );
}

async function waitForPdfJsFrames(browser, count) {
  const { browsingContext } = browser;
  await TestUtils.waitForCondition(
    () => {
      const frames = browsingContext.children;
      return frames.length === count && frames.every(isDisplayedWithPdfJs);
    },
    `Waiting for ${count} frames to display their PDF with PDF.js`,
    100,
    200
  );
  return browsingContext.children;
}

async function waitForPdfJsViewer(frame) {
  await SpecialPowers.spawn(frame, [], async () => {
    const { ContentTaskUtils } = ChromeUtils.importESModule(
      "resource://testing-common/ContentTaskUtils.sys.mjs"
    );
    await ContentTaskUtils.waitForCondition(
      () => content.wrappedJSObject.PDFViewerApplication?.pdfDocument,
      "The viewer must display the PDF of the frame"
    );
  });
}

async function withPdfHandler(preferredAction, alwaysAskBeforeHandling, task) {
  const oldAction = changeMimeHandler(preferredAction, alwaysAskBeforeHandling);
  try {
    await task();
  } finally {
    changeMimeHandler(oldAction[0], oldAction[1]);
  }
}

async function downloadFromPage(aURL) {
  const downloadList = await Downloads.getList(Downloads.PUBLIC);
  const downloadFinished = promiseDownloadFinished(downloadList);
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, aURL);

  const download = await downloadFinished;
  return { download, tab };
}

add_setup(async function () {
  const saveDir = createTemporarySaveDirectory();

  await SpecialPowers.pushPrefEnv({
    set: [
      ["pdfjs.disabled", false],
      ["pdfjs.handleFrameAttributeLoads", true],
      ["browser.download.always_ask_before_handling_new_types", false],
      ["browser.download.folderList", 2],
      ["browser.download.dir", saveDir.path],
    ],
  });

  registerCleanupFunction(async function () {
    await cleanupDownloads();
    saveDir.remove(true);
  });
});

add_task(async function test_frames_are_not_handed_to_the_pdf_handler() {
  await withPdfHandler(alwaysAsk, true, async () => {
    for (const site of SITES) {
      info(`Testing the ${site.name} case`);
      const prompts = watchForPrompts();
      // A handler prompt would block the tab's load event.
      const tab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        pageURL("frames", site),
        false
      );

      try {
        const frames = await waitForPdfJsFrames(tab.linkedBrowser, 3);
        for (const frame of frames) {
          ok(
            frame.currentWindowGlobal.documentURI.spec.startsWith(site.pdfURL),
            "The PDF must be displayed under its own URI"
          );
        }

        is(prompts.windows.length, 0, "No prompt must be displayed");
        is(
          (await downloadsOf(`${site.pdfURL}?`)).length,
          0,
          "The PDFs must not have been downloaded"
        );

        for (const frame of frames) {
          await waitForPdfJsViewer(frame);
          await waitForPdfJSClose(frame);
        }
      } finally {
        prompts.stop();
        BrowserTestUtils.removeTab(tab);
      }
    }
  });
});

add_task(async function test_frame_pdf_is_displayed_inline() {
  await withPdfHandler(saveToDisk, false, async () => {
    for (const site of SITES) {
      info(`Testing the ${site.name} case`);
      const tab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        pageURL("iframe", site)
      );

      const [frame] = await waitForPdfJsFrames(tab.linkedBrowser, 1);
      await waitForPdfJsViewer(frame);

      is(
        (await downloadsOf(site.pdfURL)).length,
        0,
        "The PDF must not have been downloaded"
      );

      await waitForPdfJSClose(frame);
      BrowserTestUtils.removeTab(tab);
    }
  });
});

add_task(async function test_frameset_pdf_is_displayed_inline() {
  await withPdfHandler(saveToDisk, false, async () => {
    for (const site of SITES) {
      info(`Testing the ${site.name} case`);
      const tab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        pageURL("frameset", site)
      );

      const [frame] = await waitForPdfJsFrames(tab.linkedBrowser, 1);
      await waitForPdfJsViewer(frame);

      is(
        (await downloadsOf(site.pdfURL)).length,
        0,
        "The PDF must not have been downloaded"
      );

      await waitForPdfJSClose(frame);
      BrowserTestUtils.removeTab(tab);
    }
  });
});

add_task(async function test_frame_navigation_is_still_handled() {
  // A link targeting an existing frame still uses the configured handler.
  await withPdfHandler(saveToDisk, false, async () => {
    for (const site of SITES) {
      info(`Testing the ${site.name} case`);
      const tab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        pageURL("frame_target", site)
      );
      const downloadList = await Downloads.getList(Downloads.PUBLIC);
      const downloadFinished = promiseDownloadFinished(downloadList);

      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#pdfLink",
        {},
        tab.linkedBrowser
      );

      const download = await downloadFinished;
      ok(download.succeeded, "The PDF must have been downloaded successfully");
      is(
        download.source.url,
        site.pdfURL,
        "The PDF must have the expected URL"
      );

      BrowserTestUtils.removeTab(tab);
      await cleanupDownloads();
    }
  });
});

add_task(async function test_sandboxed_frame_is_still_handled() {
  // Sandboxed frame loads still use the configured handler.
  await withPdfHandler(saveToDisk, false, async () => {
    for (const site of SITES) {
      info(`Testing the ${site.name} case`);
      const { download, tab } = await downloadFromPage(
        pageURL("frame_sandboxed", site)
      );

      ok(download.succeeded, "The PDF must have been downloaded successfully");
      is(
        download.source.url,
        site.pdfURL,
        "The PDF must have the expected URL"
      );

      BrowserTestUtils.removeTab(tab);
      await cleanupDownloads();
    }
  });
});

add_task(async function test_frame_attachment_is_still_downloaded() {
  await withPdfHandler(handleInternally, false, async () => {
    for (const site of SITES) {
      info(`Testing the ${site.name} case`);
      const { download, tab } = await downloadFromPage(
        pageURL("frame_attachment", site)
      );

      ok(download.succeeded, "The PDF must have been downloaded successfully");
      is(
        download.source.url,
        site.attachmentURL,
        "The PDF must have the expected URL"
      );
      const [frame] = tab.linkedBrowser.browsingContext.children;
      ok(!isDisplayedWithPdfJs(frame), "The PDF must not have been displayed");

      BrowserTestUtils.removeTab(tab);
      await cleanupDownloads();
    }
  });
});

add_task(async function test_pref_disables_the_frame_handling() {
  await SpecialPowers.pushPrefEnv({
    set: [["pdfjs.handleFrameAttributeLoads", false]],
  });

  await withPdfHandler(saveToDisk, false, async () => {
    const { download, tab } = await downloadFromPage(
      pageURL("iframe", SITES[0])
    );

    ok(download.succeeded, "The PDF must have been downloaded successfully");
    is(download.source.url, PDF_URL, "The PDF must have the expected URL");

    BrowserTestUtils.removeTab(tab);
    await cleanupDownloads();

    // The pref does not affect object/embed loads.
    const embedTab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      EMBED_URL
    );
    const [frame] = await waitForPdfJsFrames(embedTab.linkedBrowser, 1);
    await waitForPdfJsViewer(frame);
    await waitForPdfJSClose(frame);
    BrowserTestUtils.removeTab(embedTab);
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_toplevel_pdf_is_still_handled() {
  await withPdfHandler(saveToDisk, false, async () => {
    const tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "about:blank"
    );
    const { linkedBrowser: browser } = tab;
    const downloadList = await Downloads.getList(Downloads.PUBLIC);
    const downloadFinished = promiseDownloadFinished(downloadList);

    BrowserTestUtils.startLoadingURIString(browser, PDF_URL);

    const download = await downloadFinished;
    ok(download.succeeded, "The PDF must have been downloaded successfully");
    is(download.source.url, PDF_URL, "The PDF must have the expected URL");
    is(
      browser.currentURI.spec,
      "about:blank",
      "The PDF must not have been displayed"
    );

    BrowserTestUtils.removeTab(tab);
    await cleanupDownloads();
  });
});
