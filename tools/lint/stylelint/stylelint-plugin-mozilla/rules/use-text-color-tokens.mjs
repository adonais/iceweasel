/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import stylelint from "stylelint";
import {
  namespace,
  createTokenNamesArray,
  isValidTokenUsage,
  usesRawColors,
  createAllowList,
  getLocalCustomProperties,
} from "../helpers.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

// Name our rule, set the error message, and link to meta
const ruleName = namespace("use-text-color-tokens");

const messages = ruleMessages(ruleName, {
  rejected: value => `${value} should use a text-color design token.`,
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-text-color-tokens.html",
  fixable: false,
};

const INCLUDE_CATEGORIES = ["text-color"];

const tokenCSS = createTokenNamesArray(INCLUDE_CATEGORIES);

// Allowed text-color values in CSS
const ALLOW_LIST = createAllowList(["currentColor"]);

const CSS_PROPERTIES = ["color"];

const ruleFunction = primaryOption => {
  return (root, result) => {
    const validOptions = validateOptions(result, ruleName, {
      actual: primaryOption,
      possible: [true],
    });

    if (!validOptions) {
      return;
    }

    // The first time through gathers our custom properties
    const cssCustomProperties = getLocalCustomProperties(root);

    // And then we validate our properties
    root.walkDecls(declarations => {
      // If the property is not in our list to check, skip it
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
        !usesRawColors(declarations.value)
      ) {
        return;
      }

      report({
        message: messages.rejected(declarations.value),
        node: declarations,
        result,
        ruleName,
      });
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default ruleFunction;
