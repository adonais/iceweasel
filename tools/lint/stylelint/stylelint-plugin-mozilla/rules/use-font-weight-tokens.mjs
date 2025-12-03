/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import {
  createTokenNamesArray,
  createAllowList,
  createRawValuesObject,
  getLocalCustomProperties,
  isValidTokenUsage,
  namespace,
} from "../helpers.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = namespace("use-font-weight-tokens");

const messages = ruleMessages(ruleName, {
  rejected: value => `${value} should use a font-weight design token.`,
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-font-weight-tokens.html",
  fixable: true,
};

const PROPERTY_NAME = "font-weight";

const tokenCSS = createTokenNamesArray([PROPERTY_NAME]);

const ALLOW_LIST = createAllowList();

const tokenFixMap = {
  ...createRawValuesObject([PROPERTY_NAME]),
  200: "var(--font-weight)",
  300: "var(--font-weight)",
  400: "var(--font-weight)",
  lighter: "var(--font-weight)",
  500: "var(--font-weight-semibold)",
  510: "var(--font-weight-semibold)",
  800: "var(--font-weight-bold)",
  bold: "var(--font-weight-bold)",
  bolder: "var(--font-weight-bold)",
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

    const cssCustomProperties = getLocalCustomProperties(root);

    root.walkDecls(declarations => {
      // ignore properties other than font-weight
      if (declarations.prop !== PROPERTY_NAME) {
        return;
      }

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
        fix: () => {
          const val = valueParser(declarations.value);
          let hasFixes = false;
          val.walk(node => {
            if (node.type === "word") {
              const token = tokenFixMap[node.value.trim()];
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
