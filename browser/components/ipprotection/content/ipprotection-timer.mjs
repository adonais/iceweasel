/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  asyncReplace,
  until,
  AsyncDirective,
  directive,
} from "chrome://global/content/vendor/lit.all.mjs";

const TIMER_INTERVAL_MS = 1000;

// Returns a promise until asnyncReplace has yielded at least once.
const hasYielded = async asyncReplaceDirective => {
  await asyncReplaceDirective.values[0].next();
  return asyncReplaceDirective;
};

/**
 * A directive that produces a live updating l10n args object with the duration
 * since the given timestamp in milliseconds.
 */
class TimerDirective extends AsyncDirective {
  render(timeConnectedSince) {
    return until(
      hasYielded(asyncReplace(this.currentTime(timeConnectedSince))),
      this.getFormattedTime(timeConnectedSince)
    );
  }
  /**
   * Returns a generator that yields a l10n args object with the current connection time
   * every second.
   *
   * @param {number} timeConnectedSince
   *   The time in milliseconds
   * @returns {AsyncGenerator<string>}
   * @yields {string}
   */
  async *currentTime(timeConnectedSince) {
    while (true) {
      if (!this.isConnected) {
        return;
      }
      yield this.getFormattedTime(timeConnectedSince);
      await new Promise(resolve => setTimeout(resolve, TIMER_INTERVAL_MS));
    }
  }

  /**
   * Returns the formatted connection duration time string as HH:MM:SS (hours, minutes, seconds).
   *
   * @param {number} startMS
   *  The timestamp in milliseconds since a connection to the proxy was made.
   * @returns {string}
   *  The formatted time in HH:MM:SS as l10n args object.
   */
  getFormattedTime(startMS) {
    let duration = window.Temporal.Duration.from({
      milliseconds: Math.ceil(ChromeUtils.now() - startMS),
    }).round({ smallestUnit: "seconds", largestUnit: "hours" });

    let formatter = new Intl.DurationFormat("en-US", {
      style: "digital",
      hoursDisplay: "always",
      hours: "2-digit",
    });
    const time = formatter.format(duration);
    return JSON.stringify({ time });
  }
}

export const defaultTimeValue = `{"time":""}`;
/**
 * A directive that produces a live updating l10n args object with the duration
 * since the given timestamp in milliseconds.
 * Usage:
 * <my-element data-l10n-args=${connectionTimer(startTimestamp)}></my-element>
 */
export const connectionTimer = directive(TimerDirective);
