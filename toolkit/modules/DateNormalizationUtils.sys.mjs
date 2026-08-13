/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Generic, data-type-agnostic helpers for normalizing a date that may arrive
 * either as separate month/day/year components or as a single combined string.
 *
 * Shared by credit-card expiration handling (month/year) and passport
 * issue/expiry dates (month/day/year). `normalizeComponents` parses the
 * combined string leniently (multi-format) for month/year dates and strictly
 * (ISO) for day-bearing dates.
 */
export var DateNormalizationUtils = {
  normalizeMonth(value) {
    value = parseInt(value, 10);
    return isNaN(value) || value < 1 || value > 12 ? undefined : value;
  },

  normalizeDay(value) {
    value = parseInt(value, 10);
    return isNaN(value) || value < 1 || value > 31 ? undefined : value;
  },

  /**
   * @param {*} value The year value to normalize.
   * @returns {number | undefined} The year, with a 2-digit value shifted into
   *   the 2000s, or undefined if it isn't a positive integer.
   */
  normalizeYear(value) {
    value = parseInt(value, 10);
    if (isNaN(value) || value < 1) {
      return undefined;
    }
    if (value < 100) {
      value += 2000;
    }
    return value;
  },

  /**
   * Parse an ISO `YYYY-MM-DD` date (the value of an <input type="date">).
   *
   * @param {string} dateString
   * @returns {{ year, month, day } | {}} String captures, or {} if no match.
   */
  parseISODate(dateString) {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(
      String(dateString).trim()
    );
    if (!match) {
      return {};
    }
    return { year: match[1], month: match[2], day: match[3] };
  },

  /**
   * Parse a free-form month/year date string in a variety of formats (MMYY,
   * YYYY-MM, MM-YYYY, MM/YY, …), disambiguating month from year by magnitude.
   *
   * @param {string} dateString
   * @returns {{ month, year }} Numbers, or `{ month: undefined, year: undefined }`.
   */
  parseMonthYearString(dateString) {
    let rules = [
      {
        regex: /(?:^|\D)(\d{2})(\d{2})(?!\d)/,
      },
      {
        regex: /(?:^|\D)(\d{4})[-/](\d{1,2})(?!\d)/,
        yearIndex: 0,
        monthIndex: 1,
      },
      {
        regex: /(?:^|\D)(\d{1,2})[-/](\d{4})(?!\d)/,
        yearIndex: 1,
        monthIndex: 0,
      },
      {
        regex: /(?:^|\D)(\d{1,2})[-/](\d{1,2})(?!\d)/,
      },
      {
        regex: /(?:^|\D)(\d{2})(\d{2})(?!\d)/,
      },
    ];

    dateString = dateString.replaceAll(" ", "");
    for (let rule of rules) {
      let result = rule.regex.exec(dateString);
      if (!result) {
        continue;
      }

      let year, month;
      const parsedResults = [parseInt(result[1], 10), parseInt(result[2], 10)];
      if (!rule.yearIndex || !rule.monthIndex) {
        month = parsedResults[0];
        if (month > 12) {
          year = parsedResults[0];
          month = parsedResults[1];
        } else {
          year = parsedResults[1];
        }
      } else {
        year = parsedResults[rule.yearIndex];
        month = parsedResults[rule.monthIndex];
      }

      if (month >= 1 && month <= 12 && (year < 100 || year > 2000)) {
        return { month, year };
      }
    }
    return { month: undefined, year: undefined };
  },

  /**
   * Compose an ISO `YYYY-MM-DD` date from components, zero-padding month and
   * day. Returns "" unless all three components are present.
   *
   * @param {object} components
   * @returns {string}
   */
  formatISODate({ year, month, day }) {
    if (year && month && day) {
      return (
        String(year) +
        "-" +
        String(month).padStart(2, "0") +
        "-" +
        String(day).padStart(2, "0")
      );
    }
    return "";
  },

  /**
   * Normalize a date's components, optionally backfilling from a combined
   * string: the combined string is consulted only when a requested component is
   * missing, the parsed value takes precedence, and every requested component is
   * validated.
   *
   * @param {object} options
   * @param {string} [options.string] The combined date string, if any.
   * @param {*} [options.month]
   * @param {*} [options.day]
   * @param {*} [options.year]
   * @param {string[]} options.parts Which components this date type uses, a
   *   subset of ["month", "day", "year"].
   * @returns {object} The normalized requested components.
   */
  normalizeComponents({ string, month, day, year, parts }) {
    const components = { month, day, year };

    // Day-bearing dates come from <input type="date"> (strict ISO); a month/year
    // date (e.g. a card expiry field) may be free-form, so parse it leniently.
    const parse = parts.includes("day")
      ? this.parseISODate
      : this.parseMonthYearString;

    // Only consult the combined string when a requested component is missing.
    const missing = parts.some(part => !components[part]);
    const parsed = string && missing ? parse(string) : {};

    const result = {};
    for (const part of parts) {
      const value = parsed[part] || components[part];
      if (part == "month") {
        result.month = this.normalizeMonth(value);
      } else if (part == "day") {
        result.day = this.normalizeDay(value);
      } else {
        result.year = this.normalizeYear(value);
      }
    }
    return result;
  },
};
