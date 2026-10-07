/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Copying out of an alert()/prompt() dialog. These are chrome documents, so
// they are exempt from the content analysis check in nsBaseClipboard::SetData
// and have to opt in via ContentAnalysisUtils -- the same way they already do
// for paste.

"use strict";

const { PromptTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromptTestUtils.sys.mjs"
);

let mockCA = makeMockContentAnalysis();

add_setup(async function test_setup() {
  mockCA = await mockContentAnalysisService(mockCA);
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.contentanalysis.interception_point.clipboard_copy.enabled",
        true,
      ],
    ],
  });
});

// Using an external page so the test can check that the URL matches in the
// nsIContentAnalysisRequest.
const PAGE_URL =
  "https://example.com/browser/toolkit/components/contentanalysis/tests/browser/clipboard_paste_prompt.html";
const PROMPT_MESSAGE = "Some message from the page";
const PROMPT_DEFAULT_VALUE = "Some default value";
const PREVIOUS_CLIPBOARD_TEXT = "Previous clipboard contents";
// Must match contentanalysis-clipboard-copy-blocked-replacement in
// toolkit/locales/en-US/toolkit/contentanalysis/contentanalysis.ftl.
const REPLACEMENT_TEXT =
  "Copying this content is restricted by your organization.";

function setClipboardText(clipboardString) {
  const trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(null);
  trans.addDataFlavor("text/plain");
  const str = Cc["@mozilla.org/supports-string;1"].createInstance(
    Ci.nsISupportsString
  );
  str.data = clipboardString;
  trans.setTransferData("text/plain", str);
  Services.clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
}

function getClipboardText() {
  const trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(null);
  trans.addDataFlavor("text/plain");
  let data = {};
  try {
    Services.clipboard.getData(
      trans,
      Ci.nsIClipboard.kGlobalClipboard,
      window.browsingContext.currentWindowContext
    );
    trans.getTransferData("text/plain", data);
  } catch (e) {
    return "";
  }
  return data.value.QueryInterface(Ci.nsISupportsString).data;
}

function waitForClipboardText(expected) {
  return TestUtils.waitForCondition(
    () => getClipboardText() === expected,
    `waiting for clipboard to contain "${expected}"`
  );
}

function assertCopyRequest(request, expectedText) {
  is(request.url.spec, PAGE_URL, "request has correct URL");
  is(
    request.analysisType,
    Ci.nsIContentAnalysisRequest.eDataCopied,
    "request has correct analysisType"
  );
  is(
    request.reason,
    Ci.nsIContentAnalysisRequest.eClipboardCopy,
    "request has correct reason"
  );
  is(
    request.operationTypeForDisplay,
    Ci.nsIContentAnalysisRequest.eCopyClipboard,
    "request has correct operationTypeForDisplay"
  );
  is(request.textContent, expectedText, "request textContent should match");
  ok(request.userActionId.length, "request userActionId should not be empty");
  ok(!!request.requestToken.length, "request requestToken should not be empty");
}

// Opens a dialog on PAGE_URL, async runs function aContentFn in its content process
// (which must generate a dialog with alert()/prompt()/etc), passes the content
// process' dialog to aTestFn for testing, and returns the result of aContentFn.
async function withDialog(aContentFn, aTestFn) {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE_URL);
  let browser = tab.linkedBrowser;
  try {
    let dialogPromise = SpecialPowers.spawn(
      browser,
      [PROMPT_MESSAGE, PROMPT_DEFAULT_VALUE],
      aContentFn
    );

    let prompt = await PromptTestUtils.waitForPrompt(browser, {
      modalType: Services.prompt.MODAL_TYPE_CONTENT,
    });

    try {
      await aTestFn(prompt);
    } finally {
      await PromptTestUtils.handlePrompt(prompt);
    }
    return await dialogPromise;
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
}

function withPrompt(aCallback) {
  return withDialog(
    async (message, defaultValue) => content.prompt(message, defaultValue),
    aCallback
  );
}

// alert() is the case with no text field at all, so the only thing to copy is
// the page-supplied message.
function withAlert(aCallback) {
  return withDialog(async message => content.alert(message), aCallback);
}

// Copying the text the page supplied as prompt()'s default value.

async function testCopyFromPromptTextbox(allowCopy) {
  mockCA.setupForTest(allowCopy);
  setClipboardText(PREVIOUS_CLIPBOARD_TEXT);

  await withPrompt(async prompt => {
    prompt.ui.loginTextbox.focus();
    prompt.ui.loginTextbox.select();
    await EventUtils.synthesizeKey("c", { accelKey: true });

    await waitForClipboardText(
      allowCopy ? PROMPT_DEFAULT_VALUE : REPLACEMENT_TEXT
    );
  });

  is(mockCA.calls.length, 1, "one call to content analysis");
  assertCopyRequest(mockCA.calls[0], PROMPT_DEFAULT_VALUE);
}

add_task(async function testCopyFromPromptTextboxAllow() {
  await testCopyFromPromptTextbox(true);
});

add_task(async function testCopyFromPromptTextboxBlock() {
  await testCopyFromPromptTextbox(false);
});

// Copying the page-supplied message text out of an alert(). There is no text
// field in this case, so this is the only thing there is to copy.

async function testCopyFromAlertMessage(allowCopy) {
  mockCA.setupForTest(allowCopy);
  setClipboardText(PREVIOUS_CLIPBOARD_TEXT);

  await withAlert(async prompt => {
    let infoBody = prompt.ui.infoBody;
    is(
      infoBody.textContent,
      PROMPT_MESSAGE,
      "the dialog is showing the page's message"
    );
    let selection = infoBody.ownerDocument.getSelection();
    selection.removeAllRanges();
    selection.selectAllChildren(infoBody);

    await EventUtils.synthesizeKey(
      "c",
      { accelKey: true },
      infoBody.ownerGlobal
    );

    await waitForClipboardText(allowCopy ? PROMPT_MESSAGE : REPLACEMENT_TEXT);
  });

  is(mockCA.calls.length, 1, "one call to content analysis");
  assertCopyRequest(mockCA.calls[0], PROMPT_MESSAGE);
}

add_task(async function testCopyFromAlertMessageAllow() {
  await testCopyFromAlertMessage(true);
});

add_task(async function testCopyFromAlertMessageBlock() {
  await testCopyFromAlertMessage(false);
});

// The copy event is dispatched at the element holding the start of the
// selection, so selecting from the dialog's title through its message must not
// be a way to slip the message past the check.

add_task(async function testCopySpanningTitleAndMessageIsAnalyzed() {
  mockCA.setupForTest(/* shouldAllowRequest */ false);
  setClipboardText(PREVIOUS_CLIPBOARD_TEXT);

  await withAlert(async prompt => {
    let doc = prompt.ui.infoBody.ownerDocument;
    let selection = doc.getSelection();
    selection.removeAllRanges();
    let range = doc.createRange();
    range.setStartBefore(prompt.ui.infoTitle);
    range.setEndAfter(prompt.ui.infoBody);
    selection.addRange(range);
    ok(
      selection.toString().includes(PROMPT_MESSAGE),
      `selection spans the message, got "${selection.toString()}"`
    );

    await EventUtils.synthesizeKey("c", { accelKey: true }, doc.defaultView);

    await waitForClipboardText(REPLACEMENT_TEXT);
  });

  is(mockCA.calls.length, 1, "one call to content analysis");
  ok(
    mockCA.calls[0].textContent.includes(PROMPT_MESSAGE),
    `the analyzed text includes the message, got "${mockCA.calls[0].textContent}"`
  );
});

// Like the content-process path, this one knows the verdict before deciding
// whether to delete, so a blocked cut leaves the text alone.

add_task(async function testBlockedCutFromPromptTextboxKeepsText() {
  mockCA.setupForTest(/* shouldAllowRequest */ false);
  setClipboardText(PREVIOUS_CLIPBOARD_TEXT);

  let result = await withPrompt(async prompt => {
    prompt.ui.loginTextbox.focus();
    prompt.ui.loginTextbox.select();
    await EventUtils.synthesizeKey("x", { accelKey: true });

    await waitForClipboardText(REPLACEMENT_TEXT);
    is(
      prompt.ui.loginTextbox.value,
      PROMPT_DEFAULT_VALUE,
      "a blocked cut leaves the text field alone"
    );
  });

  is(result, PROMPT_DEFAULT_VALUE, "prompt still returns its original value");
  is(mockCA.calls.length, 1, "one call to content analysis");
  assertCopyRequest(mockCA.calls[0], PROMPT_DEFAULT_VALUE);
});

add_task(async function testAllowedCutFromPromptTextboxRemovesText() {
  mockCA.setupForTest(/* shouldAllowRequest */ true);
  setClipboardText(PREVIOUS_CLIPBOARD_TEXT);

  let result = await withPrompt(async prompt => {
    prompt.ui.loginTextbox.focus();
    prompt.ui.loginTextbox.select();
    await EventUtils.synthesizeKey("x", { accelKey: true });

    await waitForClipboardText(PROMPT_DEFAULT_VALUE);
    await TestUtils.waitForCondition(
      () => prompt.ui.loginTextbox.value === "",
      "an allowed cut removes the text"
    );
  });

  is(result, "", "prompt returns the emptied value");
  is(mockCA.calls.length, 1, "one call to content analysis");
});

add_task(async function testCopyFromPromptWithPrefOff() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.contentanalysis.interception_point.clipboard_copy.enabled",
        false,
      ],
    ],
  });
  mockCA.setupForTest(/* shouldAllowRequest */ false);
  setClipboardText(PREVIOUS_CLIPBOARD_TEXT);

  await withPrompt(async prompt => {
    prompt.ui.loginTextbox.focus();
    prompt.ui.loginTextbox.select();
    await EventUtils.synthesizeKey("c", { accelKey: true });

    // The copy is allowed through without consulting the agent.
    await waitForClipboardText(PROMPT_DEFAULT_VALUE);
  });

  is(
    mockCA.calls.length,
    0,
    "no calls to content analysis when the interception point is off"
  );
  await SpecialPowers.popPrefEnv();
});
