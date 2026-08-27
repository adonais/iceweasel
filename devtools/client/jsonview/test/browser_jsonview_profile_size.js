/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_JSON_URL = URL_ROOT + "simple_json.json";
const PROFILER_URL_PREF = "devtools.performance.recording.ui-base-url";
const TEST_PROFILER_URL = "http://127.0.0.1:8888";

add_setup(async function () {
  info("Setting profiler URL to localhost for tests");
  await SpecialPowers.pushPrefEnv({
    set: [
      [PROFILER_URL_PREF, TEST_PROFILER_URL],
      ["devtools.jsonview.size-profiler.enabled", true],
    ],
  });
});

/**
 * Sums the sample weights attributed to each leaf frame of a profile, keyed by
 * frame name. Lets a test assert where the bytes actually went, rather than
 * only which frames happen to exist.
 *
 * @param {object} profile
 *        A profile as returned by createSizeProfile.
 * @returns {Map<string, number>}
 *        Frame name to the number of bytes attributed to it.
 */
function bytesByLeafFrame(profile) {
  const thread = profile.threads[0];
  const bytes = new Map();
  for (let i = 0; i < thread.samples.length; i++) {
    const stackIndex = thread.samples.stack[i];
    const frameIndex = thread.stackTable.frame[stackIndex];
    const funcIndex = thread.frameTable.func[frameIndex];
    const name = profile.shared.stringArray[thread.funcTable.name[funcIndex]];
    bytes.set(name, (bytes.get(name) || 0) + thread.samples.weight[i]);
  }
  return bytes;
}

/**
 * Sums the bytes accounted for by every sample of a profile.
 *
 * @param {object} profile
 *        A profile as returned by createSizeProfile.
 * @returns {number}
 *        The total number of bytes attributed to samples.
 */
function totalProfiledBytes(profile) {
  return profile.threads[0].samples.weight.reduce(
    (sum, weight) => sum + weight,
    0
  );
}

function utf8Length(str) {
  return new TextEncoder().encode(str).length;
}

add_task(async function testProfileSizeButtonExists() {
  info("Test that the Profile Size button exists in the tab bar");

  await addJsonViewTab(TEST_JSON_URL);

  const buttonExists = await SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [],
    () => {
      const button = content.document.querySelector(".profiler-icon-button");
      return !!button;
    }
  );

  ok(buttonExists, "Profile Size button should exist in the tab bar");
});

add_task(async function testProfileSizePostMessage() {
  info("Test that profile is sent via postMessage with correct handshake");

  await addJsonViewTab(TEST_JSON_URL);

  const browser = gBrowser.selectedBrowser;

  // Set up the mock for window.open before clicking
  await SpecialPowers.spawn(browser, [TEST_PROFILER_URL], expectedUrl => {
    const win = Cu.waiveXrays(content);

    // Create test results object
    win.testResults = {
      windowUrl: null,
      profile: null,
      receivedReadyRequest: false,
      messageOrigin: null,
      resolved: false,
    };

    // Mock window.open
    win.open = Cu.exportFunction(function (url) {
      win.testResults.windowUrl = url;

      // Create mock window object with postMessage
      const mockWindow = {
        postMessage(message, origin) {
          if (message.name === "ready:request") {
            win.testResults.receivedReadyRequest = true;
            win.testResults.messageOrigin = origin;
            // Simulate profiler responding with ready:response
            const event = new win.MessageEvent(
              "message",
              Cu.cloneInto(
                {
                  origin: expectedUrl,
                  data: { name: "ready:response" },
                },
                win
              )
            );
            win.dispatchEvent(event);
          } else if (message.name === "inject-profile") {
            win.testResults.profile = message.profile;
            win.testResults.resolved = true;
          }
        },
        close() {},
      };

      return Cu.cloneInto(mockWindow, win, { cloneFunctions: true });
    }, win);
  });

  // Click the button from within the content process
  await SpecialPowers.spawn(browser, [], () => {
    const button = content.document.querySelector(".profiler-icon-button");
    button.click();
  });

  // Wait for the test to complete
  await TestUtils.waitForCondition(
    async () => {
      return SpecialPowers.spawn(browser, [], () => {
        return Cu.waiveXrays(content).testResults?.resolved;
      });
    },
    "Waiting for profile to be sent",
    100,
    100
  );

  // Get the results
  const result = await SpecialPowers.spawn(browser, [], () => {
    return Cu.waiveXrays(content).testResults;
  });

  ok(result.windowUrl, "window.open should have been called");
  ok(
    result.windowUrl.includes("/from-post-message/"),
    `URL should contain /from-post-message/, got: ${result.windowUrl}`
  );
  ok(
    result.windowUrl.includes(TEST_PROFILER_URL),
    `URL should use preference URL ${TEST_PROFILER_URL}, got: ${result.windowUrl}`
  );
  ok(result.receivedReadyRequest, "Should send ready:request");
  is(
    result.messageOrigin,
    TEST_PROFILER_URL,
    "postMessage should use correct origin"
  );
  ok(result.profile, "Should capture profile");
  ok(result.profile.meta, "Profile should have meta");
  ok(result.profile.threads, "Profile should have threads");
});

add_task(async function testProfileCreation() {
  info("Test that a valid profile is created");

  const { createSizeProfile } = ChromeUtils.importESModule(
    "resource://devtools/client/jsonview/json-size-profiler.mjs"
  );

  const testJson = '{"name": "test", "value": 123}';
  const profile = createSizeProfile(testJson);

  ok(profile.meta, "Profile should have meta object");
  ok(Array.isArray(profile.threads), "Profile should have threads array");
  ok(
    Array.isArray(profile.meta.markerSchema),
    "Profile meta should have markerSchema array"
  );
  ok(
    Array.isArray(profile.meta.categories),
    "Profile meta should have categories array"
  );
  Assert.greater(
    profile.threads[0].samples.length,
    0,
    "Profile should have samples"
  );

  // Validate total size of samples
  const totalSize = totalProfiledBytes(profile);
  is(
    totalSize,
    testJson.length,
    "Total sample size should match JSON string length"
  );
});

add_task(async function testProfileCreationWithJsonl() {
  info("Test that every record of a JSON Lines document is profiled");

  const { createSizeProfile } = ChromeUtils.importESModule(
    "resource://devtools/client/jsonview/json-size-profiler.mjs"
  );

  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(JSON.stringify({ id: i, name: `name${i}`, tags: ["a", "b"] }));
  }
  const testJsonl = lines.join("\n");
  const profile = createSizeProfile(testJsonl, "test.jsonl", true);

  const totalSize = totalProfiledBytes(profile);
  is(
    totalSize,
    utf8Length(testJsonl),
    "Every byte of the document should be accounted for, not just the first line"
  );

  // Records share the top-level path, so a property's bytes are summed across
  // every record. Each record spends 5 bytes on the "id" key ("id" plus quotes
  // and colon), so all 5 records together must account for 25.
  const bytes = bytesByLeafFrame(profile);
  is(
    bytes.get("json.id (property key)"),
    25,
    "A property's bytes should be aggregated across all 5 records"
  );
  is(
    bytes.get("json (separator)"),
    4,
    "The 4 newlines separating the records should be counted as separators"
  );
});

add_task(async function testProfileCreationWithInvalidJsonlLine() {
  info("Test that an unparseable JSON Lines record does not abort the profile");

  const { createSizeProfile } = ChromeUtils.importESModule(
    "resource://devtools/client/jsonview/json-size-profiler.mjs"
  );

  const invalidLine = "{not json";
  const testJsonl = ['{"a": 1}', invalidLine, '{"b": 2}'].join("\n");
  const profile = createSizeProfile(testJsonl, "test.jsonl", true);

  const totalSize = totalProfiledBytes(profile);
  is(
    totalSize,
    utf8Length(testJsonl),
    "Bytes of an invalid line should still be accounted for"
  );

  const bytes = bytesByLeafFrame(profile);
  is(
    bytes.get("json (parse error)"),
    invalidLine.length,
    "The whole invalid line should be attributed to the error frame"
  );
  is(
    bytes.get("json.b (number)"),
    1,
    "Records after an invalid line should still be parsed"
  );
});

add_task(async function testProfileCreationWithTruncatedJsonlLine() {
  info("Test that a truncated record does not consume the records after it");

  const { createSizeProfile } = ChromeUtils.importESModule(
    "resource://devtools/client/jsonview/json-size-profiler.mjs"
  );

  // An unterminated object would keep consuming past the newline if records
  // were not bounded to their own line, swallowing the valid record below it.
  const truncated = '{"id": 0, "name": "trunc"';
  const testJsonl = [truncated, '{"id": 9}'].join("\n");
  const profile = createSizeProfile(testJsonl, "test.jsonl", true);

  const totalSize = totalProfiledBytes(profile);
  is(totalSize, utf8Length(testJsonl), "Every byte should be accounted for");

  const bytes = bytesByLeafFrame(profile);
  is(
    bytes.get("json (parse error)"),
    truncated.length,
    "The whole truncated line should be attributed to the error frame"
  );
  is(
    bytes.get("json.id (property key)"),
    6,
    "The record after the truncated one should still be parsed"
  );
  ok(
    !bytes.has("json.name (string)"),
    "The truncated record should not be partially attributed to its fields"
  );
});

add_task(async function testProfileCreationWithJsonlSeparators() {
  info("Test blank lines, CRLF endings and a trailing newline in JSON Lines");

  const { createSizeProfile } = ChromeUtils.importESModule(
    "resource://devtools/client/jsonview/json-size-profiler.mjs"
  );

  for (const testJsonl of [
    '{"a": 1}\r\n{"a": 2}',
    '{"a": 1}\n\n\n{"a": 2}',
    '{"a": 1}\n{"a": 2}\n',
    '\n\n{"a": 1}',
    "",
    "\n \n",
  ]) {
    const profile = createSizeProfile(testJsonl, "test.jsonl", true);
    const totalSize = totalProfiledBytes(profile);
    is(
      totalSize,
      utf8Length(testJsonl),
      `Every byte should be accounted for in ${JSON.stringify(testJsonl)}`
    );
  }
});

add_task(async function testProfileCreationWithJsonlUtf8() {
  info("Test that JSON Lines records with multi-byte characters are counted");

  const { createSizeProfile } = ChromeUtils.importESModule(
    "resource://devtools/client/jsonview/json-size-profiler.mjs"
  );

  const testJsonl = [
    JSON.stringify({ n: "café" }),
    JSON.stringify({ n: "中文" }),
    JSON.stringify({ n: "🔥" }),
  ].join("\n");
  const profile = createSizeProfile(testJsonl, "test.jsonl", true);

  const totalSize = totalProfiledBytes(profile);
  const expectedByteLength = utf8Length(testJsonl);
  is(
    totalSize,
    expectedByteLength,
    `Total should match UTF-8 byte length (${expectedByteLength} bytes, not ${testJsonl.length} characters)`
  );
  Assert.greater(
    expectedByteLength,
    testJsonl.length,
    "This fixture should contain multi-byte characters"
  );
});

add_task(async function testProfileCreationWithUtf8() {
  info("Test that profile correctly handles UTF-8 multi-byte characters");

  const { createSizeProfile } = ChromeUtils.importESModule(
    "resource://devtools/client/jsonview/json-size-profiler.mjs"
  );

  // Test with various UTF-8 characters
  // "café" - é is 2 bytes in UTF-8
  // "中文" - each character is 3 bytes in UTF-8
  // "🔥" - emoji is 4 bytes in UTF-8
  const testJson = '{"name": "café", "lang": "中文", "emoji": "🔥"}';
  const profile = createSizeProfile(testJson);

  const expectedByteLength = utf8Length(testJson);
  const totalSize = totalProfiledBytes(profile);

  is(
    totalSize,
    expectedByteLength,
    `Total sample size should match UTF-8 byte length (${expectedByteLength} bytes, not ${testJson.length} characters)`
  );
  Assert.greater(
    expectedByteLength,
    testJson.length,
    "UTF-8 byte length should be greater than character count for this test string"
  );

  info(
    `Sample count: ${profile.threads[0].samples.length} for ${expectedByteLength} bytes`
  );
});
