/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import {
  namespace,
  createTokenNamesArray,
  createRawValuesObject,
  isValidTokenUsage,
  isValidTokenUsageInCalc,
  containsViewportUnit,
  getLocalCustomProperties,
  usesRawFallbackValues,
  usesRawShorthandValues,
  createAllowList,
  FIXED_UNITS,
} from "../helpers.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = namespace("use-size-tokens");

const messages = ruleMessages(ruleName, {
  rejected: value =>
    `Consider using a size design token instead of ${value}. This may be fixable by running the same command again with --fix.`,
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-size-tokens.html",
  fixable: true,
};

// Bug 1979978 moves this object to ../data.mjs
const SIZE = {
  CATEGORIES: ["size", "icon-size"],
  PROPERTIES: [
    "width",
    "min-width",
    "max-width",
    "height",
    "min-height",
    "max-height",
    "inline-size",
    "min-inline-size",
    "max-inline-size",
    "block-size",
    "min-block-size",
    "max-block-size",
    "inset",
    "inset-block",
    "inset-block-end",
    "inset-block-start",
    "inset-inline",
    "inset-inline-end",
    "inset-inline-start",
    "left",
    "right",
    "top",
    "bottom",
    "background-size",
  ],
};

const tokenCSS = createTokenNamesArray(SIZE.CATEGORIES);

// Allowed size values in CSS
const SIZE_TOKENS_ALLOW_LIST = createAllowList([
  FIXED_UNITS,
  "0",
  "auto",
  "none",
  "fit-content",
  "min-content",
  "max-content",
]);

const RAW_VALUE_TO_TOKEN_VALUE = {
  ...createRawValuesObject(SIZE.CATEGORIES),
  "0.75rem": "var(--size-item-xsmall)",
  "1rem": "var(--size-item-small)",
  "1.5rem": "var(--size-item-medium)",
  "2rem": "var(--size-item-large)",
  "3rem": "var(--size-item-xlarge)",
};

const ruleFunction = primaryOption => {
  return (root, result) => {
    const validOptions = validateOptions(result, ruleName, {
      actual: primaryOption,
      possible: [true],
    });

    if (!validOptions) {
      return;
    }

    // Walk declarations once to generate a lookup table of variables.
    const cssCustomProperties = getLocalCustomProperties(root);

    // Walk declarations again to detect non-token values.
    root.walkDecls(declarations => {
      if (!SIZE.PROPERTIES.includes(declarations.prop)) {
        return;
      }

      // Allows values using `vh` or `vw` units
      if (containsViewportUnit(declarations.value)) {
        return;
      }

      // Otherwise, see if we are using the tokens correctly
      if (
        isValidTokenUsage(
          declarations.value,
          tokenCSS,
          cssCustomProperties,
          SIZE_TOKENS_ALLOW_LIST
        ) &&
        isValidTokenUsageInCalc(
          declarations.value,
          tokenCSS,
          cssCustomProperties,
          SIZE_TOKENS_ALLOW_LIST
        ) &&
        !usesRawFallbackValues(declarations.value, RAW_VALUE_TO_TOKEN_VALUE) &&
        !usesRawShorthandValues(
          declarations.value,
          tokenCSS,
          cssCustomProperties,
          SIZE_TOKENS_ALLOW_LIST
        )
      ) {
        return;
      }

      report({
        message: messages.rejected(declarations.value),
        node: declarations,
        result,
        ruleName,
        fix: () => {
          const val = valueParser(declarations.value);
          let hasFixes = false;

          val.walk(node => {
            if (node.type === "word") {
              const token = RAW_VALUE_TO_TOKEN_VALUE[node.value.trim()];
              if (token) {
                hasFixes = true;
                node.value = token;
              }
            }
          });

          if (hasFixes) {
            declarations.value = val.toString();
          }
        },
      });
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default ruleFunction;
