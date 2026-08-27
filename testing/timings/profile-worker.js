/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Normalize failure messages to remove task-specific and time-specific information
function normalizeMessage(message) {
  return message
    ?.replace(/task_\d+/g, "task_id")
    .replace(/\nRejection date: [^\n]+/g, "")
    .replace(/Test ran for \d+s/g, "Test ran for Xs");
}

// UUIDs (e.g. "5be4afa1-d6bb-4eb2-95f8-c329fad3a5c8"), which appear both in
// messages and in the profile directory names of extension URLs.
const UUID_REGEXP =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

// The profile directory of the instance under test, together with the temporary
// directory it sits in. Both the profile name and the temporary directory are run
// specific, and the temporary directory is platform specific on top of that
// ("/tmp", "%LOCALAPPDATA%\Temp", "/var/folders/<random>/T").
//
// The profile is created with Python's mkdtemp, which always appends 8 characters
// of [a-z0-9_]: xpcshell passes it the "xpc-profile-" prefix (see
// runxpcshelltests.py) and mozprofile the ".mozrunner" suffix, keeping mkdtemp's
// default "tmp" prefix (see mozprofile/profile.py).
// A URL scheme in front of the path is kept: "jar:file:///<profile>/foo.xpi!/bar"
// has to stay a well formed jar URL, where "!" separates the path of the archive
// from the path inside it.
const PROFILE_PATH_REGEXP =
  /((?:[a-z-]{2,}:)+\/*)?[^\s'"`]*(?:xpc-profile-[a-z0-9_]{8}|tmp[a-z0-9_]{8}\.mozrunner)([^\s'"`]*)/g;

// Replace the path of a file of the profile of the instance under test with a
// "<profile>" relative path. Without this the same file is a different string in
// every job, and a different string on every platform. What follows the profile
// directory keeps forward slashes, so that a Windows path is the same string as
// the POSIX one.
function normalizeProfilePaths(string) {
  return string.replace(
    PROFILE_PATH_REGEXP,
    (match, scheme = "", inProfile) =>
      `${scheme}<profile>${inProfile.replace(/\\+/g, "/")}`
  );
}

// The authority of a URL, followed by the port httpd.js or one of the other test
// servers was given at runtime. An IPv6 host keeps its brackets ("http://[::1]").
// "localhost" is also matched without a scheme, for the URLs devtools serializes
// into its error messages. Only these forms are matched because a position in a
// stack frame ("Front.js:335:14") would otherwise look like a host and a port.
const PORT_REGEXP =
  /(:\/\/(?:\[[^\]\s]*\]|[^\s/:'"`\\]+)|(?<![\w./])localhost):\d{2,5}(?![\w.])/g;

// A path quoted in a message, eg. the file of a stack frame or the file a failed
// operation was on. Only the paths normalizeSourcePath can shorten are matched:
// those below a build or test worker directory, and those in the profile.
const QUOTED_PATH_REGEXP =
  /[^\s'"`]*(?:checkouts[\\/]+gecko|build[\\/]+tests|obj-build|xpc-profile-[a-z0-9_]{8}|tmp[a-z0-9_]{8}\.mozrunner)[^\s'"`]*/g;

// Normalize marker messages further so near-identical messages deduplicate into
// a single string-table entry (and group together on dashboards). Many
// warnings embed run-specific data that would otherwise make every occurrence
// unique: pointer addresses (e.g. "0x2296ffc8100") and sub-second timings
// (e.g. "0.000075s").
function normalizeMarkerMessage(message) {
  return (
    normalizeMessage(message)
      // Paths quoted in the message get the same treatment as a marker's own
      // file, so that a diagnostic is a single message whatever worker and
      // platform it comes from.
      ?.replace(QUOTED_PATH_REGEXP, normalizeSourcePath)
      .replace(UUID_REGEXP, "<uuid>")
      // Devtools actor ids (e.g. "server0.conn0.watcher2.process1234//layout29"),
      // where every number counts up from the start of the connection. This runs
      // before the process id rule, which would otherwise leave a "<pid>" in the
      // middle of the path and stop the numbers after it from being matched.
      .replace(/\bserver\d+\.conn\d+[\w./]*/g, actor =>
        actor.replace(/\d+/g, "<n>")
      )
      // Pointer addresses (e.g. "0x2296ffc8100").
      .replace(/0x[0-9a-fA-F]+/g, "0x...")
      // Sub-second timings (e.g. "0.000075s").
      .replace(/\b\d+\.\d+\s*(ms|s|µs|us|ns)\b/g, "X$1")
      // Process ids (e.g. "Process 9770 may be hanging at shutdown", "Invalid
      // process ID: 1", "processId 1628", "pid = 10164"). They are only 4 or 5
      // digits long, so they have to be recognized from the words around them;
      // the shutdown warnings alone would otherwise contribute hundreds of
      // messages a day.
      .replace(/\b(process(?:[\s_-]*id)?\s*[:=]?\s*)\d+\b/gi, "$1<pid>")
      .replace(/\b(pid\s*[:=]\s*)\d+\b/gi, "$1<pid>")
      // Ids of a content process, a window, a browsing context or a tab, which
      // count up from the start of the job, so they are only a couple of digits
      // long in a short job and the rule for large decimal ids never sees them.
      .replace(
        /\b(childID|ContentParent: id|innerWindowId|outerWindowId|browsingContextId|windowId|tab ID)(\s*[:=]\s*)\d+/gi,
        "$1$2<id>"
      )
      // A query parameter whose value is generated at runtime: the tokens and
      // challenges of an OAuth flow, and the ids some tests put in a URL.
      .replace(
        /([?&](?:state|code|code_challenge|keys_jwk|token)=)[A-Za-z0-9_%+-]{8,}/g,
        "$1<random>"
      )
      .replace(PORT_REGEXP, "$1:<port>")
      // Large decimal ids (e.g. "innerWindowId:23622320129").
      .replace(/\b\d{8,}\b/g, "<num>")
      // Bare hex addresses (e.g. "100b71300", hex peer IDs, and the pointers the
      // media logs print without a "0x" prefix, e.g. "Decoder=4d26600").
      // Requiring both a hex letter and a digit keeps a word ("facade") and a
      // decimal number (a bug number) from being read as an address.
      .replace(
        /\b(?=[0-9a-fA-F]*[a-fA-F])(?=[0-9a-fA-F]*\d)[0-9a-fA-F]{7,}\b/g,
        "<addr>"
      )
  );
}

// Normalize a marker's source file so that a file has a single path whatever
// platform and worker the test ran on, and maps to a Bugzilla component when it
// is a source file.
function normalizeSourcePath(file) {
  if (!file) {
    return file;
  }

  // Windows paths use backslashes, sometimes doubled. Forward slashes are left
  // alone: "resource:///modules/Foo.sys.mjs" has to keep its scheme.
  let normalized = file.replace(/\\+/g, "/");

  // Drop the directory the file was read from, which names the build or test
  // worker and sometimes the task: source files are below "checkouts/gecko/",
  // files shipped in the test package below "build/tests/", and generated files
  // below the "obj-build/" object directory (so those keep a "dist/include/"
  // prefix, as their path is an install name rather than a source path). None of
  // these exists in the repository, so this can't truncate a path that is
  // already repo-relative.
  for (const prefix of ["checkouts/gecko/", "build/tests/", "obj-build/"]) {
    const index = normalized.lastIndexOf(prefix);
    if (index !== -1) {
      normalized = normalized.slice(index + prefix.length);
    }
  }

  // The profile specific directory name of an extension page URL
  // ("moz-extension://<uuid>/"), then the profile directory itself, for the files
  // that are read from it (its extensions, and the data the test wrote there).
  normalized = normalizeProfilePaths(normalized.replace(UUID_REGEXP, "<uuid>"));

  // The port a test server listens on, then the timestamp some tests append to a
  // URL to bypass the cache. Only a query string is matched for the timestamp: a
  // long number in the path of a file is part of its name.
  return normalized
    .replace(PORT_REGEXP, "$1:<port>")
    .replace(/([?&](?:[\w.-]+=)?(?:0\.)?)\d{8,}\b/g, "$1<num>");
}

// mozlog test ids of tests in a dupe manifest are prefixed with the manifest
// name (eg. "xpcshell-parent-process.toml:dom/indexedDB/test/unit/test_foo.js").
// Strip the prefix so a test has a single identity across all our data files.
function normalizeTestId(test) {
  return test?.includes(":") ? test.split(":")[1] : test;
}

function formatTaskMessage(taskId, message) {
  return `      Task ${taskId}: ${message}`;
}

// Extract parallel execution time ranges from markers
function extractParallelRanges(markers) {
  const parallelRanges = [];

  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    // Look for markers with type: "Text" and text: "parallel"
    if (data?.type === "Text" && data.text === "parallel") {
      parallelRanges.push({
        start: markers.startTime[i],
        end: markers.endTime[i],
      });
    }
  }

  return parallelRanges;
}

// Check if a test time overlaps with any parallel execution range
function isInParallelRange(testStart, testEnd, parallelRanges) {
  for (const range of parallelRanges) {
    // Check if test overlaps with parallel range
    if (testStart < range.end && testEnd > range.start) {
      return true;
    }
  }
  return false;
}

// Extract resource usage information from profile
function extractResourceUsage(profile) {
  if (!profile || !profile.threads || !profile.threads[0]) {
    return null;
  }

  const thread = profile.threads[0];
  const { markers } = thread;

  if (!markers || !markers.data) {
    return null;
  }

  // Extract machine info from profile metadata
  // Convert memory to GB with 1 decimal place to avoid grouping issues from tiny variations
  const machineInfo = {
    logicalCPUs: profile.meta?.logicalCPUs || null,
    physicalCPUs: profile.meta?.physicalCPUs || null,
    mainMemory: profile.meta?.mainMemory
      ? parseFloat((profile.meta.mainMemory / (1024 * 1024 * 1024)).toFixed(1))
      : null,
  };

  let maxMemory = 0;
  let idleTime = 0;
  let singleCoreTime = 0;
  // CPU buckets: [0-10%, 10-20%, 20-30%, ..., 90-100%]
  const cpuBuckets = new Array(10).fill(0);

  // Calculate thresholds based on core count
  const oneCorePct = machineInfo.logicalCPUs
    ? 100 / machineInfo.logicalCPUs
    : 12.5;
  const idleThreshold = oneCorePct / 2;
  // Single-core range: 0.75 to 1.25 cores (to account for slight variations)
  const singleCoreMin = oneCorePct * 0.75;
  const singleCoreMax = oneCorePct * 1.25;

  // Process markers to gather resource usage
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (!data) {
      continue;
    }

    const duration = markers.endTime[i] - markers.startTime[i];

    if (data.type === "Mem") {
      if (data.used > maxMemory) {
        maxMemory = data.used;
      }
    } else if (data.type === "CPU") {
      // Parse CPU percentage (e.g., "21.4%" -> 21.4)
      const cpuPercent = parseFloat(data.cpuPercent);
      if (isNaN(cpuPercent)) {
        continue;
      }

      if (cpuPercent < idleThreshold) {
        idleTime += duration;
      }

      // Check if it's in the single-core range
      if (cpuPercent >= singleCoreMin && cpuPercent <= singleCoreMax) {
        singleCoreTime += duration;
      }

      // Compute bucket index: 0-10% -> bucket 0, 10-20% -> bucket 1, etc.
      const bucketIndex = Math.min(Math.floor(cpuPercent / 10), 9);
      cpuBuckets[bucketIndex] += duration;
    }
  }

  return {
    machineInfo,
    maxMemory,
    idleTime,
    singleCoreTime,
    cpuBuckets,
  };
}

// Extract test timings from profile
// eslint-disable-next-line complexity
function extractTestTimings(profile) {
  if (!profile || !profile.threads || !profile.threads[0]) {
    return [];
  }

  const thread = profile.threads[0];
  const { markers, stringArray } = thread;

  if (!markers || !markers.data || !markers.name || !stringArray) {
    return [];
  }

  // First, extract parallel execution ranges
  const parallelRanges = extractParallelRanges(markers);

  // Extract crash markers for later matching with CRASH status tests
  const crashMarkers = [];
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (data?.type !== "Crash" || !data.test) {
      continue;
    }
    crashMarkers.push({
      testPath: data.test,
      startTime: markers.startTime[i],
      signature: data.signature || null,
      minidump: data.minidump || null,
    });
  }

  // Extract TestStatus markers (FAIL, ERROR) for failure messages
  const failStringId = stringArray.indexOf("FAIL");
  const errorStringId = stringArray.indexOf("ERROR");
  const testStatusMarkers = [];

  for (let i = 0; i < markers.length; i++) {
    const nameId = markers.name[i];
    if (nameId !== failStringId && nameId !== errorStringId) {
      continue;
    }
    const data = markers.data[i];
    if (!data || data.type !== "TestStatus" || !data.test) {
      continue;
    }

    testStatusMarkers.push({
      test: data.test,
      nameId,
      time: markers.startTime[i],
      message: normalizeMessage(data.message),
    });
  }

  // Sort TestStatus markers by test and then time for efficient lookup
  testStatusMarkers.sort(
    (a, b) => a.test.localeCompare(b.test) || a.time - b.time
  );

  const testStringId = stringArray.indexOf("test");
  const timings = [];

  for (let i = 0; i < markers.length; i++) {
    if (markers.name[i] !== testStringId) {
      continue;
    }

    const data = markers.data[i];
    if (!data) {
      continue;
    }

    let testPath = null;
    let status = "UNKNOWN";
    let message = null;

    // Handle both structured and plain text logs
    if (data.type === "Test") {
      // Structured log format
      const fullTestId = data.test || data.name;
      testPath = fullTestId;
      status = data.status || "UNKNOWN";
      // Normalize line breaks in message (convert \r\n to \n) and apply normalizations
      message = normalizeMessage(
        data.message ? data.message.replace(/\r\n/g, "\n") : null
      );

      // Check if this is an expected failure (FAIL status but green color)
      if (status === "FAIL" && data.color === "green") {
        status = "EXPECTED-FAIL";
      }
      // Check if this is an unexpected pass (PASS status with expected field present)
      else if (status === "PASS" && data.expected && data.expected !== "PASS") {
        status = "UNEXPECTED-PASS";
      }
      // Add execution context suffix to timeout, fail, and pass statuses
      else if (
        ["TIMEOUT", "FAIL", "PASS"].includes(status) &&
        parallelRanges.length
      ) {
        status += isInParallelRange(
          markers.startTime[i],
          markers.endTime[i],
          parallelRanges
        )
          ? "-PARALLEL"
          : "-SEQUENTIAL";
      }
      // Keep other statuses as-is

      // For failure statuses, look up the message from TestStatus markers
      if (status.startsWith("FAIL")) {
        const testStartTime = markers.startTime[i];
        const statusMarker = testStatusMarkers.find(
          m => m.test === fullTestId && m.time >= testStartTime
        );
        if (statusMarker && statusMarker.message) {
          message = statusMarker.message;
        }
      }

      testPath = normalizeTestId(testPath);
    } else if (data.type === "Text") {
      // Plain text log format
      testPath = data.text;

      // Skip text markers like "replaying full log for ..."
      if (testPath?.startsWith("replaying full log for ")) {
        continue;
      }

      // We don't have status information in markers from plain text logs
      status = "UNKNOWN";
    } else {
      continue;
    }

    // Filter out non-test paths (allow common test file extensions)
    if (!testPath || !/\.(js|html|xhtml)$/.test(testPath)) {
      continue;
    }

    const testStartTime = markers.startTime[i];
    const testEndTime = markers.endTime[i];

    const timing = {
      path: testPath,
      duration: testEndTime - testStartTime,
      status,
      timestamp: profile.meta.startTime + testStartTime,
    };
    if (message) {
      timing.message = message;
    }

    // For CRASH status, find matching crash marker within the test's time range
    if (status === "CRASH") {
      const matchingCrash = crashMarkers.find(
        crash =>
          crash.testPath === data.test &&
          crash.startTime >= testStartTime &&
          crash.startTime <= testEndTime
      );
      if (matchingCrash) {
        if (matchingCrash.signature) {
          timing.crashSignature = matchingCrash.signature;
        }
        if (matchingCrash.minidump) {
          timing.minidump = matchingCrash.minidump;
        }
      }
    }

    timings.push(timing);
  }

  return timings;
}

// Names of the error/warning markers emitted by mozsystemmonitor into the
// resource usage profile (see testing/mozbase/mozsystemmonitor).
const ERROR_MARKER_NAMES = new Set([
  "C++ warning",
  "C++ assertion",
  "console.error",
  "console.warn",
  "JavaScript error",
  "JavaScript warning",
  "TSan Error",
]);

// The repo relative path of the file of a stack frame, or null when the frame is
// not in a repository file. mozsystemmonitor gives frame files the profiler
// source view form, "hg:<host>/<repo>:<path>:<rev>" (see its _clean_frame_file);
// anything else (a sysroot header, a generated file) has no repo path.
function repoPathForFrameFile(file) {
  if (!file?.startsWith("hg:")) {
    return null;
  }

  const parts = file.split(":");
  return parts.length >= 4 ? parts.slice(2, -1).join(":") : null;
}

// Resolve a marker's stack, given as an index into the thread's stackTable, to
// the { file, line } of its first repository frame. The stack is walked from the
// leaf towards the root, skipping the frames that are in no repository file: the
// leaves are crash and runtime machinery (MOZ_Crash, the TSan runtime, libc)
// which no Bugzilla component owns.
function resolveStackRepoFrame(thread, stackIndex) {
  const { stackTable, frameTable, funcTable, stringArray } = thread;

  for (let s = stackIndex; s != null; s = stackTable.prefix[s]) {
    const frameIndex = stackTable.frame[s];
    const fileId = funcTable.fileName[frameTable.func[frameIndex]];
    const file = repoPathForFrameFile(
      fileId != null ? stringArray[fileId] : null
    );
    if (file) {
      return { file, line: frameTable.line[frameIndex] };
    }
  }

  return null;
}

// Extract error/warning markers (C++ warnings/assertions, console.error/warn,
// JavaScript errors/warnings, TSan errors) from a resource usage profile. Only
// called after extractTestTimings succeeded on the same profile, so the marker
// table and the string array are known to be there.
function extractErrorMarkers(profile) {
  const thread = profile.threads[0];
  const { markers, stringArray } = thread;

  // Map the string-table indices of the marker names we care about to the name.
  const nameIdToName = new Map();
  for (const name of ERROR_MARKER_NAMES) {
    const id = stringArray.indexOf(name);
    if (id !== -1) {
      nameIdToName.set(id, name);
    }
  }
  if (nameIdToName.size === 0) {
    return [];
  }

  const result = [];
  for (let i = 0; i < markers.length; i++) {
    const name = nameIdToName.get(markers.name[i]);
    if (!name) {
      continue;
    }

    // These markers always carry a payload. console.* markers have no file and
    // line, and TSan errors have no message either (see mozsystemmonitor's
    // _parse_process_output and its tsan_error handler).
    const data = markers.data[i];
    let { message, file, line } = data;

    // A TSan error is described by the kind of report it belongs to and by the
    // label of the stack it was reported for. Take its file and line from the
    // first repository frame of that stack, so that it can be attributed to a
    // Bugzilla component like the other markers.
    if (name === "TSan Error") {
      message = data.label ? `${data.kind}: ${data.label}` : data.kind;
      const frame = resolveStackRepoFrame(thread, data.cause?.stack);
      if (frame) {
        ({ file, line } = frame);
      }
    }

    result.push({
      name,
      message: normalizeMarkerMessage(message) || null,
      test: normalizeTestId(data.test) || null,
      file: normalizeSourcePath(file) || null,
      line: line ?? null,
    });
  }

  return result;
}

// Fetch resource profile from TaskCluster with local caching
async function fetchResourceProfile(taskId, retryId = 0) {
  const cacheFileGz = path.join(
    workerData.profileCacheDir,
    `${taskId}-${retryId}.json.gz`
  );

  // Check if we have a cached gzipped version
  if (fs.existsSync(cacheFileGz)) {
    try {
      const compressedData = fs.readFileSync(cacheFileGz);
      const decompressedData = zlib.gunzipSync(compressedData);
      return JSON.parse(decompressedData.toString("utf-8"));
    } catch (error) {
      console.warn(
        `Error reading cached gzipped profile ${taskId}: ${error.message}`
      );
      // Continue to fetch from network
    }
  }

  const url = `${workerData.taskclusterBaseUrl}/api/queue/v1/task/${taskId}/runs/${retryId}/artifacts/public/test_info/profile_resource-usage.json`;

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    // Network error (timeout, connection refused, etc.)
    let message = error.message;
    if (error.cause) {
      message += ` (${error.cause.code || error.cause.message})`;
    }
    console.error(formatTaskMessage(taskId, `Network error - ${message}`));
    return { error: "network_error" };
  }

  if (!response.ok) {
    const errorType = response.status === 404 ? "not_found" : "http_error";
    console.error(
      formatTaskMessage(
        taskId,
        `HTTP error ${response.status} ${response.statusText}`
      )
    );
    return { error: errorType };
  }

  let profile;
  try {
    profile = await response.json();
  } catch (error) {
    console.error(
      formatTaskMessage(taskId, `JSON parse error - ${error.message}`)
    );
    return { error: "parse_error" };
  }

  // Cache the profile for future use (gzipped)
  try {
    const compressed = zlib.gzipSync(JSON.stringify(profile));
    fs.writeFileSync(cacheFileGz, compressed);
  } catch (error) {
    console.warn(
      formatTaskMessage(taskId, `Error caching profile - ${error.message}`)
    );
  }

  return profile;
}

// Process a single job to extract test timings
async function processJob(job) {
  // Parse task field: "<task_id>.<retry_id>" or just "<task_id>"
  const parts = job.task.split(".");
  const taskId = parts[0];
  const retryId = parts.length === 2 ? parseInt(parts[1], 10) : 0;
  const jobName = job.name;

  if (!taskId) {
    console.error(`      Job has no task ID: ${JSON.stringify(job)}`);
    return { error: "invalid_job" };
  }

  const profile = await fetchResourceProfile(taskId, retryId);
  if (!profile) {
    console.error(
      formatTaskMessage(taskId, "No profile returned (unexpected null)")
    );
    return { error: "no_profile" };
  }

  // Check if profile is an error object
  if (profile.error) {
    return { error: profile.error };
  }

  const timings = extractTestTimings(profile);
  if (timings.length === 0) {
    console.warn(
      formatTaskMessage(taskId, "No test timings extracted from profile")
    );
    return { error: "no_timings" };
  }

  const resourceUsage = extractResourceUsage(profile);
  const markers = extractErrorMarkers(profile);

  // Extract commit ID from profile.meta.sourceURL
  // Format: "https://hg.mozilla.org/integration/autoland/rev/f37a6863f87aeeb870b16223045ea7614b1ba0a7"
  let commitId = null;
  if (profile.meta.sourceURL) {
    const match = profile.meta.sourceURL.match(/\/rev\/([a-f0-9]+)$/i);
    if (match) {
      commitId = match[1];
    }
  }

  // Convert start_time to timestamp in seconds if it's a string
  const startTime =
    typeof job.start_time === "string"
      ? Math.floor(new Date(job.start_time).getTime() / 1000)
      : job.start_time;

  return {
    jobName,
    taskId,
    retryId,
    repository: job.repository,
    startTime,
    timings,
    resourceUsage,
    markers,
    commitId,
  };
}

// Main worker function
async function main() {
  try {
    // Signal worker is ready for jobs
    parentPort.postMessage({ type: "ready" });

    // Listen for job assignments. Each result is sent to the main thread as it
    // completes; the worker keeps nothing (a full day's markers would otherwise
    // pile up in the worker heap too).
    parentPort.on("message", async message => {
      if (message.type === "job") {
        const result = await processJob(message.job);
        parentPort.postMessage({ type: "jobComplete", result });
      } else if (message.type === "shutdown") {
        parentPort.postMessage({ type: "finished" });
      }
    });
  } catch (error) {
    parentPort.postMessage({ type: "error", error: error.message });
  }
}

main();
