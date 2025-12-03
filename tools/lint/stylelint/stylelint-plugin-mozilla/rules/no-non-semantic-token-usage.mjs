/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import {
  getLocalCustomProperties,
  namespace,
  createTokenNamesArray,
  isWord,
  isVariableFunction,
} from "../helpers.mjs";
import {
  BACKGROUND_COLOR,
  BORDER_COLOR,
  BORDER_RADIUS,
  BORDER_WIDTH,
  FONT_SIZE,
  FONT_WEIGHT,
  ICON_COLOR,
  SIZE,
  OPACITY,
  SPACE,
  TEXT_COLOR,
  BOX_SHADOW,
} from "../data.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = namespace("no-non-semantic-token-usage");

const messages = ruleMessages(ruleName, {
  rejected: token =>
    `Unexpected usage of \`${token}\`. Design tokens should only be used with properties matching their semantic meaning.`,
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/no-non-semantic-token-usage.html",
  fixable: false,
};

const backgroundColorTokens = createTokenNamesArray(
  BACKGROUND_COLOR.CATEGORIES
);
const borderColorTokens = createTokenNamesArray(BORDER_COLOR.CATEGORIES);
const borderRadiusTokens = createTokenNamesArray(BORDER_RADIUS.CATEGORIES);
const borderWidthTokens = createTokenNamesArray(BORDER_WIDTH.CATEGORIES);
const fontSizeTokens = createTokenNamesArray(FONT_SIZE.CATEGORIES);
const fontWeightTokens = createTokenNamesArray(FONT_WEIGHT.CATEGORIES);
const iconColorTokens = createTokenNamesArray(ICON_COLOR.CATEGORIES);
const sizeTokens = createTokenNamesArray(SIZE.CATEGORIES);
const opacityTokens = createTokenNamesArray(OPACITY.CATEGORIES);
const spaceTokens = createTokenNamesArray(SPACE.CATEGORIES);
const textColorTokens = createTokenNamesArray(TEXT_COLOR.CATEGORIES);
const boxShadowTokens = createTokenNamesArray(BOX_SHADOW.CATEGORIES);

// Get allowed properties by token category
const getAllowedProps = token => {
  let tokenProperties = null;
  switch (true) {
    case backgroundColorTokens.includes(token):
      tokenProperties = BACKGROUND_COLOR.PROPERTIES;
      break;
    case borderColorTokens.includes(token):
      tokenProperties = BORDER_COLOR.PROPERTIES;
      break;
    case borderRadiusTokens.includes(token):
      tokenProperties = BORDER_RADIUS.PROPERTIES;
      break;
    case borderWidthTokens.includes(token):
      tokenProperties = BORDER_WIDTH.PROPERTIES;
      break;
    case fontSizeTokens.includes(token):
      tokenProperties = FONT_SIZE.PROPERTIES;
      break;
    case fontWeightTokens.includes(token):
      tokenProperties = FONT_WEIGHT.PROPERTIES;
      break;
    case iconColorTokens.includes(token):
      tokenProperties = ICON_COLOR.PROPERTIES;
      break;
    case sizeTokens.includes(token):
      tokenProperties = SIZE.PROPERTIES;
      break;
    case opacityTokens.includes(token):
      tokenProperties = OPACITY.PROPERTIES;
      break;
    case spaceTokens.includes(token):
      tokenProperties = SPACE.PROPERTIES;
      break;
    case textColorTokens.includes(token):
      tokenProperties = TEXT_COLOR.PROPERTIES;
      break;
    case boxShadowTokens.includes(token):
      tokenProperties = BOX_SHADOW.PROPERTIES;
      break;
    default:
      break;
  }

  return tokenProperties;
};

// Get all design tokens in CSS declaration value
const getAllTokensInValue = value => {
  const parsedValue = valueParser(value).nodes;

  const allTokens = parsedValue
    .filter(node => isVariableFunction(node))
    .map(functionNode => {
      const variableNode = functionNode.nodes.find(
        node => isWord(node) && node.value.startsWith("--")
      );
      return variableNode ? variableNode.value : null;
    })
    .filter(Boolean);

  return allTokens;
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

    root.walkDecls(declaration => {
      const { prop, value } = declaration;

      const tokens = getAllTokensInValue(value);

      tokens.forEach(token => {
        // If local CSS custom variable declaration, skip
        if (prop in cssCustomProperties) {
          return;
        }

        // `var(--token-name)` mirrors shape received from `createTokenNamesArray()`
        let varifiedToken = `var(${token})`;
        let allowedProps = null;

        if (cssCustomProperties[token]) {
          // `cssCustomProperties[token]` already in desired shape
          varifiedToken = cssCustomProperties[token];
          allowedProps = getAllowedProps(cssCustomProperties[token]);
        } else {
          allowedProps = getAllowedProps(varifiedToken);
        }

        if (allowedProps && !allowedProps.includes(prop)) {
          report({
            message: messages.rejected(varifiedToken),
            node: declaration,
            result,
            ruleName,
          });
        }
      });
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default ruleFunction;
