/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RootBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/RootBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
  presets: "resource://devtools/shared/performance-new/prefs-presets.sys.mjs",

  assert: "chrome://remote/content/shared/webdriver/Assert.sys.mjs",
  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  generateUUID: "chrome://remote/content/shared/UUID.sys.mjs",
  pprint: "chrome://remote/content/shared/Format.sys.mjs",
});

const EXPLICIT_CONFIG_KEYS = ["entries", "interval", "features", "threads"];

class ProfilerModule extends RootBiDiModule {
  destroy() {}

  /**
   * Check whether the profiler is currently running.
   *
   * @returns {object}
   *     An object with an <var>active</var> boolean property, which is true
   *     when the profiler is running.
   */
  isActive() {
    return { active: Services.profiler.IsActive() };
  }

  /**
   * Start the profiler. Callers must provide either a <var>preset</var> name
   * or the full set of recording options (<var>entries</var>,
   * <var>interval</var>, <var>features</var>, <var>threads</var>).
   *
   * @param {object} options
   * @param {string=} options.preset
   *     Name of a profiler preset to use (e.g. "web-developer",
   *     "firefox-platform"). Cannot be combined with the explicit recording
   *     options below.
   * @param {number=} options.entries
   *     Entry count to keep in the buffer. Required when no preset is given.
   * @param {number=} options.interval
   *     Interval in milliseconds between samples. Required when no preset is
   *     given.
   * @param {Array<string>=} options.features
   *     Profiler features to enable. Required when no preset is given.
   * @param {Array<string>=} options.threads
   *     Threads to profile. Required when no preset is given.
   * @param {string=} options.activeContext
   *     Id of the top-level navigable to mark as the active tab for the
   *     profile. Used by the profiler to associate samples with a tab.
   *     Note that this does not restrict profiling to the given tab; the
   *     profiler always samples globally.
   */
  async start(options = {}) {
    if (Services.profiler.IsActive()) {
      throw new lazy.error.UnsupportedOperationError(
        "The profiler is already running. Call moz:profiler.stop before starting a new recording."
      );
    }

    const { preset, activeContext: contextId } = options;

    let entries, interval, features, threads;
    if (preset !== undefined) {
      lazy.assert.string(
        preset,
        lazy.pprint`Expected "preset" to be a string, got ${preset}`
      );

      const overlapping = EXPLICIT_CONFIG_KEYS.filter(
        key => options[key] !== undefined
      );
      if (overlapping.length) {
        throw new lazy.error.InvalidArgumentError(
          `"preset" cannot be combined with explicit options: ${overlapping.join(", ")}`
        );
      }

      const presetConfig = lazy.presets[preset];
      if (!presetConfig) {
        const validPresets = Object.keys(lazy.presets).join(", ");
        throw new lazy.error.InvalidArgumentError(
          `Unknown preset "${preset}". Valid presets are: ${validPresets}`
        );
      }

      ({ entries, interval, features, threads } = presetConfig);
    } else {
      ({ entries, interval, features, threads } = options);

      lazy.assert.positiveInteger(
        entries,
        lazy.pprint`Expected "entries" to be a positive integer, got ${entries}`
      );
      lazy.assert.positiveNumber(
        interval,
        lazy.pprint`Expected "interval" to be a positive number, got ${interval}`
      );
      lazy.assert.array(
        features,
        lazy.pprint`Expected "features" to be an array, got ${features}`
      );
      features.forEach(feature =>
        lazy.assert.string(
          feature,
          lazy.pprint`Expected "features" values to be strings, got ${feature}`
        )
      );
      lazy.assert.array(
        threads,
        lazy.pprint`Expected "threads" to be an array, got ${threads}`
      );
      threads.forEach(thread =>
        lazy.assert.string(
          thread,
          lazy.pprint`Expected "threads" values to be strings, got ${thread}`
        )
      );
    }

    let activeTabID;
    if (contextId !== undefined) {
      lazy.assert.string(
        contextId,
        lazy.pprint`Expected "activeContext" to be a string, got ${contextId}`
      );
      const context = this._getNavigable(contextId);
      activeTabID = context.browserId;
    }

    await Services.profiler.StartProfiler(
      entries,
      interval,
      features,
      threads,
      activeTabID,
      // Duration parameter is not used at the moment, so we don't expose this
      // as an option.
      0
    );
  }

  /**
   * Stop the profiler and save the recorded profile to a file.
   *
   * By default the profile is written to a uniquely named file in the
   * preferred downloads directory and its path is returned to the caller.
   *
   * When <var>discard</var> is true, or when the profiler is not running, the
   * profiler is stopped and no profile is saved.
   *
   * @param {object=} options
   * @param {boolean=} options.discard
   *     If true, stop the profiler and discard the recording instead of
   *     saving it to disk. Defaults to false.
   *
   * @returns {Promise<object>}
   *     An object with a <var>path</var> property holding the path to the
   *     saved profile, or null when nothing was saved.
   *
   * @throws {InvalidArgumentError}
   *     If <var>discard</var> is not a boolean.
   * @throws {UnknownError}
   *     If writing the profile to disk failed.
   */
  async stop(options = {}) {
    const { discard = false } = options;

    lazy.assert.boolean(
      discard,
      lazy.pprint`Expected "discard" to be a boolean, got ${discard}`
    );

    if (discard || !Services.profiler.IsActive()) {
      await Services.profiler.StopProfiler();
      return { path: null };
    }

    await Services.profiler.Pause();

    const downloadsDir = await lazy.Downloads.getPreferredDownloadsDirectory();
    const path = PathUtils.join(
      downloadsDir,
      `profile-${lazy.generateUUID()}.json`
    );

    try {
      await Services.profiler.dumpProfileToFileAsync(path);
    } catch (e) {
      throw new lazy.error.UnknownError(
        `Failed to write the profile to disk: ${e.message}`
      );
    } finally {
      await Services.profiler.StopProfiler();
    }

    return { path };
  }

  static get supportedEvents() {
    return [];
  }
}

// To export the class as lower-case
export const profiler = ProfilerModule;
