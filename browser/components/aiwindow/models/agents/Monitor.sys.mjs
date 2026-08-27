/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  FEATURE_MAJOR_VERSIONS,
  MODEL_FEATURES,
  openAIEngine,
  renderPrompt,
  makeJSONSchemaBlob,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import { Schedule } from "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  buildConversation:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  loadPrompt:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  GetPageContent: "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs",
  MonitorAgent:
    "moz-src:///browser/components/aiwindow/models/agents/MonitorAgent.sys.mjs",
  ScheduledTask: "resource://gre/modules/ScheduledTask.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    prefix: "MonitorAgent",
    maxLogLevelPref: "browser.smartwindow.monitorAgent.logLevel",
  })
);

// TODO: Move these constants to RS: https://bugzilla.mozilla.org/show_bug.cgi?id=2054153
export const MAX_HISTORY_ENTRIES = 30;
const MONITOR_RUN_TIMEOUT_MS = 5 * 60 * 1000;
export const TOTAL_NUM_MONITORS = 5;
export const TOTAL_NUM_URLS_IN_MONITOR = 5;
export const MONITOR_PROMPT_VERSION = String(
  FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.AGENT_MONITOR]
);

// For observers, the topic is "smartwindow-monitor-agents-changed" and the subject is an array of all monitors in their serializable form.
export const MONITOR_AGENTS_CHANGED_TOPIC =
  "smartwindow-monitor-agents-changed";

const MONITOR_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["explanation", "conditionMet"],
  properties: {
    explanation: { type: "string" },
    conditionMet: { type: "boolean" },
  },
};

/**
 * Individual monitor state and behavior.
 *
 * Monitors are responsible for running their individual monitor checks on a schedule,
 * invoking the language model with the monitor prompt and page content,
 * and recording the results in the monitor history.
 *
 * They are managed by Monitor Agent and they are a feature that allows a user to monitor
 * a set of URLs for changes or conditions and get notified when those conditions are met.
 */
export class Monitor {
  #timer = null;
  #running = false;
  #disposed = false;
  #abortController = null;

  /**
   * @param {object} options
   * @param {string} [options.id] - Unique monitor ID.
   * @param {string} options.title - Title of the monitor, for display purposes.
   * @param {string} options.monitorPrompt - The user's monitoring prompt.
   * @param {string[]} options.watchUrls - URLs of the pages being monitored.
   * @param {Schedule} options.schedule - Schedule config.
   * @param {boolean} [options.enabled] - Whether the monitor should run.
   * @param {boolean} [options.notificationsMuted] - Whether desktop
   *   notifications are suppressed while the monitor keeps running.
   * @param {string} [options.createdAt] - Creation timestamp.
   * @param {string} [options.updatedAt] - Last update timestamp.
   * @param {string} [options.lastRunTime] - Last run timestamp.
   * @param {string} [options.nextRunTime] - Next run timestamp.
   * @param {object[]} [options.history] - Saved monitor history entries.
   */
  constructor({
    id = crypto.randomUUID(),
    title = "",
    monitorPrompt,
    watchUrls,
    schedule,
    enabled = true,
    notificationsMuted = false,
    createdAt,
    updatedAt,
    lastRunTime,
    nextRunTime,
    history = [],
  } = {}) {
    // validate the schedule is an actual schedule object and not a serialized object
    if (!schedule?.getNextRunTime) {
      throw new Error("Monitor schedule is invalid.");
    }

    const now = new Date().toISOString();
    createdAt ??= now;
    updatedAt ??= createdAt;
    lastRunTime ??= createdAt;

    this.id = id;
    this.title = String(title ?? "").trim();
    this.monitorPrompt = String(monitorPrompt ?? "").trim();
    this.watchUrls = trimAndFilterWatchUrls(watchUrls);
    this.schedule = schedule;
    this.enabled = enabled;
    this.notificationsMuted = !!notificationsMuted;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.lastRunTime = lastRunTime;
    this.nextRunTime =
      nextRunTime ?? schedule.getNextRunTime(lastRunTime).toISOString();
    this.history = Array.isArray(history) ? history : [];

    // final verification that the monitor is valid
    if (!this.id || !this.monitorPrompt || !this.watchUrls.length) {
      throw new Error("Monitor is invalid.");
    }
  }

  /**
   * @param {object} savedMonitor - Serialized monitor data.
   * @returns {Monitor}
   */
  static fromJSON(savedMonitor) {
    if (!savedMonitor?.id) {
      throw new Error("Monitor is invalid.");
    }

    return new Monitor({
      id: savedMonitor.id,
      title: savedMonitor.title,
      monitorPrompt: savedMonitor.monitorPrompt,
      watchUrls: savedMonitor.watchUrls,
      schedule: Schedule.fromJSON(savedMonitor.schedule),
      enabled: savedMonitor.enabled,
      notificationsMuted: savedMonitor.notificationsMuted,
      createdAt: savedMonitor.createdAt,
      updatedAt: savedMonitor.updatedAt,
      lastRunTime: savedMonitor.lastRunTime,
      nextRunTime: savedMonitor.nextRunTime,
      history: normalizeLoadedHistory(savedMonitor.history),
    });
  }

  /**
   * Run the monitor check when manually requested or when the scheduled time has come.
   *
   * @param {object} options
   * @param {boolean} [options.manual] - Whether this run was manually requested.
   * @param {number} [options.timeoutMs] - Run timeout.
   * @returns {Promise<void>}
   */
  async run({ manual = false, timeoutMs = MONITOR_RUN_TIMEOUT_MS } = {}) {
    // if the monitor is disposed, don't run it
    if (this.#disposed) {
      return;
    }

    // if the monitor is disabled or it is not time to run, don't run it unless it's a manual run
    const checkedAt = new Date();
    if (!manual) {
      if (!this.enabled || new Date(this.nextRunTime) > checkedAt) {
        this.scheduleNextRun();
        return;
      }
    }

    // make sure that a run is not already in progress, otherwise we would have overlapping runs
    // may happen with manual runs or if the previous run took longer than the schedule interval
    if (this.#running) {
      return;
    }

    this.#running = true;
    const historyEntry = {
      id: crypto.randomUUID(),
      checkedAt: checkedAt.toISOString(),
      status: "running",
      resultExplanation: "",
      conditionMet: false,
    };
    this.addHistoryEntry(historyEntry);
    this.updatedAt = checkedAt.toISOString();

    let result = null;
    let checkPromise = null;
    let timedOut = false;
    const abortController = new AbortController();
    this.#abortController = abortController;
    try {
      // save the running state to disk
      await lazy.MonitorAgent._saveAndNotify(this);

      // run the monitor check with a timeout and abort signal
      checkPromise = this.runMonitorCheck({
        flowId: this.id,
        now: checkedAt,
        signal: abortController.signal,
      });

      // if the checkPromise times out, abort the monitor check and mark it as timed out
      result = await withTimeout(checkPromise, timeoutMs, () => {
        timedOut = true;
        abortController.abort(new Error("Monitor check timed out."));
      });

      // record the result of the monitor check in the history entry
      historyEntry.status = "success";
      historyEntry.resultExplanation = result.explanation;
      historyEntry.conditionMet = result.conditionMet;
    } catch (error) {
      historyEntry.status = "error";
      historyEntry.resultExplanation = error.message || String(error);
    } finally {
      this.lastRunTime = checkedAt.toISOString();
      this.nextRunTime = this.schedule
        .getNextRunTime(this.lastRunTime)
        .toISOString();
      this.updatedAt = new Date().toISOString();

      // save the updated monitor state to disk and notify observers, even if the run failed or timed out
      try {
        await lazy.MonitorAgent._saveAndNotify(this);
      } finally {
        // if the run timed out, we need to make sure to abort the monitor check and finish the run
        if (timedOut && checkPromise) {
          checkPromise.catch(() => {});
        }
        this.#finishRun(abortController);
        recordMonitorRunTelemetry(
          this,
          manual,
          MONITOR_PROMPT_VERSION,
          historyEntry.status === "error",
          historyEntry.status === "error"
            ? categorizeError(historyEntry.resultExplanation)
            : null
        );
      }
    }
  }

  /**
   * Run the monitor check by invoking the language model with the monitor prompt and the latest page content.
   *
   * @param {object} [options]
   * @param {string} [options.flowId] - Monitor conversation flow ID.
   * @param {Date} [options.now] - Monitor check time.
   * @param {AbortSignal} [options.signal] - Signal for monitor-layer aborts.
   * @returns {Promise<{ explanation: string, conditionMet: boolean }>}
   */
  async runMonitorCheck({
    flowId = null,
    now = new Date(),
    signal = null,
  } = {}) {
    throwIfAborted(signal);
    const conversation = await lazy.buildConversation(
      MODEL_FEATURES.AGENT_MONITOR,
      { flowId }
    );

    const pageContent = await extractMonitorPageContent(
      this.watchUrls,
      conversation,
      {
        signal,
      }
    );
    throwIfAborted(signal);

    const [
      { prompt: monitorAgentSystemPrompt },
      { prompt: monitorAgentUserPrompt },
    ] = await Promise.all([
      lazy.loadPrompt(MODEL_FEATURES.AGENT_MONITOR, {
        module: "system-instructions",
      }),
      lazy.loadPrompt(MODEL_FEATURES.AGENT_MONITOR, { module: "user-data" }),
    ]);

    const systemPrompt = renderPrompt(monitorAgentSystemPrompt, {
      monitorPrompt: this.monitorPrompt,
    });
    const userPrompt = renderPrompt(monitorAgentUserPrompt, {
      pageUrls: this.watchUrls.join("\n - "),
      checkedAt: now.toISOString(),
      pageContent,
    });

    // add messages to the conversation
    conversation.setSystemMessage(systemPrompt);
    conversation.addUserMessage(userPrompt);

    // run the conversation
    const response = await withAbortSignal(
      conversation.run({
        fxAccountToken: await withAbortSignal(
          openAIEngine.getFxAccountToken(),
          signal
        ),
        inferenceParams: {
          response_format: makeJSONSchemaBlob(
            "MonitorResult",
            MONITOR_RESULT_SCHEMA
          ),
        },
        tools: [],
      }),
      signal
    );

    // parse and return the result
    throwIfAborted(signal);
    return this.parseMonitorResult(response);
  }

  /**
   * Schedule the next run of the monitor based on the schedule and last run time
   * If the monitor is disabled or disposed, do not schedule a run.
   */
  scheduleNextRun() {
    this.clearTimer();
    if (this.#disposed || !this.enabled) {
      return;
    }

    // if nextRunTime is missing or invalid, compute it from lastRunTime and the schedule.
    let nextRun = this.nextRunTime ? new Date(this.nextRunTime) : null;
    if (!nextRun || Number.isNaN(nextRun.getTime())) {
      this.nextRunTime = this.schedule
        .getNextRunTime(this.lastRunTime)
        .toISOString();
      nextRun = new Date(this.nextRunTime);
    }

    this.#timer = new lazy.ScheduledTask(
      async () => {
        this.#timer = null;
        try {
          await this.run();
        } catch (error) {
          lazy.log.error(error);
        }
      },
      Math.max(Date.now() + 1000, nextRun.getTime())
    ).arm();
  }

  /**
   * Parse the structured monitor result from a model response. Falls back to a
   * not-met result using the raw text when the JSON can't be parsed.
   *
   * @param {object} response
   * @returns {{ explanation: string, conditionMet: boolean }}
   */
  parseMonitorResult(response) {
    // extracts results if wrapped with ```json ``` code fences, otherwise returns the raw text
    const raw = response?.finalOutput?.trim() ?? "";
    const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const payload = fenced ? fenced[1].trim() : raw;

    try {
      const parsed = JSON.parse(payload);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        typeof parsed.explanation !== "string" ||
        typeof parsed.conditionMet !== "boolean"
      ) {
        throw new Error("Invalid monitor result shape.");
      }

      return {
        explanation: parsed.explanation.trim(),
        conditionMet: parsed.conditionMet,
      };
    } catch {
      return {
        explanation:
          raw ||
          "The monitor check completed, but no model response was returned.",
        conditionMet: false,
      };
    }
  }

  /**
   * Plain, deeply-copied snapshot of the monitor for callers and observers.
   *
   * @returns {object}
   */
  toSerializable() {
    return {
      id: this.id,
      title: this.title,
      monitorPrompt: this.monitorPrompt,
      watchUrls: this.watchUrls.slice(),
      schedule: { ...this.schedule },
      enabled: this.enabled,
      notificationsMuted: this.notificationsMuted,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastRunTime: this.lastRunTime,
      nextRunTime: this.nextRunTime,
      history: this.history.map(entry => ({ ...entry })),
    };
  }

  clearTimer() {
    if (this.#timer) {
      this.#timer.disarm();
      this.#timer = null;
    }
  }

  dispose() {
    this.#disposed = true;
    this.#abortController?.abort(new Error("Monitor check aborted."));
    this.clearTimer();
  }

  restore() {
    this.#disposed = false;
  }

  addHistoryEntry(entry) {
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY_ENTRIES) {
      this.history.shift();
    }
  }

  #finishRun(abortController) {
    if (this.#abortController === abortController) {
      this.#abortController = null;
    }
    this.#running = false;
    if (!this.#disposed && this.enabled) {
      this.scheduleNextRun();
    }
  }
}

// time out and abort helpers for monitor runs

function throwIfAborted(signal) {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason instanceof Error
    ? signal.reason
    : new Error("Monitor check aborted.");
}

async function withAbortSignal(promise, signal) {
  if (!signal) {
    return promise;
  }

  throwIfAborted(signal);

  let onAbort;
  const abortPromise = new Promise((_resolve, reject) => {
    onAbort = () => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Monitor check aborted.")
      );
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function withTimeout(promise, timeoutMs, onTimeout = null) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId = null;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutId = lazy.setTimeout(() => {
      timeoutId = null;
      const error = new Error("Monitor check timed out.");
      error.name = "TimeoutError";
      onTimeout?.();
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      lazy.clearTimeout(timeoutId);
    }
  }
}

// A "running" entry that survived to a reload means the run was interrupted
// (crash, shutdown) before it could finish, so reconcile it to an error.
function normalizeLoadedHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }
  return history.map(entry => {
    if (entry?.status !== "running") {
      return entry;
    }
    return {
      ...entry,
      status: "error",
      resultExplanation: "Monitor check was interrupted before it finished.",
      conditionMet: false,
    };
  });
}

async function extractMonitorPageContent(
  urls,
  conversation,
  { signal = null } = {}
) {
  throwIfAborted(signal);
  const pageContents = await withAbortSignal(
    lazy.GetPageContent.getPageContent({ url_list: urls }, conversation),
    signal
  );
  throwIfAborted(signal);

  return Array.isArray(pageContents)
    ? pageContents.join("\n\n<----- PAGE BREAK ---->\n\n")
    : pageContents;
}

export function trimAndFilterWatchUrls(urls) {
  if (!Array.isArray(urls)) {
    return [];
  }
  if (urls.length > TOTAL_NUM_URLS_IN_MONITOR) {
    throw new Error(
      `Cannot watch more than ${TOTAL_NUM_URLS_IN_MONITOR} URLs in a monitor.`
    );
  }
  return urls.map(url => String(url ?? "").trim()).filter(isAllowedWatchUrl);
}

export function isAllowedWatchUrl(urlString) {
  const url = URL.parse(urlString);
  return !!url && ["http:", "https:"].includes(url.protocol);
}

function recordMonitorRunTelemetry(
  monitor,
  manual,
  promptVersion,
  failed,
  errorCode = null
) {
  const extra = {
    monitors: lazy.MonitorAgent._monitorCountForTelemetry(),
    urls: monitor.watchUrls.length,
    length: monitor.monitorPrompt.length,
    age: monitorAgeMs(monitor),
    schedule_type: monitor.schedule.type,
    prompt_version: promptVersion,
    enabled: monitor.enabled,
  };

  // Record run type (manual vs scheduled)
  if (manual) {
    Glean.smartWindow.monitorRunManual.record(extra);
  } else {
    Glean.smartWindow.monitorRunScheduled.record(extra);
  }

  // Record completion with success/failure status
  const completeExtra = {
    ...extra,
    success: !failed,
  };
  if (failed && errorCode) {
    completeExtra.error_code = errorCode;
  }
  Glean.smartWindow.monitorComplete.record(completeExtra);
}

export function monitorAgeMs(monitor) {
  const createdAt = Date.parse(monitor.createdAt);
  return Number.isFinite(createdAt) ? Math.max(0, Date.now() - createdAt) : 0;
}

/**
 * Categorizes an error into a safe, predefined code for telemetry.
 *
 * Raw error messages are never returned to avoid accidentally including
 * sensitive information in telemetry.
 *
 * @param {Error|string} error - The error to categorize.
 * @returns {string} A safe telemetry error code.
 */
export function categorizeError(error) {
  const message = (error?.message ?? String(error)).toLowerCase();

  const categories = [
    ["network_error", ["network", "fetch failed", "failed to connect"]],
    ["timeout", ["timeout"]],
    ["rate_limit", ["rate limit", "quota"]],
    ["auth_error", ["authentication", "unauthorized"]],
    ["content_extraction_error", ["extract", "parse"]],
    ["interrupted", ["interrupt", "abort"]],
    ["model_error", ["model api", "api error", "api endpoint"]],
  ];

  for (const [code, patterns] of categories) {
    if (patterns.some(pattern => message.includes(pattern))) {
      return code;
    }
  }

  return "unknown_error";
}
