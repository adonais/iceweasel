/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import stylelint from "stylelint";
import {
  createTokenNamesArray,
  createAllowList,
  getLocalCustomProperties,
  isValidTokenUsage,
  namespace,
} from "../helpers.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = namespace("use-box-shadow-tokens");

const messages = ruleMessages(ruleName, {
  rejected: value => `${value} should use a box-shadow design token.`,
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-box-shadow-tokens.html",
  fixable: false,
};

const PROPERTY_NAME = "box-shadow";

const tokenCSS = createTokenNamesArray([PROPERTY_NAME]);

const ALLOW_LIST = createAllowList(["none"]);

const ruleFunction = primaryOption => {
  return (root, result) => {
    const validOptions = validateOptions(result, ruleName, {
      actual: primaryOption,
      possible: [true],
    });

    if (!validOptions) {
      return;
    }

    const cssCustomProperties = getLocalCustomProperties(root);

    root.walkDecls(PROPERTY_NAME, declarations => {
      if (
        isValidTokenUsage(
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
      });
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default ruleFunction;
