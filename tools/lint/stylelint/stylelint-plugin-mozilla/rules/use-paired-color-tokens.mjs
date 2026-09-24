/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import {
  backgroundToText,
  customPropertiesRead,
  findColorDeclarations,
  isDesignToken,
  isFunction,
  namespace,
  parseColorTokenName,
  textToBackground,
} from "../helpers.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

let ruleName = namespace("use-paired-color-tokens");
let messages = ruleMessages(ruleName, {
  notPaired: (background, text, expected) =>
    `"${background}" and "${text}" are not a semantic pair; use "${expected}" for the text color, or a background color that pairs with "${text}".`,
  noPairedToken: (background, text, expected) =>
    `"${background}" and "${text}" are different variants of the same tokens and there is no "${expected}"; file a bug for the missing token.`,
  noPairedTokenUseBase: (background, text, expected, base) =>
    `"${background}" and "${text}" are different variants of the same tokens and there is no "${expected}"; use "${base}" instead, or file a bug for the missing token.`,
});
let meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-paired-color-tokens.html",
  fixable: true,
};

/**
 * Rewrites every read of one custom property in a declaration value.
 *
 * @param {object} declaration - A PostCSS Declaration.
 * @param {string} from - The custom property name to replace.
 * @param {string} to - The custom property name to read instead.
 */
let replaceCustomProperty = (declaration, from, to) => {
  let parsed = valueParser(declaration.value);
  parsed.walk(node => {
    if (isFunction(node) && node.value === "var") {
      let [first] = node.nodes;
      if (first?.value === from) {
        first.value = to;
      }
    }
  });
  declaration.value = parsed.toString();
};

/**
 * Reports the background and text color tokens of one declaration block when
 * they are not the semantic pair they were designed as. Only the declarations
 * that win the cascade within the block are considered.
 *
 * @param {object} block - A PostCSS Rule or AtRule.
 * @param {object} result - The PostCSS result to report to.
 */
let checkBlock = (block, result) => {
  let { background: backgroundDeclaration, text: textDeclaration } =
    findColorDeclarations(block);

  // A block that sets only one of the two claims no pairing: the other half
  // legitimately comes from an ancestor, a sibling rule, or another
  // pseudo-element.
  if (!backgroundDeclaration || !textDeclaration) {
    return;
  }

  let backgroundTokens = customPropertiesRead(backgroundDeclaration.value);
  let textTokens = customPropertiesRead(textDeclaration.value);

  let paired = backgroundTokens.filter(token => backgroundToText.has(token));
  if (paired.some(token => textTokens.includes(backgroundToText.get(token)))) {
    return;
  }

  let pairedText = textTokens.filter(token => textToBackground.has(token));
  if (paired.length && pairedText.length) {
    let expected = backgroundToText.get(paired[0]);
    report({
      message: messages.notPaired(paired[0], pairedText[0], expected),
      node: textDeclaration,
      result,
      ruleName,
      fix: () =>
        replaceCustomProperty(textDeclaration, pairedText[0], expected),
    });
    return;
  }

  // The pair the author reached for may not exist as a token, but mixing two
  // variants of the same component's tokens is a mistake either way. The global
  // background-color/text-color tokens have no component prefix and are meant
  // to combine freely, so they are not variants of each other, and a component
  // whose variant has no text color of its own is meant to fall back to the
  // family's base one.
  for (let background of backgroundTokens.filter(isDesignToken)) {
    let backgroundName = parseColorTokenName(background);
    if (!backgroundName?.family) {
      continue;
    }
    for (let text of textTokens.filter(isDesignToken)) {
      let textName = parseColorTokenName(text);
      if (
        textName?.family != backgroundName.family ||
        !textName.variant ||
        textName.variant == backgroundName.variant
      ) {
        continue;
      }
      let expected = `--${backgroundName.family}text-color${backgroundName.variant}`;
      let base = `--${backgroundName.family}text-color`;
      let message;
      let fix;
      if (isDesignToken(expected)) {
        message = messages.notPaired(background, text, expected);
        fix = () => replaceCustomProperty(textDeclaration, text, expected);
      } else if (isDesignToken(base)) {
        message = messages.noPairedTokenUseBase(
          background,
          text,
          expected,
          base
        );
      } else {
        message = messages.noPairedToken(background, text, expected);
      }
      report({ message, node: textDeclaration, result, ruleName, fix });
      return;
    }
  }
};

let ruleFunction = primaryOption => {
  return (root, result) => {
    let validOptions = validateOptions(result, ruleName, {
      actual: primaryOption,
      possible: [true],
    });

    if (!validOptions) {
      return;
    }

    // Declarations nest directly inside an at-rule as well as inside a rule,
    // which is the shape of every generated token sheet. A statement at-rule
    // such as @namespace has no block and so no nodes at all.
    root.walk(node => {
      if ((node.type == "rule" || node.type == "atrule") && node.nodes) {
        checkBlock(node, result);
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;
export default ruleFunction;
