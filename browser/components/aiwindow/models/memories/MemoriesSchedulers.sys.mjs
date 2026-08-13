/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setInterval: "resource://gre/modules/Timer.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  MemoriesManager:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs",
  getRecentChats:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesChatSource.sys.mjs",
  HISTORY:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesConstants.sys.mjs",
  CONVERSATION:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesConstants.sys.mjs",
  openAIEngine: "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", function () {
  return console.createInstance({
    prefix: "MemoriesSchedulers",
    maxLogLevelPref: "browser.smartwindow.memoriesLogLevel",
  });
});

// Scheduler tick every 2 mins.
const MEMORIES_SCHEDULER_INTERVAL_MS = 2 * 60 * 1000;

// Cooldown period - don't run more than once every 4 hours.
const MEMORIES_SCHEDULER_COOLDOWN_MS = Services.prefs.getIntPref(
  "browser.smartwindow.memoriesSchedulerCooldownInMs",
  4 * 60 * 60 * 1000
);

// Shorter back-off for transient (non-429) failures - retry sooner.
const MEMORIES_SCHEDULER_TRANSIENT_BACKOFF_MS = Services.prefs.getIntPref(
  "browser.smartwindow.memoriesSchedulerTransientBackoffInMs",
  15 * 60 * 1000
);

// Minimum recent visits (over the lookback window) required before browsing is
// worth processing at all.
const MIN_RECENT_VISITS = 10;
const MIN_RECENT_VISITS_DAYS = 60;

/**
 * Unified scheduler for memory generation from browsing AND chat activity.
 *
 * A single 2-minute interval evaluates one combined trigger: run the unified
 * session pipeline ({@link MemoriesManager.generateMemoriesFromSessions}) when
 * the cooldown has elapsed and EITHER enough new pages have been visited
 * (browsing, if enabled) OR enough new chat messages have accumulated
 * (conversation, if enabled). Each trigger is gated by its enablement pref, so
 * a chat-only or browsing-only user fires only on the relevant signal.
 *
 * Cooldown is keyed off the single session-memory watermark, so the two
 * modalities no longer run on independent clocks.
 *
 * Public entry points are the static {@link maybeRunAndSchedule} and
 * {@link stop}; they manage a single instance.
 */
export class MemoriesSchedulers {
  #pagesVisited = 0;
  #intervalHandle = 0;
  #destroyed = false;
  #running = false;
  // Earliest time we'll attempt a run again after a budget-exceeded failure.
  // In-memory only: a browser restart resets this.
  #backoffUntilMs = 0;

  /** @type {MemoriesSchedulers | null} */
  static #instance = null;

  /**
   * Entry point to be called when an AI window becomes active. Starts (or
   * reuses) the scheduler if either memories source is enabled.
   *
   * @returns {MemoriesSchedulers|null}
   *          The scheduler instance if enabled, otherwise null.
   */
  static maybeRunAndSchedule() {
    if (!MemoriesSchedulers.#anySourceEnabled()) {
      return null;
    }
    if (!this.#instance) {
      this.#instance = new MemoriesSchedulers();
    }
    return this.#instance;
  }

  /**
   * Tears down the running scheduler, if any.
   */
  static stop() {
    this.#instance?.destroy();
  }

  static #anySourceEnabled() {
    return (
      lazy.MemoriesManager.shouldEnableMemoriesFromSchedulers(lazy.HISTORY) ||
      lazy.MemoriesManager.shouldEnableMemoriesFromSchedulers(lazy.CONVERSATION)
    );
  }

  /**
   * Creates a new scheduler instance.
   *
   * - Subscribes to Places "page-visited" notifications (browsing trigger).
   * - Runs immediately on first run, otherwise starts the interval timer.
   */
  constructor() {
    lazy.PlacesUtils.observers.addListener(
      ["page-visited"],
      this.#onPageVisited
    );
    void this.#init();
    lazy.console.debug("Initialized");
  }

  async #init() {
    if (!MemoriesSchedulers.#anySourceEnabled()) {
      return;
    }

    const lastMemoryTs =
      (await lazy.MemoriesManager.getLastSessionMemoryTimestamp()) ?? 0;
    const isFirstRun = lastMemoryTs === 0;

    if (isFirstRun) {
      lazy.console.debug("First run detected; running immediately.");
      // #onInterval's finally will start the interval.
      await this.#onInterval();
    } else {
      this.#startInterval();
    }
  }

  #startInterval() {
    if (this.#intervalHandle) {
      throw new Error(
        "Attempting to start an interval when one already existed"
      );
    }
    this.#intervalHandle = lazy.setInterval(
      this.#onInterval,
      MEMORIES_SCHEDULER_INTERVAL_MS
    );
  }

  #stopInterval() {
    if (this.#intervalHandle) {
      lazy.clearInterval(this.#intervalHandle);
      this.#intervalHandle = 0;
    }
  }

  /**
   * Places "page-visited" observer callback. Increments the counter of pages
   * visited since the last successful run (browsing trigger signal).
   */
  #onPageVisited = () => {
    this.#pagesVisited++;
  };

  /**
   * Decides whether the combined trigger is met for this tick.
   *
   * @param {boolean} historyEnabled
   * @param {boolean} conversationEnabled
   * @param {number} lastMemoryTs    Unified watermark in ms (0 on first run)
   * @param {boolean} isFirstRun
   * @returns {Promise<boolean>}
   */
  async #shouldRun(
    historyEnabled,
    conversationEnabled,
    lastMemoryTs,
    isFirstRun
  ) {
    if (historyEnabled) {
      if (isFirstRun) {
        // First run has no `#pagesVisited` delta yet: gate the existing history
        // backlog on `MIN_RECENT_VISITS` so we don't sessionize a near-empty
        // profile. This 60-day count is meaningful only here.
        const recentVisitCount = await lazy.MemoriesManager.countRecentVisits({
          days: MIN_RECENT_VISITS_DAYS,
        });
        if (recentVisitCount >= MIN_RECENT_VISITS) {
          lazy.console.debug(
            `Browsing trigger met on first run (recentVisits=${recentVisitCount}).`
          );
          return true;
        }
      } else if (this.#pagesVisited > 0) {
        // Subsequent runs: any new page visited since the last run. The
        // watermark + gate decide what is actually worth processing.
        lazy.console.debug(
          `Browsing trigger met (pagesVisited=${this.#pagesVisited}).`
        );
        return true;
      }
    }

    if (conversationEnabled) {
      // Any new chat message since the watermark is enough to consider a run;
      // the gate drops trivial chat-only sessions at no LLM cost.
      const chatMessagesSinceLastMemory =
        await lazy.getRecentChats(lastMemoryTs);
      if (chatMessagesSinceLastMemory.length) {
        lazy.console.debug(
          `Chat trigger met (newMessages=${chatMessagesSinceLastMemory.length}).`
        );
        return true;
      }
    }

    return false;
  }

  #onInterval = async () => {
    if (this.#destroyed) {
      lazy.console.warn("Interval fired after destroy; ignoring.");
      return;
    }

    // Re-check gating conditions on every tick (AIWindow may have closed, prefs
    // may have changed).
    const historyEnabled =
      lazy.MemoriesManager.shouldEnableMemoriesFromSchedulers(lazy.HISTORY);
    const conversationEnabled =
      lazy.MemoriesManager.shouldEnableMemoriesFromSchedulers(
        lazy.CONVERSATION
      );
    if (!historyEnabled && !conversationEnabled) {
      lazy.console.debug(
        "Memories schedulers no longer enabled; stopping scheduler."
      );
      this.destroy();
      return;
    }

    if (this.#running) {
      lazy.console.debug(
        "Skipping run because a previous run is still in progress."
      );
      return;
    }

    if (this.#backoffUntilMs && Date.now() < this.#backoffUntilMs) {
      const remainingMin = Math.ceil(
        (this.#backoffUntilMs - Date.now()) / (60 * 1000)
      );
      lazy.console.debug(
        `In budget-exceeded backoff for another ${remainingMin}m; skipping.`
      );
      return;
    }

    this.#running = true;
    this.#stopInterval();

    try {
      const lastMemoryTs =
        (await lazy.MemoriesManager.getLastSessionMemoryTimestamp()) ?? 0;
      const isFirstRun = lastMemoryTs === 0;
      const now = Date.now();

      // Cooldown check - keep accumulating pagesVisited until eligible.
      if (!isFirstRun && now - lastMemoryTs < MEMORIES_SCHEDULER_COOLDOWN_MS) {
        lazy.console.debug(
          `Cooldown not met; last run was ${Math.floor(
            (now - lastMemoryTs) / (60 * 1000)
          )}m ago (<${Math.floor(
            MEMORIES_SCHEDULER_COOLDOWN_MS / (60 * 60 * 1000)
          )}h). Skipping. pagesVisited=${this.#pagesVisited}`
        );
        return;
      }

      const shouldRun = await this.#shouldRun(
        historyEnabled,
        conversationEnabled,
        lastMemoryTs,
        isFirstRun
      );
      if (!shouldRun) {
        lazy.console.debug("No trigger met this interval; skipping.");
        return;
      }

      lazy.console.debug("Generating memories from sessions...");
      await lazy.MemoriesManager.generateMemoriesFromSessions();
      this.#pagesVisited = 0;
      lazy.console.debug("Memories generation complete.");
    } catch (error) {
      if (lazy.openAIEngine.is429Error(error)) {
        this.#backoffUntilMs = Date.now() + MEMORIES_SCHEDULER_COOLDOWN_MS;
        lazy.console.warn(
          `Rate limited (HTTP 429); deferring next memories run by ${Math.floor(
            MEMORIES_SCHEDULER_COOLDOWN_MS / (60 * 60 * 1000)
          )}h.`
        );
      } else if (lazy.openAIEngine.isRetryableError(error)) {
        this.#backoffUntilMs =
          Date.now() + MEMORIES_SCHEDULER_TRANSIENT_BACKOFF_MS;
        lazy.console.warn(
          `Transient LLM error; deferring next memories run by ${Math.floor(
            MEMORIES_SCHEDULER_TRANSIENT_BACKOFF_MS / (60 * 1000)
          )}m.`,
          error
        );
      } else {
        lazy.console.error("Failed to generate memories", error);
      }
    } finally {
      if (!this.#destroyed && MemoriesSchedulers.#anySourceEnabled()) {
        this.#startInterval();
      }
      this.#running = false;
    }
  };

  /**
   * Cleans up scheduler resources: stops the interval, unsubscribes from Places
   * notifications, and marks the scheduler destroyed so future ticks are
   * ignored.
   */
  destroy() {
    this.#stopInterval();
    lazy.PlacesUtils.observers.removeListener(
      ["page-visited"],
      this.#onPageVisited
    );
    this.#destroyed = true;
    MemoriesSchedulers.#instance = null;
    lazy.console.debug("Destroyed");
  }

  /**
   * Testing helper: set pagesVisited count. Not used in production code.
   *
   * @param {number} count
   */
  setPagesVisitedForTesting(count) {
    this.#pagesVisited = count;
  }

  /**
   * Testing helper: set the backoff deadline (ms since epoch). Pass 0 to clear.
   * Not used in production code.
   *
   * @param {number} untilMs
   */
  setBackoffUntilMsForTesting(untilMs) {
    this.#backoffUntilMs = untilMs;
  }

  /**
   * Testing helper: runs the interval handler once immediately. Not used in
   * production code.
   */
  async runNowForTesting() {
    await this.#onInterval();
  }
}
