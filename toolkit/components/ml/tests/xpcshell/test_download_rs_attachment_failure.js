/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests the failure mode of MLEngineParent.downloadRSAttachment when the
 * Remote Settings attachments base URL cannot be resolved.
 *
 * Previously, downloadRSAttachment caught any failure from
 * Utils.baseAttachmentsURL() and fell back to a hardcoded
 * "firefox-settings-attachments.cdn.mozilla.net" URL. That swallowed every
 * error mode indiscriminately and ignored the indirection's intended
 * QA/enterprise use case. Bug 2043699 removed the fallback so the error
 * propagates to the caller instead.
 */

const { MLEngineParent } = ChromeUtils.importESModule(
  "resource://gre/actors/MLEngineParent.sys.mjs"
);
const { OPFS } = ChromeUtils.importESModule(
  "chrome://global/content/ml/OPFS.sys.mjs"
);

const PREF_SERVER = "services.settings.server";
const PREF_ATTACHMENTS_URL = "services.settings.base_attachments_url";

// Port 1 is reserved and cannot be bound, so any connection attempt is
// refused immediately. This deterministically triggers a NetworkError from
// Utils.fetch without depending on a real Remote Settings server.
const UNREACHABLE_SERVER = "http://localhost:1/v1";

function makeWasmRecord() {
  return {
    version: "1.0",
    attachment: {
      location: "main-workspace/ml-onnx-runtime/test.wasm",
      filename: "test.wasm",
      hash: "deadbeef",
      size: 1,
    },
  };
}

function stubOPFSDownload() {
  const calls = [];
  const original = OPFS.download;
  OPFS.download = async args => {
    calls.push(args);
    throw new Error("OPFS_DOWNLOAD_STUB");
  };
  registerCleanupFunction(() => {
    OPFS.download = original;
  });
  return calls;
}

add_task(async function test_throws_when_base_url_unreachable() {
  Services.prefs.setStringPref(PREF_SERVER, UNREACHABLE_SERVER);
  Services.prefs.clearUserPref(PREF_ATTACHMENTS_URL);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(PREF_SERVER);
    Services.prefs.clearUserPref(PREF_ATTACHMENTS_URL);
  });

  const opfsCalls = stubOPFSDownload();

  await Assert.rejects(
    MLEngineParent.downloadRSAttachment({
      wasmRecord: makeWasmRecord(),
      localRoot: "test-backend",
    }),
    /NetworkError/,
    "downloadRSAttachment must propagate the NetworkError from baseAttachmentsURL()"
  );

  Assert.equal(
    opfsCalls.length,
    0,
    "OPFS.download must not be invoked when the base URL cannot be resolved"
  );
});
