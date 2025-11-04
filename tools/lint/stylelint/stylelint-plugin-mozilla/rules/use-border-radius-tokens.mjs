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
  getLocalCustomProperties,
  usesRawFallbackValues,
  usesRawShorthandValues,
  createAllowList,
} from "../helpers.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = namespace("use-border-radius-tokens");

const messages = ruleMessages(ruleName, {
  rejected: value =>
    `${value} should be using a border-radius design token. This may be fixable by running the same command again with --fix.`,
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-border-radius-tokens.html",
  fixable: true,
};

// Gather an array of `['--token-name']` and the ready css `['var(--token-name)']`
const INCLUDE_CATEGORIES = ["border-radius"];

const tokenCSS = createTokenNamesArray(INCLUDE_CATEGORIES);

// Allowed border-color values in CSS
const ALLOW_LIST = createAllowList(["0"]);

const CSS_PROPERTIES = [
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-start-radius",
  "border-end-end-radius",
];

// some circular values aren't in our token tree, so we'll append them
const RAW_VALUE_TO_TOKEN_VALUE = {
  ...createRawValuesObject(INCLUDE_CATEGORIES),
  "50%": "var(--border-radius-circle)",
  "100%": "var(--border-radius-circle)",
  "1000px": "var(--border-radius-circle)",
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
      // If the property is not in our list to check, skip it.
      if (!CSS_PROPERTIES.includes(declarations.prop)) {
        return;
      }

      // Otherwise, see if we are using the tokens correctly
      if (
        isValidTokenUsage(
          declarations.value,
          tokenCSS,
          cssCustomProperties,
          ALLOW_LIST
        ) &&
        !usesRawFallbackValues(declarations.value, RAW_VALUE_TO_TOKEN_VALUE) &&
        !usesRawShorthandValues(
          declarations.value,
          tokenCSS,
          cssCustomProperties,
          ALLOW_LIST
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
            if (node.type == "word") {
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
