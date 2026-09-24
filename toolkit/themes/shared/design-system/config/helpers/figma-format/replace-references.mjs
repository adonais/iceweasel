/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { getReferences, usesReferences } from "style-dictionary/utils";
import { COLLECTIONS, HCM_VALUES } from "./constants.mjs";
import { resolveCssCalc } from "./resolve-css-calc.mjs";

/**
 * Replaces references and resolves `calc()` expressions in a given value.
 *
 * This function processes a value to replace references with their actual values
 * and resolves any `calc()` expressions by evaluating them. It also handles
 * specific cases for high contrast mode (HCM) values.
 *
 * @param {string | undefined} value - The value to process.
 * @param {object} tokens - All tokens in an unflattened object format, as provided by Style Dictionary.
 */
export const replaceReferences = (value, tokens) => {
  if (value === undefined) {
    return value;
  }

  let updatedValue = value.toString();
  // Replace calc() expressions with their computed values
  if (typeof value === "string") {
    updatedValue = value.replace(/calc\(([^()]+)\)/g, (_, calcContent) => {
      let updatedCalcContent = calcContent;
      // Replace references inside the calc() content with their actual values
      if (usesReferences(calcContent)) {
        getReferences(calcContent, tokens).forEach(reference => {
          updatedCalcContent = updatedCalcContent.replace(
            `{${reference.path.join(".")}}`,
            reference.value
          );
        });
      }

      // Resolve the calc() expression to its computed value
      updatedCalcContent = resolveCssCalc(updatedCalcContent);
      return updatedCalcContent;
    });
  }

  // Check if the value contains any references
  if (usesReferences(updatedValue, tokens)) {
    // Replace the style dictionary references with
    // the format expected by the figma import script
    getReferences(updatedValue, tokens).forEach(reference => {
      updatedValue = updatedValue.replace(
        `{${reference.path.join(".")}}`,
        `{${reference.attributes.collection}$${reference.name}}`
      );
    });
  }

  // If the value matches any of the predefined HCM values, replace whith
  // reference expected by the figma import script
  if (HCM_VALUES.includes(updatedValue)) {
    updatedValue = `{${COLLECTIONS.hcmTheme}$${updatedValue}}`;
  }

  return updatedValue;
};
