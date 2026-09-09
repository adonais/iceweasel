/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;
const CROSS_SITE_TESTROOT = "https://example.org/browser/" + RELATIVE_DIR;
const PDF_URL = TESTROOT + "file_pdfjs_test.pdf";
const CROSS_SITE_PDF_URL = CROSS_SITE_TESTROOT + "file_pdfjs_test.pdf";
const SHORT_EMBED_URL = TESTROOT + "file_pdfjs_embed_short.html";
const REFERRER_PAGE_URL = TESTROOT + "file_pdfjs_embed_referrer.html";
const REFERRER_PDF_URL = TESTROOT + "file_pdfjs_referrer.sjs?pdf";
const REFERRER_RESULT_URL = TESTROOT + "file_pdfjs_referrer.sjs?result";
const SLOW_PDF_URL = TESTROOT + "file_pdfjs_slow.sjs";
const FALLBACK_CONVERTER_URI =
  "resource://pdf.js/PdfEmbedFallbackStreamConverter.sys.mjs";

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

async function clickOpenButton(embedContext) {
  await SpecialPowers.spawn(embedContext, [], async () => {
    const button = content.document.getElementById("fallbackOpenButton");
    ok(button, "The fallback page must be displayed in the embed element");
    await content.document.l10n.ready;
    isnot(button.textContent, "", "The button must be localized");
    await ContentTaskUtils.waitForCondition(
      () => button.getBoundingClientRect().height,
      "Waiting for the button of the fallback page to be laid out"
    );
  });

  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#fallbackOpenButton",
    {},
    embedContext
  );
}

add_setup(async function () {
  const saveDir = createTemporarySaveDirectory();
  const oldAction = changeMimeHandler(Ci.nsIHandlerInfo.saveToDisk, false);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["pdfjs.disabled", true],
      ["pdfjs.embedFallback", true],
      ["browser.download.always_ask_before_handling_new_types", false],
      ["browser.download.folderList", 2],
      ["browser.download.dir", saveDir.path],
    ],
  });

  registerCleanupFunction(async function () {
    changeMimeHandler(oldAction[0], oldAction[1]);
    await cleanupDownloads();
    saveDir.remove(true);
  });
});

add_task(async function test_stream_converter_factory_dispatch() {
  const { StreamConverterFactory } = ChromeUtils.importESModule(
    "resource://gre/modules/pdfjs.sys.mjs"
  );
  const { PdfEmbedFallbackStreamConverter } = ChromeUtils.importESModule(
    FALLBACK_CONVERTER_URI
  );

  ok(
    StreamConverterFactory() instanceof PdfEmbedFallbackStreamConverter,
    "The lightweight converter must handle PDFs when PDF.js is disabled"
  );

  await SpecialPowers.pushPrefEnv({ set: [["pdfjs.disabled", false]] });
  try {
    const { PdfStreamConverter } = ChromeUtils.importESModule(
      "resource://pdf.js/PdfStreamConverter.sys.mjs"
    );
    ok(
      StreamConverterFactory() instanceof PdfStreamConverter,
      "The PDF.js converter must handle PDFs when the viewer is enabled"
    );
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_get_converted_type_without_channel() {
  // nsIStreamConverter documents the channel as nullable, but neither converter
  // can decide anything without one.
  const checkConverter = name => {
    const converter = Cc[
      "@mozilla.org/streamconv;1?from=application/pdf&to=*/*"
    ].createInstance(Ci.nsIStreamConverter);
    Assert.throws(
      () => converter.getConvertedType("application/pdf", null),
      error => error.result === Cr.NS_ERROR_INVALID_ARG,
      `${name} must reject a missing channel with NS_ERROR_INVALID_ARG`
    );
  };

  checkConverter("The fallback converter");
  await SpecialPowers.pushPrefEnv({ set: [["pdfjs.disabled", false]] });
  try {
    checkConverter("The PDF.js converter");
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_fallback_cancels_pdf_request() {
  const requestStopped = TestUtils.topicObserved(
    "http-on-stop-request",
    subject =>
      subject.QueryInterface(Ci.nsIHttpChannel).URI.spec === SLOW_PDF_URL
  );
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const { linkedBrowser: browser } = tab;

  const fallbackLoaded = BrowserTestUtils.browserLoaded(
    browser,
    /* includeSubFrames = */ true,
    SLOW_PDF_URL
  );
  BrowserTestUtils.startLoadingURIString(
    browser,
    TESTROOT + "file_pdfjs_embed_slow.html"
  );
  await fallbackLoaded;

  const [channel] = await requestStopped;
  is(
    channel.status,
    Cr.NS_BINDING_ABORTED,
    "The original PDF request must be cancelled"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_fallback_cancels_pdf_request_on_pagehide() {
  const requestStopped = TestUtils.topicObserved(
    "http-on-stop-request",
    subject =>
      subject.QueryInterface(Ci.nsIHttpChannel).URI.spec === SLOW_PDF_URL
  );
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const { linkedBrowser: browser } = tab;

  const fallbackHidden = BrowserTestUtils.waitForContentEvent(
    browser,
    "pagehide",
    true,
    event => !!event.target.getElementById("fallbackOpenButton")
  );
  const fallbackNavigated = BrowserTestUtils.waitForContentEvent(
    browser,
    "DOMContentLoaded",
    true,
    event => {
      const { target: document } = event;
      if (!document.getElementById("fallbackOpenButton")) {
        return false;
      }
      document.defaultView.location.replace("about:blank");
      return true;
    }
  );

  BrowserTestUtils.startLoadingURIString(
    browser,
    TESTROOT + "file_pdfjs_embed_slow.html"
  );
  await fallbackNavigated;
  await fallbackHidden;

  const [channel] = await requestStopped;
  is(
    channel.status,
    Cr.NS_BINDING_ABORTED,
    "The original PDF request must be cancelled when the fallback is hidden"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_open_pdf_from_the_fallback_page() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const { linkedBrowser: browser } = tab;

  const fallbackLoaded = BrowserTestUtils.browserLoaded(
    browser,
    /* includeSubFrames = */ true,
    PDF_URL
  );
  BrowserTestUtils.startLoadingURIString(
    browser,
    TESTROOT + "file_pdfjs_embed.html"
  );
  await fallbackLoaded;

  const embedContext = browser.browsingContext.children[0];
  ok(embedContext, "The embed element must have a browsing context");

  const downloadList = await Downloads.getList(Downloads.PUBLIC);
  const downloadFinished = promiseDownloadFinished(downloadList);
  const embedderPrincipal = browser.contentPrincipal;
  const retryStarted = TestUtils.topicObserved(
    "http-on-modify-request",
    subject => subject.QueryInterface(Ci.nsIHttpChannel).URI.spec === PDF_URL
  );

  const converterErrors = [];
  const consoleListener = {
    observe(message) {
      if (
        message instanceof Ci.nsIScriptError &&
        message.sourceName === FALLBACK_CONVERTER_URI
      ) {
        converterErrors.push(message);
      }
    },
  };
  Services.console.registerListener(consoleListener);

  let download;
  try {
    info("Clicking on the button to open the pdf...");
    await clickOpenButton(embedContext);

    const [retryChannel] = await retryStarted;
    is(
      retryChannel.loadInfo.externalContentPolicyType,
      Ci.nsIContentPolicy.TYPE_SUBDOCUMENT,
      "The retried PDF request must be a subdocument load"
    );
    ok(
      retryChannel.loadInfo.loadingPrincipal.equals(embedderPrincipal),
      "The retried PDF request must use the embedder's loading principal"
    );
    ok(
      retryChannel.loadInfo.triggeringPrincipal.equals(embedderPrincipal),
      "The retried PDF request must preserve the embedder's triggering principal"
    );

    download = await downloadFinished;
  } finally {
    Services.console.unregisterListener(consoleListener);
  }
  is(
    converterErrors.length,
    0,
    "Declining the subdocument retry must not produce a console error"
  );
  ok(download.succeeded, "The PDF must have been downloaded successfully");
  is(download.source.url, PDF_URL, "The PDF must have the expected URL");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_open_cross_site_pdf_from_the_fallback_page() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const { linkedBrowser: browser } = tab;

  const fallbackLoaded = BrowserTestUtils.browserLoaded(
    browser,
    /* includeSubFrames = */ true,
    CROSS_SITE_PDF_URL
  );
  BrowserTestUtils.startLoadingURIString(
    browser,
    TESTROOT + "file_pdfjs_embed_cross_site.html"
  );
  await fallbackLoaded;

  const embedContext = browser.browsingContext.children[0];
  ok(embedContext, "The embed element must have a browsing context");
  if (gFissionBrowser) {
    // A cross-site fallback runs in the PDF site's process, which cannot
    // initiate the retry with the embedder's principal.
    isnot(
      embedContext.currentWindowGlobal.osPid,
      browser.browsingContext.currentWindowGlobal.osPid,
      "The fallback must be displayed in the process of the PDF's site"
    );
  }

  const downloadList = await Downloads.getList(Downloads.PUBLIC);
  const downloadFinished = promiseDownloadFinished(downloadList);
  const embedderPrincipal = browser.contentPrincipal;
  const retryStarted = TestUtils.topicObserved(
    "http-on-modify-request",
    subject =>
      subject.QueryInterface(Ci.nsIHttpChannel).URI.spec === CROSS_SITE_PDF_URL
  );

  info("Clicking on the button to open the cross-site pdf...");
  await clickOpenButton(embedContext);

  const [retryChannel] = await retryStarted;
  ok(
    retryChannel.loadInfo.loadingPrincipal.equals(embedderPrincipal),
    "The retried PDF request must use the embedder's loading principal"
  );
  ok(
    retryChannel.loadInfo.triggeringPrincipal.equals(embedderPrincipal),
    "The retried PDF request must preserve the embedder's triggering principal"
  );

  const download = await downloadFinished;
  ok(download.succeeded, "The PDF must have been downloaded successfully");
  is(
    download.source.url,
    CROSS_SITE_PDF_URL,
    "The PDF must have the expected URL"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_only_embedded_pdfs_are_opened() {
  // A compromised content process can send this message for any frame it hosts.
  // Only object/embed frames may be reloaded with their embedder's principal.
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TESTROOT + "file_pdfjs_embed.html"
  );
  const { linkedBrowser: browser } = tab;
  const topContext = browser.browsingContext;

  await SpecialPowers.spawn(browser, [], async () => {
    const append = async element => {
      const loaded = new Promise(resolve => {
        element.addEventListener("load", resolve, { once: true });
      });
      content.document.body.append(element);
      if (element.localName === "object") {
        element.type = "application/pdf";
        element.data = "file_pdfjs_test.pdf";
      }
      await loaded;
    };
    await append(content.document.createElement("iframe"));
    await append(content.document.createElement("object"));
  });
  await TestUtils.waitForCondition(
    () => topContext.children.length === 3,
    "Waiting for the browsing contexts of the added frames"
  );
  const [embedContext, iframeContext, objectContext] = topContext.children;

  const openPdf = context => {
    const sandbox = sinon.createSandbox();
    const loadURI = sandbox.stub(context, "loadURI");
    try {
      context.currentWindowGlobal
        .getActor("PdfEmbedFallback")
        .receiveMessage({ name: "PdfEmbedFallback:OpenPdf", data: {} });
      return loadURI.called;
    } finally {
      sandbox.restore();
    }
  };

  is(
    topContext.embedderElementType,
    "browser",
    "A tab is embedded in a browser element"
  );
  ok(
    topContext.embedderWindowGlobal.documentPrincipal.isSystemPrincipal,
    "A tab is embedded in the chrome window, which has the system principal"
  );
  ok(!openPdf(topContext), "A top-level document must not be loaded again");

  is(iframeContext.embedderElementType, "iframe", "The iframe is an iframe");
  ok(!openPdf(iframeContext), "An iframe must not be loaded again");

  is(embedContext.embedderElementType, "embed", "The PDF is in an embed");
  ok(openPdf(embedContext), "The PDF embedded with an embed must be loaded");

  is(objectContext.embedderElementType, "object", "The PDF is in an object");
  ok(openPdf(objectContext), "The PDF embedded with an object must be loaded");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_fallback_hidden_when_embed_is_too_short() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const { linkedBrowser: browser } = tab;

  const fallbackLoaded = BrowserTestUtils.browserLoaded(
    browser,
    /* includeSubFrames = */ true,
    PDF_URL
  );
  BrowserTestUtils.startLoadingURIString(browser, SHORT_EMBED_URL);
  await fallbackLoaded;

  const embedContext = browser.browsingContext.children[0];
  ok(embedContext, "The embed element must have a browsing context");

  await SpecialPowers.spawn(embedContext, [], async () => {
    const container = content.document.getElementById("fallbackContainer");
    is(
      content.getComputedStyle(container).display,
      "none",
      "The fallback must be hidden when its complete UI cannot be shown"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_open_pdf_preserves_referrer() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      const fallbackLoaded = BrowserTestUtils.browserLoaded(
        browser,
        /* includeSubFrames = */ true,
        REFERRER_PDF_URL
      );
      BrowserTestUtils.startLoadingURIString(browser, REFERRER_PAGE_URL);
      await fallbackLoaded;

      const embedContext = browser.browsingContext.children[0];
      ok(embedContext, "The embed element must have a browsing context");

      const downloadList = await Downloads.getList(Downloads.PUBLIC);
      const downloadFinished = promiseDownloadFinished(downloadList);

      await clickOpenButton(embedContext);

      const download = await downloadFinished;
      ok(download.succeeded, "The PDF must have been downloaded successfully");

      // The retry overwrites the referrer recorded by the embed's own load: a
      // retry without referrer would leave an empty one behind.
      const response = await fetch(REFERRER_RESULT_URL);
      is(
        await response.text(),
        REFERRER_PAGE_URL,
        "The retried PDF request must preserve the original referrer"
      );
    }
  );
});

add_task(async function test_open_local_pdf_from_the_fallback_page() {
  // The resource://pdf.js principal cannot load file:// URLs. Privileged code
  // retries the load with the original request's triggering principal.
  const dir = createTemporarySaveDirectory("localpdf");
  const pdfPath = PathUtils.join(dir.path, "test.pdf");
  const pagePath = PathUtils.join(dir.path, "embed.html");
  await IOUtils.writeUTF8(pdfPath, "%PDF-1.7\n");
  await IOUtils.writeUTF8(
    pagePath,
    `<!DOCTYPE html><embed type="application/pdf" src="test.pdf"
      width="600" height="400">`
  );
  const pdfURL = PathUtils.toFileURI(pdfPath);

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const { linkedBrowser: browser } = tab;

  const fallbackLoaded = BrowserTestUtils.browserLoaded(
    browser,
    /* includeSubFrames = */ true,
    pdfURL
  );
  BrowserTestUtils.startLoadingURIString(
    browser,
    PathUtils.toFileURI(pagePath)
  );
  await fallbackLoaded;

  const embedContext = browser.browsingContext.children[0];
  // The setup configures PDFs to save without asking, but Firefox still prompts
  // for a local file to avoid creating a second copy.
  const dialogPromise = BrowserTestUtils.domWindowOpenedAndLoaded();

  info("Clicking on the button to open the local pdf...");
  await clickOpenButton(embedContext);

  const dialogWindow = await dialogPromise;
  is(
    dialogWindow.location.href,
    "chrome://mozapps/content/downloads/unknownContentType.xhtml",
    "The dialog to open the local pdf must be displayed"
  );

  const dialogClosed = BrowserTestUtils.domWindowClosed(dialogWindow);
  dialogWindow.document.querySelector("#unknownContentType").cancelDialog();
  await dialogClosed;

  BrowserTestUtils.removeTab(tab);
  dir.remove(true);
});

add_task(async function test_toplevel_pdf_is_still_downloaded() {
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
    "The pdf must not have been displayed"
  );

  BrowserTestUtils.removeTab(tab);
});
