/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import { namespace } from "../helpers.mjs";
import { tokensTable } from "../../../../../toolkit/themes/shared/design-system/tokens-table.mjs";

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

const tableData = tokensTable["border-radius"];

const tokenMaps = tableData.reduce(
  (acc, item) => {
    const tokenVar = `var(${item.name})`;
    acc.valueToTokenVariable[item.value] = tokenVar;
    acc.tokenVariableToValue[tokenVar] = item.value;
    return acc;
  },
  {
    valueToTokenVariable: {
      "50%": "var(--border-radius-circle)",
      "100%": "var(--border-radius-circle)",
      "1000px": "var(--border-radius-circle)",
    },
    tokenVariableToValue: {},
  }
);

const { valueToTokenVariable, tokenVariableToValue } = tokenMaps;

const ALLOW_LIST = ["0", "initial", "unset", "inherit"];

const isToken = val => !!tokenVariableToValue[val];
const isWord = node => node.type === "word";
const isVarFunction = node => node.type === "function" && node.value === "var";

const isValidLocalVariable = (val, localCssVars) => {
  const parsed = valueParser(val);
  let cssVar = null;

  parsed.walk(node => {
    if (isVarFunction(node)) {
      const args = node.nodes.filter(isWord);
      if (args.length) {
        cssVar = args[0].value;
      }
    }
  });

  if (cssVar && localCssVars[cssVar]) {
    return isToken(localCssVars[cssVar]);
  }

  return false;
};

const isValidFallback = val => {
  if (val.includes("var(") && val.includes(",")) {
    for (const token of Object.keys(tokenVariableToValue)) {
      if (val.includes(token)) {
        return true;
      }
    }
  }
  return false;
};

const isValidValue = (val, localCssVars) =>
  isToken(val) ||
  ALLOW_LIST.includes(val) ||
  isValidLocalVariable(val, localCssVars) ||
  isValidFallback(val);

const isValidTokenUsage = (val, localCssVars) => {
  if (isValidValue(val, localCssVars)) {
    return true;
  }

  const parts = val.split(/\s+/);
  return (
    parts.length > 1 && parts.every(part => isValidValue(part, localCssVars))
  );
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

    const localCssVars = {};

    // Walk declarations once to generate a lookup table of variables.
    root.walkDecls(decl => {
      if (decl.prop.startsWith("--")) {
        localCssVars[decl.prop] = decl.value;
      }
    });

    // Walk declarations again to detect non-token values.
    root.walkDecls("border-radius", decl => {
      if (isValidTokenUsage(decl.value, localCssVars)) {
        return;
      }

      report({
        message: messages.rejected(decl.value),
        node: decl,
        result,
        ruleName,
        fix: () => {
          const val = valueParser(decl.value);
          let hasFixes = false;
          val.walk(node => {
            if (node.type == "word") {
              const token = valueToTokenVariable[node.value];
              if (token) {
                hasFixes = true;
                node.value = token;
              }
            }
          });
          if (hasFixes) {
            decl.value = val.toString();
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
