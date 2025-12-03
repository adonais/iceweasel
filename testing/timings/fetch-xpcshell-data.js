#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const os = require("os");

const MAX_WORKERS = Math.min(32, os.cpus().length);

const TASKCLUSTER_BASE_URL =
  process.env.TASKCLUSTER_PROXY_URL ||
  process.env.TASKCLUSTER_ROOT_URL ||
  "https://firefox-ci-tc.services.mozilla.com";

// Check for --output-dir parameter
const OUTPUT_DIR = (() => {
  const outputDirIndex = process.argv.findIndex(arg => arg === "--output-dir");
  if (outputDirIndex !== -1 && outputDirIndex + 1 < process.argv.length) {
    return process.argv[outputDirIndex + 1];
  }
  return "./xpcshell-data";
})();

const PROFILE_CACHE_DIR = "./profile-cache";

let previousRunData = null;
let allJobsCache = null;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(PROFILE_CACHE_DIR)) {
  fs.mkdirSync(PROFILE_CACHE_DIR, { recursive: true });
}

// Get date in YYYY-MM-DD format
function getDateString(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split("T")[0];
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return response.json();
}

// Fetch commit push data from Treeherder API
async function fetchCommitData(project, revision) {
  console.log(`Fetching commit data for ${project}:${revision}...`);

  const result = await fetchJson(
    `https://treeherder.mozilla.org/api/project/${project}/push/?full=true&count=10&revision=${revision}`
  );

  if (!result || !result.results || result.results.length === 0) {
    throw new Error(
      `No push found for revision ${revision} on project ${project}`
    );
  }

  const pushId = result.results[0].id;
  console.log(`Found push ID: ${pushId}`);
  return pushId;
}

// Fetch jobs from push
async function fetchPushJobs(project, pushId) {
  console.log(`Fetching jobs for push ID ${pushId}...`);

  let allJobs = [];
  let propertyNames = [];
  let url = `https://treeherder.mozilla.org/api/jobs/?push_id=${pushId}`;

  // The /jobs/ API is paginated, keep fetching until next is null
  while (url) {
    const result = await fetchJson(url);
    if (!result) {
      throw new Error(`Failed to fetch jobs for push ID ${pushId}`);
    }

    allJobs = allJobs.concat(result.results || []);
    if (!propertyNames.length) {
      propertyNames = result.job_property_names || [];
    }

    url = result.next;
  }

  // Get field indices dynamically
  const jobTypeNameIndex = propertyNames.indexOf("job_type_name");
  const taskIdIndex = propertyNames.indexOf("task_id");
  const retryIdIndex = propertyNames.indexOf("retry_id");
  const lastModifiedIndex = propertyNames.indexOf("last_modified");

  const xpcshellJobs = allJobs
    .filter(
      job => job[jobTypeNameIndex] && job[jobTypeNameIndex].includes("xpcshell")
    )
    .map(job => ({
      name: job[jobTypeNameIndex],
      task_id: job[taskIdIndex],
      retry_id: job[retryIdIndex] || 0,
      start_time: job[lastModifiedIndex],
      repository: project,
    }));

  console.log(
    `Found ${xpcshellJobs.length} xpcshell jobs out of ${allJobs.length} total jobs`
  );
  return xpcshellJobs;
}

// Fetch xpcshell test data from treeherder database for a specific date
async function fetchXpcshellData(targetDate) {
  console.log(`Fetching xpcshell test data for ${targetDate}...`);

  // Fetch data from the treeherder database if not already cached
  if (!allJobsCache) {
    console.log(`Querying treeherder database...`);
    const result = await fetchJson(
      "https://sql.telemetry.mozilla.org/api/queries/110630/results.json?api_key=Pyybfsna2r5KQkwYgSk9zqbYfc6Dv0rhxL99DFi1"
    );

    if (!result) {
      throw new Error("Failed to fetch data from treeherder database");
    }

    const allJobs = result.query_result.data.rows;

    // Cache only xpcshell jobs
    allJobsCache = allJobs.filter(job => job.name.includes("xpcshell"));
    console.log(
      `Cached ${allJobsCache.length} xpcshell jobs from treeherder database (out of ${allJobs.length} total jobs)`
    );
  }

  // Filter cached jobs for the target date
  return allJobsCache.filter(job => job.start_time.startsWith(targetDate));
}

// Process jobs using worker threads with dynamic job distribution
async function processJobsWithWorkers(jobs, targetDate = null) {
  if (jobs.length === 0) {
    return [];
  }

  const dateStr = targetDate ? ` for ${targetDate}` : "";
  console.log(
    `Processing ${jobs.length} jobs${dateStr} using ${MAX_WORKERS} workers...`
  );

  const jobQueue = [...jobs];
  const results = [];
  const workers = [];
  let completedJobs = 0;
  let lastProgressTime = 0;

  return new Promise((resolve, reject) => {
    // Track worker states
    const workerStates = new Map();

    // Create workers
    for (let i = 0; i < MAX_WORKERS; i++) {
      const worker = new Worker(path.join(__dirname, "profile-worker.js"), {
        workerData: {
          profileCacheDir: PROFILE_CACHE_DIR,
          taskclusterBaseUrl: TASKCLUSTER_BASE_URL,
        },
      });

      workers.push(worker);
      workerStates.set(worker, { id: i + 1, ready: false, jobsProcessed: 0 });

      worker.on("message", message => {
        const workerState = workerStates.get(worker);

        if (message.type === "ready") {
          workerState.ready = true;
          assignNextJob(worker);
        } else if (message.type === "jobComplete") {
          workerState.jobsProcessed++;
          completedJobs++;

          if (message.result) {
            results.push(message.result);
          }

          // Show progress at most once per second, or on first/last job
          const now = Date.now();
          if (
            completedJobs === 1 ||
            completedJobs === jobs.length ||
            now - lastProgressTime >= 1000
          ) {
            const percentage = Math.round((completedJobs / jobs.length) * 100);
            const paddedCompleted = completedJobs
              .toString()
              .padStart(jobs.length.toString().length);
            const paddedPercentage = percentage.toString().padStart(3); // Pad to 3 chars for alignment (0-100%)
            console.log(
              ` ${paddedPercentage}% ${paddedCompleted}/${jobs.length}`
            );
            lastProgressTime = now;
          }

          // Assign next job or finish
          assignNextJob(worker);
        } else if (message.type === "finished") {
          checkAllComplete();
        } else if (message.type === "error") {
          reject(new Error(`Worker ${workerState.id} error: ${message.error}`));
        }
      });

      worker.on("error", error => {
        reject(
          new Error(
            `Worker ${workerStates.get(worker).id} thread error: ${error.message}`
          )
        );
      });

      worker.on("exit", code => {
        if (code !== 0) {
          reject(
            new Error(
              `Worker ${workerStates.get(worker).id} stopped with exit code ${code}`
            )
          );
        }
      });
    }

    function assignNextJob(worker) {
      if (jobQueue.length) {
        const job = jobQueue.shift();
        worker.postMessage({ type: "job", job });
      } else {
        // No more jobs, tell worker to finish
        worker.postMessage({ type: "shutdown" });
      }
    }

    let resolved = false;
    let workersFinished = 0;

    function checkAllComplete() {
      if (resolved) {
        return;
      }

      workersFinished++;

      if (workersFinished >= MAX_WORKERS) {
        resolved = true;

        // Terminate all workers to ensure clean exit
        workers.forEach(worker => worker.terminate());

        resolve(results);
      }
    }
  });
}

// Create string tables and store raw data efficiently
function createDataTables(jobResults) {
  const tables = {
    jobNames: [],
    testPaths: [],
    testNames: [],
    repositories: [],
    statuses: [],
    taskIds: [],
    messages: [],
    crashSignatures: [],
  };

  // Maps for O(1) string lookups
  const stringMaps = {
    jobNames: new Map(),
    testPaths: new Map(),
    testNames: new Map(),
    repositories: new Map(),
    statuses: new Map(),
    taskIds: new Map(),
    messages: new Map(),
    crashSignatures: new Map(),
  };

  // Task info maps task ID index to repository and job name indexes
  const taskInfo = {
    repositoryIds: [],
    jobNameIds: [],
  };

  // Test info maps test ID index to test path and name indexes
  const testInfo = {
    testPathIds: [],
    testNameIds: [],
  };

  // Map for fast testId lookup: fullPath -> testId
  const testIdMap = new Map();

  // Test runs grouped by test ID, then by status ID
  // testRuns[testId] = array of status groups for that test
  const testRuns = [];

  function findStringIndex(tableName, string) {
    const table = tables[tableName];
    const map = stringMaps[tableName];

    let index = map.get(string);
    if (index === undefined) {
      index = table.length;
      table.push(string);
      map.set(string, index);
    }
    return index;
  }

  for (const result of jobResults) {
    if (!result || !result.timings) {
      continue;
    }

    const jobNameId = findStringIndex("jobNames", result.jobName);
    const repositoryId = findStringIndex("repositories", result.repository);

    for (const timing of result.timings) {
      const fullPath = timing.path;

      // Check if we already have this test
      let testId = testIdMap.get(fullPath);
      if (testId === undefined) {
        // New test - need to process path/name split and create entry
        const lastSlashIndex = fullPath.lastIndexOf("/");

        let testPath, testName;
        if (lastSlashIndex === -1) {
          // No directory, just the filename
          testPath = "";
          testName = fullPath;
        } else {
          testPath = fullPath.substring(0, lastSlashIndex);
          testName = fullPath.substring(lastSlashIndex + 1);
        }

        const testPathId = findStringIndex("testPaths", testPath);
        const testNameId = findStringIndex("testNames", testName);

        testId = testInfo.testPathIds.length;
        testInfo.testPathIds.push(testPathId);
        testInfo.testNameIds.push(testNameId);
        testIdMap.set(fullPath, testId);
      }

      const statusId = findStringIndex("statuses", timing.status || "UNKNOWN");
      const taskIdString = `${result.taskId}.${result.retryId}`;
      const taskIdId = findStringIndex("taskIds", taskIdString);

      // Store task info only once per unique task ID
      if (taskInfo.repositoryIds[taskIdId] === undefined) {
        taskInfo.repositoryIds[taskIdId] = repositoryId;
        taskInfo.jobNameIds[taskIdId] = jobNameId;
      }

      // Initialize test group if it doesn't exist
      if (!testRuns[testId]) {
        testRuns[testId] = [];
      }

      // Initialize status group within test if it doesn't exist
      let statusGroup = testRuns[testId][statusId];
      if (!statusGroup) {
        statusGroup = {
          taskIdIds: [],
          durations: [],
          timestamps: [],
        };
        // Only include messageIds array for SKIP status
        if (timing.status === "SKIP") {
          statusGroup.messageIds = [];
        }
        // Only include crash data arrays for CRASH status
        if (timing.status === "CRASH") {
          statusGroup.crashSignatureIds = [];
          statusGroup.minidumps = [];
        }
        testRuns[testId][statusId] = statusGroup;
      }

      // Add test run to the appropriate test/status group
      statusGroup.taskIdIds.push(taskIdId);
      statusGroup.durations.push(Math.round(timing.duration));
      statusGroup.timestamps.push(timing.timestamp);

      // Store message ID for SKIP status (or null if no message)
      if (timing.status === "SKIP") {
        const messageId = timing.message
          ? findStringIndex("messages", timing.message)
          : null;
        statusGroup.messageIds.push(messageId);
      }

      // Store crash data for CRASH status (or null if not available)
      if (timing.status === "CRASH") {
        const crashSignatureId = timing.crashSignature
          ? findStringIndex("crashSignatures", timing.crashSignature)
          : null;
        statusGroup.crashSignatureIds.push(crashSignatureId);
        statusGroup.minidumps.push(timing.minidump || null);
      }
    }
  }

  return {
    tables,
    taskInfo,
    testInfo,
    testRuns,
  };
}

// Sort string tables by frequency and remap all indices for deterministic output and better compression
function sortStringTablesByFrequency(dataStructure) {
  const { tables, taskInfo, testInfo, testRuns } = dataStructure;

  // Count frequency of each index for each table
  const frequencyCounts = {
    jobNames: new Array(tables.jobNames.length).fill(0),
    testPaths: new Array(tables.testPaths.length).fill(0),
    testNames: new Array(tables.testNames.length).fill(0),
    repositories: new Array(tables.repositories.length).fill(0),
    statuses: new Array(tables.statuses.length).fill(0),
    taskIds: new Array(tables.taskIds.length).fill(0),
    messages: new Array(tables.messages.length).fill(0),
    crashSignatures: new Array(tables.crashSignatures.length).fill(0),
  };

  // Count taskInfo references
  for (const jobNameId of taskInfo.jobNameIds) {
    if (jobNameId !== undefined) {
      frequencyCounts.jobNames[jobNameId]++;
    }
  }
  for (const repositoryId of taskInfo.repositoryIds) {
    if (repositoryId !== undefined) {
      frequencyCounts.repositories[repositoryId]++;
    }
  }

  // Count testInfo references
  for (const testPathId of testInfo.testPathIds) {
    frequencyCounts.testPaths[testPathId]++;
  }
  for (const testNameId of testInfo.testNameIds) {
    frequencyCounts.testNames[testNameId]++;
  }

  // Count testRuns references
  for (const testGroup of testRuns) {
    if (!testGroup) {
      continue;
    }

    testGroup.forEach((statusGroup, statusId) => {
      if (!statusGroup) {
        return;
      }

      frequencyCounts.statuses[statusId] += statusGroup.taskIdIds.length;

      for (const taskIdId of statusGroup.taskIdIds) {
        frequencyCounts.taskIds[taskIdId]++;
      }

      if (statusGroup.messageIds) {
        for (const messageId of statusGroup.messageIds) {
          if (messageId !== null) {
            frequencyCounts.messages[messageId]++;
          }
        }
      }

      if (statusGroup.crashSignatureIds) {
        for (const crashSigId of statusGroup.crashSignatureIds) {
          if (crashSigId !== null) {
            frequencyCounts.crashSignatures[crashSigId]++;
          }
        }
      }
    });
  }

  // Create sorted tables and index mappings (sorted by frequency descending)
  const sortedTables = {};
  const indexMaps = {};

  for (const [tableName, table] of Object.entries(tables)) {
    const counts = frequencyCounts[tableName];

    // Create array with value, oldIndex, and count
    const indexed = table.map((value, oldIndex) => ({
      value,
      oldIndex,
      count: counts[oldIndex],
    }));

    // Sort by count descending, then by value for deterministic order when counts are equal
    indexed.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.value.localeCompare(b.value);
    });

    // Extract sorted values and create mapping
    sortedTables[tableName] = indexed.map(item => item.value);
    indexMaps[tableName] = new Map(
      indexed.map((item, newIndex) => [item.oldIndex, newIndex])
    );
  }

  // Remap taskInfo indices
  // taskInfo arrays are indexed by taskIdId, and when taskIds get remapped,
  // we need to rebuild the arrays at the new indices
  const sortedTaskInfo = {
    repositoryIds: [],
    jobNameIds: [],
  };

  for (
    let oldTaskIdId = 0;
    oldTaskIdId < taskInfo.repositoryIds.length;
    oldTaskIdId++
  ) {
    const newTaskIdId = indexMaps.taskIds.get(oldTaskIdId);
    sortedTaskInfo.repositoryIds[newTaskIdId] = indexMaps.repositories.get(
      taskInfo.repositoryIds[oldTaskIdId]
    );
    sortedTaskInfo.jobNameIds[newTaskIdId] = indexMaps.jobNames.get(
      taskInfo.jobNameIds[oldTaskIdId]
    );
  }

  // Remap testInfo indices
  const sortedTestInfo = {
    testPathIds: testInfo.testPathIds.map(oldId =>
      indexMaps.testPaths.get(oldId)
    ),
    testNameIds: testInfo.testNameIds.map(oldId =>
      indexMaps.testNames.get(oldId)
    ),
  };

  // Remap testRuns indices
  const sortedTestRuns = testRuns.map(testGroup => {
    if (!testGroup) {
      return testGroup;
    }

    return testGroup.map(statusGroup => {
      if (!statusGroup) {
        return statusGroup;
      }

      const remapped = {
        taskIdIds: statusGroup.taskIdIds.map(oldId =>
          indexMaps.taskIds.get(oldId)
        ),
        durations: statusGroup.durations,
        timestamps: statusGroup.timestamps,
      };

      // Remap message IDs for SKIP status
      if (statusGroup.messageIds) {
        remapped.messageIds = statusGroup.messageIds.map(oldId =>
          oldId === null ? null : indexMaps.messages.get(oldId)
        );
      }

      // Remap crash data for CRASH status
      if (statusGroup.crashSignatureIds) {
        remapped.crashSignatureIds = statusGroup.crashSignatureIds.map(oldId =>
          oldId === null ? null : indexMaps.crashSignatures.get(oldId)
        );
      }
      if (statusGroup.minidumps) {
        remapped.minidumps = statusGroup.minidumps;
      }

      return remapped;
    });
  });

  // Remap statusId positions in testRuns (move status groups to their new positions)
  const finalTestRuns = sortedTestRuns.map(testGroup => {
    if (!testGroup) {
      return testGroup;
    }

    const remappedGroup = [];
    testGroup.forEach((statusGroup, oldStatusId) => {
      if (!statusGroup) {
        return;
      }
      const newStatusId = indexMaps.statuses.get(oldStatusId);
      remappedGroup[newStatusId] = statusGroup;
    });

    return remappedGroup;
  });

  return {
    tables: sortedTables,
    taskInfo: sortedTaskInfo,
    testInfo: sortedTestInfo,
    testRuns: finalTestRuns,
  };
}

// Create resource usage data structure
function createResourceUsageData(jobResults) {
  const jobNames = [];
  const jobNameMap = new Map();
  const repositories = [];
  const repositoryMap = new Map();
  const machineInfos = [];
  const machineInfoMap = new Map();

  // Collect all job data first
  const jobDataList = [];

  for (const result of jobResults) {
    if (!result || !result.resourceUsage) {
      continue;
    }

    // Extract chunk number from job name (e.g., "test-linux1804-64/opt-xpcshell-1" -> "test-linux1804-64/opt-xpcshell", chunk: 1)
    let jobNameBase = result.jobName;
    let chunkNumber = null;
    const match = result.jobName.match(/^(.+)-(\d+)$/);
    if (match) {
      jobNameBase = match[1];
      chunkNumber = parseInt(match[2], 10);
    }

    // Get or create job name index
    let jobNameId = jobNameMap.get(jobNameBase);
    if (jobNameId === undefined) {
      jobNameId = jobNames.length;
      jobNames.push(jobNameBase);
      jobNameMap.set(jobNameBase, jobNameId);
    }

    // Get or create repository index
    let repositoryId = repositoryMap.get(result.repository);
    if (repositoryId === undefined) {
      repositoryId = repositories.length;
      repositories.push(result.repository);
      repositoryMap.set(result.repository, repositoryId);
    }

    // Get or create machine info index
    const machineInfo = result.resourceUsage.machineInfo;
    const machineInfoKey = JSON.stringify(machineInfo);
    let machineInfoId = machineInfoMap.get(machineInfoKey);
    if (machineInfoId === undefined) {
      machineInfoId = machineInfos.length;
      machineInfos.push(machineInfo);
      machineInfoMap.set(machineInfoKey, machineInfoId);
    }

    // Combine taskId and retryId (omit .0 for retry 0)
    const taskIdString =
      result.retryId === 0
        ? result.taskId
        : `${result.taskId}.${result.retryId}`;

    jobDataList.push({
      jobNameId,
      chunk: chunkNumber,
      taskId: taskIdString,
      repositoryId,
      startTime: result.startTime,
      machineInfoId,
      maxMemory: result.resourceUsage.maxMemory,
      idleTime: result.resourceUsage.idleTime,
      singleCoreTime: result.resourceUsage.singleCoreTime,
      cpuBuckets: result.resourceUsage.cpuBuckets,
    });
  }

  // Sort by start time
  jobDataList.sort((a, b) => a.startTime - b.startTime);

  // Apply differential compression to start times and build parallel arrays
  const jobs = {
    jobNameIds: [],
    chunks: [],
    taskIds: [],
    repositoryIds: [],
    startTimes: [],
    machineInfoIds: [],
    maxMemories: [],
    idleTimes: [],
    singleCoreTimes: [],
    cpuBuckets: [],
  };

  let previousStartTime = 0;
  for (const jobData of jobDataList) {
    jobs.jobNameIds.push(jobData.jobNameId);
    jobs.chunks.push(jobData.chunk);
    jobs.taskIds.push(jobData.taskId);
    jobs.repositoryIds.push(jobData.repositoryId);

    // Differential compression: store difference from previous
    const timeDiff = jobData.startTime - previousStartTime;
    jobs.startTimes.push(timeDiff);
    previousStartTime = jobData.startTime;

    jobs.machineInfoIds.push(jobData.machineInfoId);
    jobs.maxMemories.push(jobData.maxMemory);
    jobs.idleTimes.push(jobData.idleTime);
    jobs.singleCoreTimes.push(jobData.singleCoreTime);
    jobs.cpuBuckets.push(jobData.cpuBuckets);
  }

  return {
    jobNames,
    repositories,
    machineInfos,
    jobs,
  };
}

// Helper to save a JSON file and log its size
function saveJsonFile(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data));

  const stats = fs.statSync(filePath);
  const fileSizeBytes = stats.size;

  // Use MB for files >= 1MB, otherwise KB
  if (fileSizeBytes >= 1024 * 1024) {
    const fileSizeMB = Math.round(fileSizeBytes / (1024 * 1024));
    const formattedBytes = fileSizeBytes.toLocaleString();
    console.log(
      `Saved ${filePath} - ${fileSizeMB}MB (${formattedBytes} bytes)`
    );
  } else {
    const fileSizeKB = Math.round(fileSizeBytes / 1024);
    console.log(`Saved ${filePath} - ${fileSizeKB}KB`);
  }
}

// Common function to process jobs and create data structure
async function processJobsAndCreateData(
  jobs,
  targetLabel,
  startTime,
  metadata
) {
  if (jobs.length === 0) {
    console.log(`No jobs found for ${targetLabel}.`);
    return null;
  }

  // Process jobs to extract test timings
  const jobProcessingStart = Date.now();
  const jobResults = await processJobsWithWorkers(jobs, targetLabel);
  const jobProcessingTime = Date.now() - jobProcessingStart;
  console.log(
    `Successfully processed ${jobResults.length} jobs in ${jobProcessingTime}ms`
  );

  // Create efficient data tables
  const dataTablesStart = Date.now();
  let dataStructure = createDataTables(jobResults);
  const dataTablesTime = Date.now() - dataTablesStart;
  console.log(`Created data tables in ${dataTablesTime}ms:`);

  // Check if any test runs were extracted
  const hasTestRuns = !!dataStructure.testRuns.length;
  if (!hasTestRuns) {
    console.log(`No test run data extracted for ${targetLabel}`);
    return null;
  }

  const totalRuns = dataStructure.testRuns.reduce((sum, testGroup) => {
    if (!testGroup) {
      return sum;
    }
    return (
      sum +
      testGroup.reduce(
        (testSum, statusGroup) =>
          testSum + (statusGroup ? statusGroup.taskIdIds.length : 0),
        0
      )
    );
  }, 0);
  console.log(
    `  ${dataStructure.testInfo.testPathIds.length} tests, ${totalRuns} runs, ${dataStructure.tables.taskIds.length} tasks, ${dataStructure.tables.jobNames.length} job names, ${dataStructure.tables.statuses.length} statuses`
  );

  // Sort string tables by frequency for deterministic output and better compression
  const sortingStart = Date.now();
  dataStructure = sortStringTablesByFrequency(dataStructure);
  const sortingTime = Date.now() - sortingStart;
  console.log(`Sorted string tables by frequency in ${sortingTime}ms`);

  // Convert absolute timestamps to relative and apply differential compression (in place)
  for (const testGroup of dataStructure.testRuns) {
    if (!testGroup) {
      continue;
    }

    for (const statusGroup of testGroup) {
      if (!statusGroup) {
        continue;
      }

      // Convert timestamps to relative in place
      for (let i = 0; i < statusGroup.timestamps.length; i++) {
        statusGroup.timestamps[i] =
          Math.floor(statusGroup.timestamps[i] / 1000) - startTime;
      }

      // Map to array of objects including crash data if present
      const runs = statusGroup.timestamps.map((ts, i) => {
        const run = {
          timestamp: ts,
          taskIdId: statusGroup.taskIdIds[i],
          duration: statusGroup.durations[i],
        };
        // Include crash data if this is a CRASH status group
        if (statusGroup.crashSignatureIds) {
          run.crashSignatureId = statusGroup.crashSignatureIds[i];
        }
        if (statusGroup.minidumps) {
          run.minidump = statusGroup.minidumps[i];
        }
        // Include message data if this is a SKIP status group
        if (statusGroup.messageIds) {
          run.messageId = statusGroup.messageIds[i];
        }
        return run;
      });

      // Sort by timestamp
      runs.sort((a, b) => a.timestamp - b.timestamp);

      // Apply differential compression in place for timestamps
      let previousTimestamp = 0;
      for (const run of runs) {
        const currentTimestamp = run.timestamp;
        run.timestamp = currentTimestamp - previousTimestamp;
        previousTimestamp = currentTimestamp;
      }

      // Update in place
      statusGroup.taskIdIds = runs.map(run => run.taskIdId);
      statusGroup.durations = runs.map(run => run.duration);
      statusGroup.timestamps = runs.map(run => run.timestamp);
      // Update crash data arrays if present
      if (statusGroup.crashSignatureIds) {
        statusGroup.crashSignatureIds = runs.map(run => run.crashSignatureId);
      }
      if (statusGroup.minidumps) {
        statusGroup.minidumps = runs.map(run => run.minidump);
      }
      // Update message data arrays if present
      if (statusGroup.messageIds) {
        statusGroup.messageIds = runs.map(run => run.messageId);
      }
    }
  }

  // Build output with metadata
  return {
    testData: {
      metadata: {
        ...metadata,
        startTime,
        generatedAt: new Date().toISOString(),
        jobCount: jobs.length,
        processedJobCount: jobResults.length,
      },
      tables: dataStructure.tables,
      taskInfo: dataStructure.taskInfo,
      testInfo: dataStructure.testInfo,
      testRuns: dataStructure.testRuns,
    },
    resourceData: createResourceUsageData(jobResults),
  };
}

async function processRevisionData(project, revision, forceRefetch = false) {
  console.log(`Fetching xpcshell test data for ${project}:${revision}`);
  console.log(`=== Processing ${project}:${revision} ===`);

  const cacheFile = path.join(
    OUTPUT_DIR,
    `xpcshell-${project}-${revision}.json`
  );

  // Check if we already have data for this revision
  if (fs.existsSync(cacheFile) && !forceRefetch) {
    console.log(`Data for ${project}:${revision} already exists. Skipping.`);
    return null;
  }

  if (forceRefetch) {
    console.log(
      `Force flag detected, re-fetching data for ${project}:${revision}...`
    );
  }

  try {
    // Fetch push ID from revision
    const pushId = await fetchCommitData(project, revision);

    // Fetch jobs for the push
    const jobs = await fetchPushJobs(project, pushId);

    if (jobs.length === 0) {
      console.log(`No xpcshell jobs found for ${project}:${revision}.`);
      return null;
    }

    // Use the last_modified time of the first job as start time
    const startTime = jobs.length
      ? Math.floor(new Date(jobs[0].start_time).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const output = await processJobsAndCreateData(
      jobs,
      `${project}-${revision}`,
      startTime,
      {
        project,
        revision,
        pushId,
      }
    );

    if (!output) {
      return null;
    }

    saveJsonFile(output.testData, cacheFile);
    const resourceCacheFile = path.join(
      OUTPUT_DIR,
      `xpcshell-${project}-${revision}-resources.json`
    );
    saveJsonFile(output.resourceData, resourceCacheFile);

    return output;
  } catch (error) {
    console.error(`Error processing ${project}:${revision}:`, error);
    return null;
  }
}

// Fetch previous run metadata from Taskcluster
async function fetchPreviousRunData() {
  try {
    // Fetch task info for the current task to get the index name from the routes.
    const taskUrl = `${TASKCLUSTER_BASE_URL}/api/queue/v1/task/${process.env.TASK_ID}`;
    const taskData = await fetchJson(taskUrl);
    if (!taskData) {
      console.log(`Failed to fetch task info from ${taskUrl}`);
      return;
    }

    const routes = taskData.routes || [];
    // Find a route that starts with "index." and contains ".latest."
    const latestRoute = routes.find(
      route => route.startsWith("index.") && route.includes(".latest.")
    );
    if (!latestRoute) {
      console.log(
        `No route found with 'index.' prefix and '.latest.' in name. Available routes: ${JSON.stringify(routes)}`
      );
      return;
    }

    // Remove "index." prefix from route to get index name
    const indexName = latestRoute.replace(/^index\./, "");
    console.log(`Using index: ${indexName}`);

    // Store artifacts URL for later use by processDateData
    const artifactsUrl = `${TASKCLUSTER_BASE_URL}/api/index/v1/task/${indexName}/artifacts/public`;

    // Fetch the index.json from the previous run
    const indexUrl = `${artifactsUrl}/index.json`;
    console.log(`Fetching previous run data from ${indexUrl}`);
    const indexData = await fetchJson(indexUrl);
    if (!indexData) {
      console.log(`Failed to fetch index.json from ${indexUrl}`);
      return;
    }

    const dates = indexData.dates || [];

    console.log(`Found ${dates.length} dates in previous run`);

    previousRunData = {
      dates: new Set(dates),
      artifactsUrl,
    };

    console.log("Previous run metadata loaded\n");
  } catch (error) {
    console.log(`Error fetching previous run metadata: ${error.message}`);
  }
}

// Process data for a single date
async function processDateData(targetDate, forceRefetch = false) {
  const timingsFilename = `xpcshell-${targetDate}.json`;
  const resourcesFilename = `xpcshell-${targetDate}-resources.json`;
  const timingsPath = path.join(OUTPUT_DIR, timingsFilename);
  const resourcesPath = path.join(OUTPUT_DIR, resourcesFilename);

  // Check if we already have data for this date
  if (fs.existsSync(timingsPath) && !forceRefetch) {
    console.log(`Data for ${targetDate} already exists. Skipping.`);
    return;
  }

  // Fetch jobs list first (needed for verification)
  let jobs;
  try {
    jobs = await fetchXpcshellData(targetDate);
    if (jobs.length === 0) {
      console.log(`No jobs found for ${targetDate}.`);
      return;
    }
  } catch (error) {
    console.error(`Error fetching jobs for ${targetDate}:`, error);
    return;
  }

  // Try to fetch from previous run if available and not forcing refetch
  if (
    !forceRefetch &&
    previousRunData &&
    previousRunData.dates.has(targetDate)
  ) {
    try {
      const [timings, resources] = await Promise.all([
        fetchJson(`${previousRunData.artifactsUrl}/${timingsFilename}`),
        fetchJson(`${previousRunData.artifactsUrl}/${resourcesFilename}`),
      ]);

      if (timings && resources) {
        const expectedJobCount = jobs.length;
        const actualProcessedCount = timings.metadata?.processedJobCount;

        if (actualProcessedCount < expectedJobCount) {
          const missingJobs = expectedJobCount - actualProcessedCount;
          console.log(
            `Ignoring artifact from previous run: missing ${missingJobs} jobs (expected ${expectedJobCount}, got ${actualProcessedCount})`
          );
        } else {
          console.log(`Fetched valid artifact from previous run.`);
          saveJsonFile(timings, timingsPath);
          saveJsonFile(resources, resourcesPath);
          return;
        }
      } else {
        console.log(
          `Error fetching artifact from previous run: artifact not found`
        );
      }
    } catch (error) {
      console.log(
        `Error fetching artifact from previous run: ${error.message}`
      );
    }
  }

  if (forceRefetch) {
    console.log(`Force flag detected, re-fetching data for ${targetDate}...`);
  }

  try {
    // Calculate start of day timestamp for relative time calculation
    const startOfDay = new Date(targetDate + "T00:00:00.000Z");
    const startTime = Math.floor(startOfDay.getTime() / 1000); // Convert to seconds

    const output = await processJobsAndCreateData(jobs, targetDate, startTime, {
      date: targetDate,
    });
    if (!output) {
      return;
    }

    saveJsonFile(output.testData, timingsPath);
    saveJsonFile(output.resourceData, resourcesPath);
  } catch (error) {
    console.error(`Error processing ${targetDate}:`, error);
  }
}

async function main() {
  const forceRefetch = process.argv.includes("--force");

  // Check for --days parameter
  let numDays = 3;
  const daysIndex = process.argv.findIndex(arg => arg === "--days");
  if (daysIndex !== -1 && daysIndex + 1 < process.argv.length) {
    const daysValue = parseInt(process.argv[daysIndex + 1]);
    if (!isNaN(daysValue) && daysValue > 0 && daysValue <= 30) {
      numDays = daysValue;
    } else {
      console.error("Error: --days must be a number between 1 and 30");
      process.exit(1);
    }
  }

  if (process.env.TASK_ID) {
    await fetchPreviousRunData();
  }

  // Check for --revision parameter (format: project:revision)
  const revisionIndex = process.argv.findIndex(arg => arg === "--revision");
  if (revisionIndex !== -1 && revisionIndex + 1 < process.argv.length) {
    const revisionArg = process.argv[revisionIndex + 1];
    const parts = revisionArg.split(":");

    if (parts.length !== 2) {
      console.error(
        "Error: --revision must be in format project:revision (e.g., try:abc123 or autoland:def456)"
      );
      process.exit(1);
    }

    const [project, revision] = parts;
    const output = await processRevisionData(project, revision, forceRefetch);

    if (output) {
      console.log("Successfully processed revision data.");
    } else {
      console.log("\nNo data was successfully processed.");
    }
    return;
  }

  // Check for --try option (shortcut for --revision try:...)
  const tryIndex = process.argv.findIndex(arg => arg === "--try");
  if (tryIndex !== -1 && tryIndex + 1 < process.argv.length) {
    const revision = process.argv[tryIndex + 1];
    const output = await processRevisionData("try", revision, forceRefetch);

    if (output) {
      console.log("Successfully processed try commit data.");
    } else {
      console.log("\nNo data was successfully processed.");
    }
    return;
  }

  // Fetch data for the specified number of days
  const dates = [];
  for (let i = 1; i <= numDays; i++) {
    dates.push(getDateString(i));
  }

  console.log(
    `Fetching xpcshell test data for the last ${numDays} day${numDays > 1 ? "s" : ""}: ${dates.join(", ")}`
  );

  for (const date of dates) {
    console.log(`\n=== Processing ${date} ===`);
    await processDateData(date, forceRefetch);
  }

  // Create index file with available dates
  const indexFile = path.join(OUTPUT_DIR, "index.json");
  const availableDates = [];

  // Scan for all xpcshell-*.json files in the output directory
  const files = fs.readdirSync(OUTPUT_DIR);
  files.forEach(file => {
    const match = file.match(/^xpcshell-(\d{4}-\d{2}-\d{2})\.json$/);
    if (match) {
      availableDates.push(match[1]);
    }
  });

  // Sort dates in descending order (newest first)
  availableDates.sort((a, b) => b.localeCompare(a));

  fs.writeFileSync(
    indexFile,
    JSON.stringify({ dates: availableDates }, null, 2)
  );
  console.log(
    `\nIndex file saved as ${indexFile} with ${availableDates.length} dates`
  );
}

main().catch(console.error);
