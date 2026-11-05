/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file tests the download manager backend

do_get_profile();
Services.fog.initializeFOG();

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var {
  HTTP_400,
  HTTP_401,
  HTTP_402,
  HTTP_403,
  HTTP_404,
  HTTP_405,
  HTTP_406,
  HTTP_407,
  HTTP_408,
  HTTP_409,
  HTTP_410,
  HTTP_411,
  HTTP_412,
  HTTP_413,
  HTTP_414,
  HTTP_415,
  HTTP_417,
  HTTP_500,
  HTTP_501,
  HTTP_502,
  HTTP_503,
  HTTP_504,
  HTTP_505,
  HttpError,
  HttpServer,
} = ChromeUtils.importESModule("resource://testing-common/httpd.sys.mjs");

// List types, this should sync with |enum LIST_TYPES| defined in PendingLookup.
var ALLOW_LIST = 0;
var BLOCK_LIST = 1;
var NO_LIST = 2;

// Allow or block reason, this should sync with |enum Reason| in ApplicationReputation.cpp
var NotSet = "NotSet";
var LocalWhitelist = "LocalWhitelist";
var LocalBlocklist = "LocalBlocklist";
var NonBinaryFile = "NonBinaryFile";
var VerdictSafe = "VerdictSafe";
var VerdictUnknown = "VerdictUnknown";
var VerdictDangerous = "VerdictDangerous";
var VerdictDangerousHost = "VerdictDangerousHost";
var VerdictUnwanted = "VerdictUnwanted";
var VerdictUncommon = "VerdictUncommon";
var VerdictUnrecognized = "VerdictUnrecognized";
var DangerousPrefOff = "DangerousPrefOff";
var DangerousHostPrefOff = "DangerousHostPrefOff";
var UnwantedPrefOff = "UnwantedPrefOff";
var UncommonPrefOff = "UncommonPrefOff";
var NetworkError = "NetworkError";
var RemoteLookupDisabled = "RemoteLookupDisabled";
var InternalError = "InternalError";
var DPDisabled = "DPDisabled";
const BlockReasons = [
  NotSet,
  LocalWhitelist,
  LocalBlocklist,
  NonBinaryFile,
  VerdictSafe,
  VerdictUnknown,
  VerdictDangerous,
  VerdictDangerousHost,
  VerdictUnwanted,
  VerdictUncommon,
  VerdictUnrecognized,
  DangerousPrefOff,
  DangerousHostPrefOff,
  UnwantedPrefOff,
  UncommonPrefOff,
  NetworkError,
  RemoteLookupDisabled,
  InternalError,
  DPDisabled,
];

function createURI(aObj) {
  return aObj instanceof Ci.nsIFile
    ? Services.io.newFileURI(aObj)
    : Services.io.newURI(aObj);
}

function add_telemetry_count(telemetry, label, count) {
  let val = telemetry[label] || 0;
  telemetry[label] = val + count;
}

function check_telemetry(aExpectedTelemetry) {
  // SHOULD_BLOCK = true
  let shouldBlock = Glean.applicationReputation.shouldBlock.testGetValue();
  let expectedShouldBlock = aExpectedTelemetry.shouldBlock;
  Assert.equal(shouldBlock?.true || 0, expectedShouldBlock);

  let local = Glean.applicationReputation.local.testGetValue();

  let expectedLocal = aExpectedTelemetry.local;
  Assert.equal(
    local?.values?.[ALLOW_LIST] || 0,
    expectedLocal[ALLOW_LIST] || 0,
    "Allow list.values don't match"
  );
  Assert.equal(
    local?.values?.[BLOCK_LIST] || 0,
    expectedLocal[BLOCK_LIST] || 0,
    "Block list.values don't match"
  );
  Assert.equal(
    local?.values?.[NO_LIST] || 0,
    expectedLocal[NO_LIST] || 0,
    "No list.values don't match"
  );

  let reason = Glean.applicationReputation.reason.testGetValue();
  let expectedReason = aExpectedTelemetry.reason;
  for (let blockReason of BlockReasons) {
    if ((reason?.[blockReason] || 0) != (expectedReason[blockReason] || 0)) {
      Assert.ok(
        false,
        "Allow or Block reason(" + blockReason + ") doesn't match"
      );
    }
  }
}

function get_telemetry_snapshot() {
  let local = Glean.applicationReputation.local.testGetValue();
  let shouldBlock = Glean.applicationReputation.shouldBlock.testGetValue();
  let reason = Glean.applicationReputation.reason.testGetValue();
  return {
    shouldBlock: shouldBlock?.true || 0,
    local: local?.values || {},
    reason: reason || {},
  };
}
