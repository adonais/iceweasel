# XPCShell JSON Data Format Documentation

This document describes the JSON file formats created by `fetch-xpcshell-data.js`.

## Overview

The script generates two types of JSON files for each date or try commit:

1. **Test timing data**: `xpcshell-{date}.json` or `xpcshell-try-{revision}.json`
2. **Resource usage data**: `xpcshell-{date}-resources.json` or `xpcshell-try-{revision}-resources.json`

Both formats use string tables and index-based lookups to minimize file size.

---

## Test Timing Data Format

### Top-Level Structure

```json
{
  "metadata": { ... },
  "tables": { ... },
  "taskInfo": { ... },
  "testInfo": { ... },
  "testRuns": [ ... ]
}
```

### metadata

Contains information about the data collection:

```json
{
  "date": "2025-10-14",              // Date of the data (for date-based queries)
  "revision": "abc123...",           // Try commit revision (for try-based queries)
  "pushId": 12345,                   // Treeherder push ID (for try-based queries)
  "startTime": 1760400000,           // Unix timestamp (seconds) used as base for relative timestamps
  "generatedAt": "2025-10-15T14:24:33.451Z",  // ISO timestamp when file was created
  "jobCount": 3481,                  // Number of jobs fetched
  "processedJobCount": 3481          // Number of jobs successfully processed
}
```

### tables

String tables for efficient storage. All strings are deduplicated and stored once, sorted by frequency (most frequently used first for better compression):

```json
{
  "jobNames": [                      // Job names (e.g., "test-linux1804-64/opt-xpcshell")
    "test-linux1804-64/opt-xpcshell",
    "test-macosx1015-64/debug-xpcshell",
    ...
  ],
  "testPaths": [                     // Test file paths (e.g., "dom/indexedDB/test/unit")
    "dom/indexedDB/test/unit",
    "toolkit/components/extensions/test/xpcshell",
    ...
  ],
  "testNames": [                     // Test filenames (e.g., "test_foo.js")
    "test_foo.js",
    "test_bar.js",
    ...
  ],
  "repositories": [                  // Repository names
    "mozilla-central",
    "autoland",
    "try",
    ...
  ],
  "statuses": [                      // Test run statuses
    "PASS-PARALLEL",
    "PASS-SEQUENTIAL",
    "SKIP",
    "FAIL-PARALLEL",
    "TIMEOUT-SEQUENTIAL",
    "CRASH",
    "EXPECTED-FAIL",
    ...
  ],
  "taskIds": [                       // TaskCluster task IDs with retry (always includes .retryId)
    "YJJe4a0CRIqbAmcCo8n63w.0",      // Retry 0
    "XPPf5b1DRJrcBndDp9o74x.1",      // Retry 1
    ...
  ],
  "messages": [                      // SKIP status messages (only for tests that were skipped)
    "skip-if: os == 'linux'",
    "disabled due to bug 123456",
    ...
  ],
  "crashSignatures": [               // Crash signatures (only for crashed tests)
    "mozilla::dom::Something::Crash",
    "EMPTY: no crashing thread identified",
    ...
  ]
}
```

### taskInfo

Maps task IDs to their associated job names and repositories. These are parallel arrays indexed by `taskIdId`:

```json
{
  "repositoryIds": [0, 1, 0, 2, ...],  // Index into tables.repositories
  "jobNameIds": [0, 0, 1, 1, ...]      // Index into tables.jobNames
}
```

**Example lookup:**
```javascript
const taskIdId = 5;
const taskId = tables.taskIds[taskIdId];           // "YJJe4a0CRIqbAmcCo8n63w.0"
const repository = tables.repositories[taskInfo.repositoryIds[taskIdId]];  // "mozilla-central"
const jobName = tables.jobNames[taskInfo.jobNameIds[taskIdId]];           // "test-linux1804-64/opt-xpcshell"
```

### testInfo

Maps test IDs to their test paths and names. These are parallel arrays indexed by `testId`:

```json
{
  "testPathIds": [0, 0, 1, 2, ...],    // Index into tables.testPaths
  "testNameIds": [0, 1, 2, 3, ...]     // Index into tables.testNames
}
```

**Example lookup:**
```javascript
const testId = 10;
const testPath = tables.testPaths[testInfo.testPathIds[testId]];  // "dom/indexedDB/test/unit"
const testName = tables.testNames[testInfo.testNameIds[testId]];  // "test_foo.js"
const fullPath = testPath ? `${testPath}/${testName}` : testName;
```

### testRuns

A 2D sparse array structure: `testRuns[testId][statusId]`

- First dimension: `testId` (index into testInfo arrays)
- Second dimension: `statusId` (index into tables.statuses)

Each `testRuns[testId][statusId]` contains data for all runs of that test with that specific status. If a test never had a particular status, that array position contains `null`:

```json
[
  // testId 0
  [
    // statusId 0 (e.g., "PASS-PARALLEL")
    {
      "taskIdIds": [5, 12, 18, ...],       // Indices into tables.taskIds
      "durations": [1234, 1456, 1289, ...], // Test durations in milliseconds
      "timestamps": [0, 15, 23, ...]        // Differential compressed timestamps (seconds relative to metadata.startTime)
    },
    // statusId 1 - this test never had that status
    null,
    // statusId 2 (e.g., "SKIP")
    {
      "taskIdIds": [45, 67, ...],
      "durations": [0, 0, ...],
      "timestamps": [100, 200, ...],
      "messageIds": [5, 5, ...]            // Only present for SKIP status - indices into tables.messages (null if no message)
    },
    // statusId 3 (e.g., "CRASH")
    {
      "taskIdIds": [89, ...],
      "durations": [5678, ...],
      "timestamps": [300, ...],
      "crashSignatureIds": [2, ...],       // Only present for CRASH status - indices into tables.crashSignatures (null if none)
      "minidumps": ["12345678-abcd-1234-abcd-1234567890ab", ...]   // Only present for CRASH status - minidump IDs or null
    }
  ],
  // testId 1
  [ ... ],
  ...
]
```

**Timestamp decompression:**
```javascript
// Timestamps are differentially compressed
let currentTime = metadata.startTime;  // Base timestamp in seconds
const decompressedTimestamps = statusGroup.timestamps.map(diff => {
    currentTime += diff;
    return currentTime;
});
```

**Example: Get all runs of a specific test:**
```javascript
const testId = 10;
const testGroup = testRuns[testId];

for (let statusId = 0; statusId < testGroup.length; statusId++) {
    const statusGroup = testGroup[statusId];
    if (!statusGroup) continue;  // This test never had this status

    const status = tables.statuses[statusId];
    console.log(`Status: ${status}, Runs: ${statusGroup.taskIdIds.length}`);

    // Decompress timestamps
    let currentTime = metadata.startTime;
    for (let i = 0; i < statusGroup.taskIdIds.length; i++) {
        currentTime += statusGroup.timestamps[i];
        const taskId = tables.taskIds[statusGroup.taskIdIds[i]];
        const duration = statusGroup.durations[i];
        console.log(`  Task: ${taskId}, Duration: ${duration}ms, Time: ${currentTime}`);
    }
}
```

---

## Resource Usage Data Format

### Top-Level Structure

```json
{
  "jobNames": [ ... ],
  "repositories": [ ... ],
  "machineInfos": [ ... ],
  "jobs": { ... }
}
```

### Lookup Tables

```json
{
  "jobNames": [                      // Base job names without chunk numbers
    "test-linux1804-64/opt-xpcshell",
    "test-macosx1015-64/debug-xpcshell",
    ...
  ],
  "repositories": [                  // Repository names
    "mozilla-central",
    "autoland",
    ...
  ],
  "machineInfos": [                  // Machine specifications (memory in GB, rounded to 1 decimal)
    {
      "logicalCPUs": 8,
      "physicalCPUs": 4,
      "mainMemory": 15.6             // GB
    },
    {
      "logicalCPUs": 16,
      "physicalCPUs": 8,
      "mainMemory": 31.4
    },
    ...
  ]
}
```

### jobs

Parallel arrays containing resource usage data for each job, sorted by start time:

```json
{
  "jobNameIds": [0, 0, 1, 1, ...],                              // Indices into jobNames array
  "chunks": [1, 2, 1, 2, ...],                                  // Chunk numbers (null if job name has no chunk)
  "taskIds": ["YJJe4a0CRIqbAmcCo8n63w", "XPPf5b1DRJrcBndDp9o74x.1", ...], // Task IDs (format: "taskId" for retry 0, "taskId.retryId" for retry > 0)
  "repositoryIds": [0, 0, 1, 1, ...],                           // Indices into repositories array
  "startTimes": [0, 150, 23, 45, ...],       // Differential compressed timestamps (seconds)
  "machineInfoIds": [0, 0, 1, 1, ...],       // Indices into machineInfos array
  "maxMemories": [1234567890, ...],          // Maximum memory used (bytes)
  "idleTimes": [12345, ...],                 // Time with <50% of one core used (milliseconds)
  "singleCoreTimes": [45678, ...],           // Time using ~1 core (0.75-1.25 cores, milliseconds)
  "cpuBuckets": [                            // CPU usage time distribution (milliseconds per bucket)
    [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],  // Job 0: [0-10%, 10-20%, ..., 90-100%]
    [150, 250, 350, 450, 550, 650, 750, 850, 950, 1050],  // Job 1
    ...
  ]
}
```

**CPU Buckets Explanation:**
- Array of 10 values representing time spent in each CPU usage range
- Bucket 0: 0-10% CPU usage
- Bucket 1: 10-20% CPU usage
- ...
- Bucket 9: 90-100% CPU usage
- Values are in milliseconds

**Idle Time Calculation:**
- Idle = CPU usage < (50% of one core)
- For 8-core machine: idle = CPU usage < 6.25%
- For 16-core machine: idle = CPU usage < 3.125%

**Single Core Time Calculation:**
- Single core = CPU usage between 0.75 and 1.25 cores
- For 8-core machine: 9.375% - 15.625%
- For 16-core machine: 4.6875% - 7.8125%

**Start Time Decompression:**
```javascript
let currentTime = 0;  // Start times are relative to each other
const decompressedStartTimes = jobs.startTimes.map(diff => {
    currentTime += diff;
    return currentTime;
});
```

**Example: Get full information for a job:**
```javascript
const jobIndex = 5;
const jobName = jobNames[jobs.jobNameIds[jobIndex]];
const chunk = jobs.chunks[jobIndex];  // May be null
const fullJobName = chunk !== null ? `${jobName}-${chunk}` : jobName;
const taskId = jobs.taskIds[jobIndex];
const repository = repositories[jobs.repositoryIds[jobIndex]];
const machineInfo = machineInfos[jobs.machineInfoIds[jobIndex]];

// Decompress start time
let currentTime = 0;
for (let i = 0; i <= jobIndex; i++) {
    currentTime += jobs.startTimes[i];
}
const startTime = currentTime;  // seconds since epoch

const maxMemoryGB = jobs.maxMemories[jobIndex] / (1024 * 1024 * 1024);
const idleTimeSeconds = jobs.idleTimes[jobIndex] / 1000;
const singleCoreTimeSeconds = jobs.singleCoreTimes[jobIndex] / 1000;
const cpuDistribution = jobs.cpuBuckets[jobIndex];
const totalTime = cpuDistribution.reduce((sum, val) => sum + val, 0);
const idlePercent = (idleTimeSeconds * 1000 / totalTime) * 100;
```

---

## Data Compression Techniques

The format uses several compression techniques to minimize file size:

1. **String Tables**: All repeated strings (job names, test paths, etc.) are stored once and referenced by index
2. **Frequency Sorting**: Strings are sorted by usage frequency (most common first) so that frequently-used items have smaller index values, reducing the number of digits in the serialized JSON
3. **Differential Compression**: Timestamps are stored as differences from the previous value
4. **Parallel Arrays**: Instead of arrays of objects, data is stored in parallel arrays to avoid repeating key names
5. **Sparse Arrays**: In testRuns, status groups that don't exist are stored as `null`
6. **Combined IDs**: TaskCluster task IDs and retry IDs are combined into a single string format: `"taskId.retryId"`
7. **Chunk Extraction**: Job chunk numbers are extracted and stored separately from base job names

---

## Index File Format

The `index.json` file lists all available dates:

```json
{
  "dates": [
    "2025-10-15",
    "2025-10-14",
    "2025-10-13",
    ...
  ]
}
```

Dates are sorted in descending order (newest first).

---

## Notes

- All timestamps in test timing data are in **seconds**
- All durations are in **milliseconds**
- Memory values in machineInfos are in **GB** (rounded to 1 decimal place)
- Memory values in jobs.maxMemories are in **bytes**
- The `testRuns` array is sparse - `testRuns[testId][statusId]` may be `null` if that test never had that status
- **Task ID formats differ between files:**
  - Test timing data: Always includes retry suffix (e.g., `"YJJe4a0CRIqbAmcCo8n63w.0"`)
  - Resource usage data: Omits `.0` for retry 0 (e.g., `"YJJe4a0CRIqbAmcCo8n63w"`), includes suffix for retries > 0 (e.g., `"YJJe4a0CRIqbAmcCo8n63w.1"`)
- The data structure is optimized for sequential access patterns used by the dashboards
