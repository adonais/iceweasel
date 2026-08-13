/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { DateNormalizationUtils } from "resource://gre/modules/DateNormalizationUtils.sys.mjs";
import { FormAutofillNameUtils } from "resource://gre/modules/shared/FormAutofillNameUtils.sys.mjs";

/**
 * The PassportRecord class serves to handle and normalize internal passport
 * records. PassportRecord is used for processing and consistent data
 * representation.
 */
export class PassportRecord {
  // Derived name parts, split from / joined into the combined `passport-name`.
  static NAME_COMPONENTS = [
    "passport-given-name",
    "passport-additional-name",
    "passport-family-name",
  ];

  // Derived combined date fields, each backed by `-month`/`-day`/`-year`.
  static DATE_FIELDS = ["passport-issue-date", "passport-expiry-date"];

  /**
   * Computes the split name parts and the combined date fields from the
   * components a form may instead provide.
   *
   * @param {object} passport The passport object
   */
  static computeFields(passport) {
    this.#computeNameFields(passport);
    for (const field of this.DATE_FIELDS) {
      this.#computeDateFields(passport, field);
    }
  }

  static #computeNameFields(passport) {
    if (!("passport-given-name" in passport)) {
      const nameParts = FormAutofillNameUtils.splitName(
        passport["passport-name"]
      );
      passport["passport-given-name"] = nameParts.given;
      passport["passport-additional-name"] = nameParts.middle;
      passport["passport-family-name"] = nameParts.family;
    }
  }

  static #computeDateFields(passport, field) {
    if (!(field in passport)) {
      passport[field] = DateNormalizationUtils.formatISODate({
        year: passport[`${field}-year`],
        month: passport[`${field}-month`],
        day: passport[`${field}-day`],
      });
    }
  }

  /**
   * Normalizes passport fields by collapsing the split name parts into the
   * combined `passport-name`, and the combined date fields back into the
   * month/day/year components, leaving the basic fields.
   *
   * @param {object} passport The passport object
   */
  static normalizeFields(passport) {
    this.#normalizeNameFields(passport);
    for (const field of this.DATE_FIELDS) {
      this.#normalizeDateFields(passport, field);
    }
  }

  static #normalizeNameFields(passport) {
    if (
      !passport["passport-name"] &&
      this.NAME_COMPONENTS.some(c => passport[c])
    ) {
      passport["passport-name"] = FormAutofillNameUtils.joinNameParts({
        given: passport["passport-given-name"] ?? "",
        middle: passport["passport-additional-name"] ?? "",
        family: passport["passport-family-name"] ?? "",
      });
    }

    this.NAME_COMPONENTS.forEach(c => delete passport[c]);
  }

  static #normalizeDateFields(passport, field) {
    const { month, day, year } = DateNormalizationUtils.normalizeComponents({
      string: passport[field],
      month: passport[`${field}-month`],
      day: passport[`${field}-day`],
      year: passport[`${field}-year`],
      parts: ["month", "day", "year"],
    });

    passport[`${field}-month`] = month ?? "";
    passport[`${field}-day`] = day ?? "";
    passport[`${field}-year`] = year ?? "";
    delete passport[field];
  }
}
