/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Bug 1698140: when a PDF is handed to nsIURILoader by something that is not a
// docshell load - Thunderbird opening a PDF attachment from the compose window -
// the channel has no targetBrowsingContext. PDF.js must not claim such a
// channel, because it cannot render without one and the type it rewrites the
// channel to breaks the external helper app fallback. The load has to reach the
// helper app instead, which with "always ask" means the unknownContentType
// dialog.
//
// No user gesture in Firefox reaches this branch, so the test drives the load the
// way that consumer does. The coverage lives here because the code it guards does.

const UNKNOWN_CONTENT_TYPE_URL =
  "chrome://mozapps/content/downloads/unknownContentType.xhtml";

// Mirrors nsAttachmentOpener in comm-central's MsgComposeCommands.js: the
// listener offers a window for any UI, but the channel it is given still has no
// browsing context of its own.
const gAttachmentOpener = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIURIContentListener",
    "nsIInterfaceRequestor",
  ]),
  doContent: () => false,
  isPreferred: () => false,
  canHandleContent: () => false,
  getInterface(iid) {
    if (iid.equals(Ci.nsIDOMWindow)) {
      return window;
    }
    if (iid.equals(Ci.nsIDocShell)) {
      return window.docShell;
    }
    return this.QueryInterface(iid);
  },
  loadCookie: null,
  parentContentListener: null,
};

add_task(async function test_pdf_without_browsing_context() {
  const oldAction = changeMimeHandler(Ci.nsIHandlerInfo.useSystemDefault, true);
  registerCleanupFunction(() => changeMimeHandler(oldAction[0], oldAction[1]));

  const pdfFile = getChromeDir(getResolvedURI(gTestPath));
  pdfFile.append("file_pdfjs_test.pdf");
  const pdfURI = Services.io.newFileURI(pdfFile);

  const channel = Services.io.newChannelFromURI(
    pdfURI,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  is(
    channel.loadInfo.targetBrowsingContext,
    null,
    "The channel has no browsing context."
  );

  const dialogOpened = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win => win.document.documentURI == UNKNOWN_CONTENT_TYPE_URL
  ).then(dialog => ({ dialog }));

  // Watch for the buggy outcome - PDF.js pulling the file into a tab - with a
  // listener we remove unconditionally below. BrowserTestUtils.waitForNewTab
  // cannot be cancelled, so in the (expected) dialog case its listeners would
  // outlive the task and keep the dialog window alive, which the shutdown leak
  // checker reports as a leaked window.
  let onTabOpen;
  const tabOpened = new Promise(resolve => {
    onTabOpen = event => resolve({ tab: event.target });
    gBrowser.tabContainer.addEventListener("TabOpen", onTabOpen);
  });

  Cc["@mozilla.org/uriloader;1"]
    .getService(Ci.nsIURILoader)
    .openURI(channel, true, gAttachmentOpener);

  const outcome = await Promise.race([dialogOpened, tabOpened]);
  gBrowser.tabContainer.removeEventListener("TabOpen", onTabOpen);

  ok(
    outcome.dialog,
    "The PDF reached the external helper app rather than being opened in a tab by PDF.js"
  );

  if (outcome.tab) {
    BrowserTestUtils.removeTab(outcome.tab);
  } else {
    const closed = BrowserTestUtils.domWindowClosed(outcome.dialog);
    outcome.dialog.close();
    await closed;
  }
});
