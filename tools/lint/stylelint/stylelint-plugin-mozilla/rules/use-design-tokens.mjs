/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/** @import { PropertyConfig, PropertyTypeConfig } from "../config.mjs" */

import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import { namespace, getLocalCustomProperties } from "../helpers.mjs";
import { propertyConfig } from "../config.mjs";
import { PropertyValidator } from "../property-validator.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = namespace("use-design-tokens");

const formatPropertyNames = property =>
  property.match(/^[aeiou]/i) ? `an ${property}` : `a ${property}`;

const formatTokenCategory = categories => {
  const firstCategories = categories.slice(0, -1).join(", ");
  const lastCategory = categories[categories.length - 1];
  const formattedCategories = [firstCategories, lastCategory]
    .filter(Boolean)
    .join(" or ");
  return `${formatPropertyNames(formattedCategories)} `;
};

const messages = ruleMessages(ruleName, {
  rejected: (value, tokenCategories, suggestedValue) => {
    let message = `${value} should use ${formatTokenCategory(tokenCategories)}design token.`;
    if (suggestedValue) {
      message += ` Suggested value: ${suggestedValue}. This may be fixable by running the same command again with --fix.`;
    }
    return message;
  },
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-design-tokens.html",
  fixable: true,
};

const ruleFunction = primaryOption => {
  return (root, result) => {
    const validOptions = validateOptions(result, ruleName, {
      actual: primaryOption,
      possible: [true, null],
    });

    if (!validOptions || primaryOption === null) {
      return;
    }

    const cssCustomProperties = getLocalCustomProperties(root);

    root.walkDecls(decl => {
      const { prop, value } = decl;

      const config = propertyConfig[prop];
      if (!config) {
        return;
      }

      if (!config.validator) {
        config.validator = new PropertyValidator(config);
      }

      const parsedValue = valueParser(value);
      const isValid = config.validator.isValidPropertyValue(
        parsedValue,
        cssCustomProperties
      );

      if (!isValid) {
        const fixedValue = config.validator.getFixedValue(parsedValue);
        const tokenCategories = config.validator.getTokenCategories();

        report({
          message: messages.rejected(value, tokenCategories, fixedValue),
          node: decl,
          result,
          ruleName,
          fix: () => {
            if (fixedValue !== null) {
              decl.value = fixedValue;
            }
          },
        });
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default ruleFunction;
