/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Integration test for the C++ WasmModuleBackend, the ContentAnalysis backend
// selected by browser.contentanalysis.use_wasm_backend. It serializes a request
// to the content_analysis SDK protobuf, resolves the request's content,
// and hands both to the in-process wasm DLP module via nsIContentAnalysisWasmRunner.
//
// The wasm module is bundled in a WebExtension and read through the real
// production path, exactly as test_wasm_runner.js does. This test depends on the
// example rule set hard-coded in WasmModuleBackend::BuildExampleRules (block
// uploads to cloud-storage domains, warn on AI domains).
// TODO - refactor the rules code so we can just specify them from the test here

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);

const REQUIRE_SIGNATURE_PREF =
  "browser.contentanalysis.wasm_module_extension_require_signature";

// Prefs must be set before the ContentAnalysis service is first instantiated,
// since the backend is chosen once in its constructor.
Services.prefs.setBoolPref("browser.contentanalysis.use_wasm_backend", true);
Services.prefs.setBoolPref("browser.contentanalysis.enabled", true);
Services.prefs.setBoolPref(REQUIRE_SIGNATURE_PREF, false);
Services.prefs.setBoolPref(
  "browser.contentanalysis.interception_point.file_upload.enabled",
  true
);
Services.prefs.setBoolPref(
  "browser.contentanalysis.interception_point.clipboard.enabled",
  true
);
Services.prefs.setBoolPref(
  "browser.contentanalysis.bypass_for_same_tab_operations",
  false
);
Services.prefs.setStringPref(
  "browser.contentanalysis.allow_url_regex_list",
  ""
);
Services.prefs.setStringPref("browser.contentanalysis.deny_url_regex_list", "");

const contentAnalysis = Cc["@mozilla.org/contentanalysis;1"].getService(
  Ci.nsIContentAnalysis
);

// Build a plain-object nsIContentAnalysisRequest. ContentAnalysis fills in the
// request token, user action ID, and request count itself, so we leave those
// empty.
function makeRequest({
  analysisType,
  reason,
  operationTypeForDisplay,
  urlSpec,
  filePath = "",
  textContent = "",
  fileNameForDisplay = "",
  printData = [],
  printerName = "",
}) {
  return {
    analysisType,
    reason,
    operationTypeForDisplay,
    fileNameForDisplay,
    url: Services.io.newURI(urlSpec),
    filePath,
    textContent,
    resources: [],
    email: "",
    sha256Digest: "",
    requestToken: "",
    userActionId: "",
    userActionRequestsCount: 0,
    timeoutMultiplier: 0,
    getPrintData: () => printData,
    printerName,
    dataTransfer: null,
    transferable: null,
    windowGlobalParent: null,
    sourceWindowGlobal: null,
    testOnlyIgnoreCanceledAndAlwaysSubmitToAgent: false,
  };
}

// Write a temp file with the given contents and return its absolute path,
// registering cleanup.
async function makeTempFile(name, contents) {
  const file = do_get_tempdir();
  file.append(name);
  await IOUtils.writeUTF8(file.path, contents);
  registerCleanupFunction(async () => {
    await IOUtils.remove(file.path, { ignoreAbsent: true });
  });
  return file.path;
}

add_setup(async function () {
  contentAnalysis.testOnlySetCACmdLineArg(true);
  Assert.ok(
    contentAnalysis.isActive,
    "content analysis is active with the wasm backend"
  );
  registerCleanupFunction(() => {
    contentAnalysis.testOnlySetCACmdLineArg(false);
  });
});

// A file uploaded to a cloud-storage domain must be blocked. This exercises
// reading the file's contents off the main thread before handing them to the
// module.
add_task(async function test_file_upload_to_blocked_domain_is_blocked() {
  const extension = await installModuleExtension();
  const filePath = await makeTempFile(
    "dlp_blocked_upload.txt",
    "contents of a file being uploaded to cloud storage"
  );

  const result = await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eFileAttached,
        reason: Ci.nsIContentAnalysisRequest.eFilePickerDialog,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eUpload,
        fileNameForDisplay: "dlp_blocked_upload.txt",
        urlSpec: "https://drive.google.com/upload",
        filePath,
      }),
    ],
    true
  );

  Assert.ok(
    !result.shouldAllowContent,
    "file upload to drive.google.com is blocked"
  );

  await extension.unload();
});

// The same file uploaded to an unlisted domain is allowed. This still reads the
// file off the main thread and round-trips it through the module.
add_task(async function test_file_upload_to_unlisted_domain_is_allowed() {
  const extension = await installModuleExtension();
  const filePath = await makeTempFile(
    "dlp_allowed_upload.txt",
    "contents of a file being uploaded to an ordinary site"
  );

  const result = await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eFileAttached,
        reason: Ci.nsIContentAnalysisRequest.eFilePickerDialog,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eUpload,
        fileNameForDisplay: "dlp_allowed_upload.txt",
        urlSpec: "https://example.com/upload",
        filePath,
      }),
    ],
    true
  );

  Assert.ok(result.shouldAllowContent, "file upload to example.com is allowed");

  await extension.unload();
});

// An empty file must still round-trip cleanly (the off-main-thread read handles
// a zero-length file by passing empty content) and be allowed on an unlisted
// domain.
add_task(async function test_empty_file_upload_is_allowed() {
  const extension = await installModuleExtension();
  const filePath = await makeTempFile("dlp_empty_upload.txt", "");

  const result = await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eFileAttached,
        reason: Ci.nsIContentAnalysisRequest.eFilePickerDialog,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eUpload,
        fileNameForDisplay: "dlp_empty_upload.txt",
        urlSpec: "https://example.com/upload",
        filePath,
      }),
    ],
    true
  );

  Assert.ok(result.shouldAllowContent, "empty file upload is allowed");

  await extension.unload();
});

// Text (bulk data entry) requests take the synchronous, no-file path in the
// backend; verify it still works alongside the file path.
add_task(async function test_text_paste_to_unlisted_domain_is_allowed() {
  const extension = await installModuleExtension();

  const result = await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eBulkDataEntry,
        reason: Ci.nsIContentAnalysisRequest.eClipboardPaste,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eClipboard,
        urlSpec: "https://example.com/",
        textContent: "some pasted text",
      }),
    ],
    true
  );

  Assert.ok(result.shouldAllowContent, "text paste to example.com is allowed");

  await extension.unload();
});

// Pasted text is handed to the module as content bytes, separately from the
// serialized request (see WasmModuleBackend::Analyze); the module's
// block-confidential-content rule (the only example rule keyed on content
// rather than domain) only triggers if those bytes actually reach it. The
// destination domain here isn't covered by any domain-based rule, isolating
// the content path from the domain path.
add_task(async function test_text_paste_with_confidential_marker_is_blocked() {
  const extension = await installModuleExtension();

  const result = await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eBulkDataEntry,
        reason: Ci.nsIContentAnalysisRequest.eClipboardPaste,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eClipboard,
        urlSpec: "https://example.com/",
        textContent: "top secret plan: CONFIDENTIAL launch details",
      }),
    ],
    true
  );

  Assert.ok(
    !result.shouldAllowContent,
    "text paste containing a CONFIDENTIAL marker is blocked"
  );

  await extension.unload();
});

// Same content-pattern rule, but content resolved from a file instead of
// inline text_content, to confirm the file-content path also reaches the
// module's pattern matching.
add_task(async function test_file_with_confidential_marker_is_blocked() {
  const extension = await installModuleExtension();
  const filePath = await makeTempFile(
    "dlp_confidential.txt",
    "top secret plan: CONFIDENTIAL launch details"
  );

  const result = await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eFileAttached,
        reason: Ci.nsIContentAnalysisRequest.eFilePickerDialog,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eUpload,
        fileNameForDisplay: "dlp_confidential.txt",
        urlSpec: "https://example.com/upload",
        filePath,
      }),
    ],
    true
  );

  Assert.ok(
    !result.shouldAllowContent,
    "file upload containing a CONFIDENTIAL marker is blocked"
  );

  await extension.unload();
});

// Print requests fetch their content via the cross-platform GetPrintData,
// unlike ExternalAgentBackend which (on the request-conversion path shared
// with the WASM backend) only knows how to ship print data via a Windows
// shared-memory handle. Verify the WASM backend correctly hands print data to
// the module on every platform.
add_task(async function test_print_to_unlisted_domain_is_allowed() {
  const extension = await installModuleExtension();

  const before = await contentAnalysis.getDiagnosticInfo();

  const printData = Array.from(
    new TextEncoder().encode("%PDF-1.4 fake print content for wasm test")
  );
  const result = await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.ePrint,
        reason: Ci.nsIContentAnalysisRequest.eSystemDialogPrint,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eOperationPrint,
        urlSpec: "https://example.com/",
        printData,
        printerName: "Test Printer",
      }),
    ],
    true
  );

  Assert.ok(result.shouldAllowContent, "print to example.com is allowed");

  const after = await contentAnalysis.getDiagnosticInfo();
  Assert.equal(
    after.requestCount,
    before.requestCount + 1,
    "the print request reached the module instead of failing before " +
      "it got there"
  );
  Assert.ok(
    after.connectedToAgent,
    "connected after analyzing a print request"
  );

  await extension.unload();
});

// GetDiagnosticInfo should track the number of analyze() calls and report
// that the module is connected after it runs successfully.
add_task(async function test_diagnostic_info_tracks_successful_analysis() {
  const extension = await installModuleExtension();

  const before = await contentAnalysis.getDiagnosticInfo();

  await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eBulkDataEntry,
        reason: Ci.nsIContentAnalysisRequest.eClipboardPaste,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eClipboard,
        urlSpec: "https://example.com/",
        textContent: "some more pasted text",
      }),
    ],
    true
  );

  const after = await contentAnalysis.getDiagnosticInfo();
  Assert.equal(
    after.requestCount,
    before.requestCount + 1,
    "requestCount increases by one per analyze() call"
  );
  Assert.ok(after.connectedToAgent, "connected after a successful analysis");
  Assert.ok(
    !after.failedSignatureVerification,
    "no signature failure after a successful analysis"
  );

  await extension.unload();
});

// A module extension that fails signature verification should be reflected in
// GetDiagnosticInfo, mirroring how ExternalAgentBackend reports a mismatched
// agent signature.
add_task(async function test_diagnostic_info_on_signature_failure() {
  Services.prefs.setBoolPref(REQUIRE_SIGNATURE_PREF, true);
  const extension = await installModuleExtension();
  extension.extension.addonData.signedState = AddonManager.SIGNEDSTATE_MISSING;

  await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eBulkDataEntry,
        reason: Ci.nsIContentAnalysisRequest.eClipboardPaste,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eClipboard,
        urlSpec: "https://example.com/",
        textContent: "text that can't be analyzed",
      }),
    ],
    true
  );

  const info = await contentAnalysis.getDiagnosticInfo();
  Assert.ok(
    !info.connectedToAgent,
    "not connected after a signature verification failure"
  );
  Assert.ok(
    info.failedSignatureVerification,
    "failedSignatureVerification is set after a signature verification " +
      "failure"
  );

  Services.prefs.setBoolPref(REQUIRE_SIGNATURE_PREF, false);
  await extension.unload();
});

add_task(async function test_succeeds_with_signature_check_if_signed() {
  Services.prefs.setBoolPref(REQUIRE_SIGNATURE_PREF, true);
  const extension = await installModuleExtension();
  extension.extension.addonData.signedState = AddonManager.SIGNEDSTATE_SYSTEM;

  await contentAnalysis.analyzeContentRequests(
    [
      makeRequest({
        analysisType: Ci.nsIContentAnalysisRequest.eBulkDataEntry,
        reason: Ci.nsIContentAnalysisRequest.eClipboardPaste,
        operationTypeForDisplay: Ci.nsIContentAnalysisRequest.eClipboard,
        urlSpec: "https://example.com/",
        textContent: "text that can't be analyzed",
      }),
    ],
    true
  );

  const info = await contentAnalysis.getDiagnosticInfo();
  Assert.ok(info.connectedToAgent, "connected after using a signed extension");
  Assert.ok(
    !info.failedSignatureVerification,
    "failedSignatureVerification is not set after using a signed extension"
  );

  Services.prefs.setBoolPref(REQUIRE_SIGNATURE_PREF, false);
  await extension.unload();
});
