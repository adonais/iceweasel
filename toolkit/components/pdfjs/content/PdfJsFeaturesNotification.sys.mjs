/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const IMPRESSION_COUNT_PREF = "pdfjs.featuresNotificationImpressionCount";
const IMPRESSION_LIMIT_PREF = "pdfjs.featuresNotificationImpressionLimit";

const DEFAULT_IMPRESSION_LIMIT = 2;

/** Shared impression budget for about:pdf and the PDF viewer. */
export const PdfJsFeaturesNotification = {
  IMPRESSION_COUNT_PREF,
  IMPRESSION_LIMIT_PREF,

  /** @returns {number} Maximum number of impressions. */
  get impressionLimit() {
    return Services.prefs.getIntPref(
      IMPRESSION_LIMIT_PREF,
      DEFAULT_IMPRESSION_LIMIT
    );
  },

  /** @returns {boolean} Whether another impression can be claimed. */
  isEligible() {
    return (
      Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0) < this.impressionLimit
    );
  },

  /** Records one impression. Parent process only. */
  recordImpression() {
    Services.prefs.setIntPref(
      IMPRESSION_COUNT_PREF,
      Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0) + 1
    );
  },

  /**
   * A count above the limit marks dismissal or a visit to the features view.
   * Reaching the limit alone leaves open bars visible.
   *
   * @returns {boolean} Whether the count exceeds the current limit.
   */
  isConsumed() {
    return (
      Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0) > this.impressionLimit
    );
  },

  /** Marks the notification as consumed. Parent process only. */
  consume() {
    Services.prefs.setIntPref(IMPRESSION_COUNT_PREF, this.impressionLimit + 1);
  },
};
