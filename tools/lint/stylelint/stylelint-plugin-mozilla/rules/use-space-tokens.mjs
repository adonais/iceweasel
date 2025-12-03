/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import {
  namespace,
  createTokenNamesArray,
  isValidTokenUsage,
  getLocalCustomProperties,
  usesRawFallbackValues,
  usesRawShorthandValues,
  createAllowList,
} from "../helpers.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = namespace("use-space-tokens");

const messages = ruleMessages(ruleName, {
  rejected: (value, suggestedValue) => {
    if (suggestedValue != null) {
      return `${value} should be using a space design token. Suggested value: ${suggestedValue}. This may be fixable by running the same command again with --fix.`;
    }

    return `${value} should be using a space design token.`;
  },
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-space-tokens.html",
  fixable: true,
};

const INCLUDE_CATEGORIES = ["space"];

const tokenCSS = createTokenNamesArray(INCLUDE_CATEGORIES);

// Allowed values in CSS
const ALLOW_LIST = createAllowList(["0", "auto"]);

const CSS_PROPERTIES = [
  "margin",
  "margin-block",
  "margin-block-end",
  "margin-block-start",
  "margin-inline",
  "margin-inline-end",
  "margin-inline-start",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-block",
  "padding-block-end",
  "padding-block-start",
  "padding-inline",
  "padding-inline-end",
  "padding-inline-start",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "gap",
  "column-gap",
  "row-gap",
  "inset",
  "inset-block",
  "inset-block-end",
  "inset-block-start",
  "inset-inline",
  "inset-inline-end",
  "inset-inline-start",
  "top",
  "right",
  "bottom",
  "left",
];

// the token tree has values that don't make sense to auto-fix, like changing 0 to var(--button-padding-icon),
// so we'll ignore those and stick to auto-fixable values that are likely to be used
const RAW_VALUE_TO_TOKEN_VALUE = {
  "2px": "var(--space-xxsmall)",
  "4px": "var(--space-xsmall)",
  "8px": "var(--space-small)",
  "12px": "var(--space-medium)",
  "16px": "var(--space-large)",
  "24px": "var(--space-xlarge)",
  "32px": "var(--space-xxlarge)",
};

const getFixedValue = currentValue => {
  const val = valueParser(currentValue);
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
    return val.toString();
  }

  return null;
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

      const fixedValue = getFixedValue(declarations.value);

      report({
        message: messages.rejected(declarations.value, fixedValue),
        node: declarations,
        result,
        ruleName,
        fix: () => {
          if (fixedValue != null) {
            declarations.value = fixedValue;
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
