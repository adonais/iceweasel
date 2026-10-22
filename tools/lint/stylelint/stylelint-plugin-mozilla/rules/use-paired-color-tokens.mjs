/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import {
  backgroundToText,
  customPropertiesRead,
  findColorDeclarations,
  isCustomPropertyDefinition,
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
  noTextColor: (background, text) =>
    `"${background}" should be used with a text color; add "color: var(${text})", or disable the rule with a comment saying where the text color comes from.`,
  inheritedTextColor: (background, text, expected) =>
    `"${background}" takes its text color from "${text}" on the rule this block nests in, which is not its counterpart; add "color: var(${expected})".`,
  notPaired: (background, text, expected) =>
    `"${background}" and "${text}" are not a semantic pair; use "${expected}" for the text color, or a background color that pairs with "${text}".`,
});
let meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-paired-color-tokens.html",
  fixable: true,
};

// A state variant usually restyles an element its base rule has already given a
// text color, so a state selector marks a block whose text color may live on a
// rule this one cannot see.
const STATE_PSEUDO_CLASS =
  /:(?:active|checked|current|default|disabled|enabled|focus|focus-visible|focus-within|hover|in-range|indeterminate|invalid|open|out-of-range|past|paused|placeholder-shown|playing|popover-open|read-only|read-write|target|user-invalid|user-valid|valid|visited|-moz-broken|-moz-drag-over|-moz-focusring|-moz-window-inactive)\b/;

// Chrome markup carries the states a pseudo-class cannot express as attributes
// instead, so `menulist[disabled]` is a state variant of `menulist`.
const STATE_ATTRIBUTE =
  /\[\s*(?:active|aria-checked|aria-current|aria-disabled|aria-expanded|aria-pressed|aria-selected|busy|checked|disabled|focused|open|pressed|selected)\s*[\]~^|$*=]/;

/**
 * Drops the argument of every `:not()`, innermost first. A negated state names
 * the base state rather than a variant of it, so `&:not(:hover)` is the rule
 * that owes the surface a text color, not one that inherits it from elsewhere.
 *
 * @param {string} selector
 * @returns {string}
 */
let stripNegations = selector => {
  for (let previous; selector != previous; ) {
    previous = selector;
    selector = selector.replace(/:not\([^()]*\)/g, "");
  }
  return selector;
};

/**
 * Whether a selector says the text color is not this block's to declare.
 *
 * @param {string} selector
 * @returns {boolean}
 */
let isExemptSelector = selector => {
  let states = stripNegations(selector);
  return STATE_PSEUDO_CLASS.test(states) || STATE_ATTRIBUTE.test(states);
};

/**
 * Whether the selector of a block, or of a block it is nested in, exempts it.
 *
 * @param {object} block - A PostCSS Rule or AtRule.
 * @returns {boolean}
 */
let isExempt = block => {
  for (let node = block; node; node = node.parent) {
    if (
      node.type == "rule" &&
      isExemptSelector(node.raws.selector?.raw ?? node.selector)
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Whether the element a block styles is given a text color. An at-rule nested
 * in a rule styles that rule's element, so a `color` the rule sets applies to
 * the at-rule's surface too; a nested rule matches a different element.
 *
 * @param {object} block - A PostCSS Rule or AtRule.
 * @returns {boolean}
 */
let hasTextColor = block => {
  for (let node = block; node; node = node.parent) {
    if (findColorDeclarations(node).text) {
      return true;
    }
    if (node.type != "atrule") {
      return false;
    }
  }
  return false;
};

/**
 * The `color` declaration the element a block styles inherits from the rules
 * the block nests in, or null where the nesting reaches none. A nested rule
 * matches the outer rule's element or a descendant of it, so the nearest
 * enclosing `color` is what the surface takes when the block declares none.
 *
 * @param {object} block - A PostCSS Rule or AtRule.
 * @returns {?object} The PostCSS Declaration.
 */
let inheritedTextColor = block => {
  let node = block;
  while (node.type == "atrule") {
    node = node.parent;
  }
  for (node = node.parent; node?.parent; node = node.parent) {
    let { text } = findColorDeclarations(node);
    if (text) {
      return text;
    }
  }
  return null;
};

/**
 * Whether a text color token read by an inherited `color` claims a pairing
 * that a given background token does not satisfy: it is the counterpart of
 * some other background token, or a variant of the background's own family.
 *
 * @param {string} text - A custom property name the `color` reads.
 * @param {string} background - The paired background token of the block.
 * @returns {boolean}
 */
let claimsOtherPairing = (text, background) =>
  textToBackground.has(text) ||
  (isDesignToken(text) &&
    parseColorTokenName(text)?.family ==
      parseColorTokenName(background).family);

/**
 * Whether a block gives the surface a text color through a custom property,
 * which is how a component rendering the text in its own shadow tree takes
 * one.
 *
 * @param {object} block - A PostCSS Rule or AtRule.
 * @returns {boolean}
 */
let definesTextColor = block =>
  block.nodes.some(
    node =>
      node.type == "decl" &&
      isCustomPropertyDefinition(node) &&
      (textToBackground.has(node.prop) ||
        customPropertiesRead(node.value).some(token =>
          textToBackground.has(token)
        ))
  );

/**
 * Whether a comment sits at the end of the background declaration's line.
 * PostCSS models it as the declaration's next sibling, so a declaration
 * inserted between the two takes the comment onto its own line.
 *
 * @param {object} background - A PostCSS Declaration.
 * @returns {boolean}
 */
let hasTrailingComment = background => {
  let next = background.next();
  return next?.type == "comment" && !next.raws.before?.includes("\n");
};

/**
 * Declares the counterpart text color beside the background that paints the
 * surface. Cloning carries the background declaration's own raws over, so the
 * new declaration takes its indentation and spacing.
 *
 * @param {object} background - The PostCSS Declaration painting the background.
 * @param {string} text - The name of the paired text color token.
 */
let insertTextColor = (background, text) =>
  background.cloneAfter({ prop: "color", value: `var(${text})` });

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
 * Reports a block that paints a paired background token and sets no text
 * color, leaving the surface to inherit one no theme guarantees the contrast
 * of.
 *
 * @param {object} block - A PostCSS Rule or AtRule.
 * @param {object} background - The Declaration painting the background.
 * @param {object} result - The PostCSS result to report to.
 */
let checkTextColorPresent = (block, background, result) => {
  if (hasTextColor(block) || definesTextColor(block)) {
    return;
  }

  let [paired] = customPropertiesRead(background.value).filter(token =>
    backgroundToText.has(token)
  );
  if (!paired) {
    return;
  }

  let text = backgroundToText.get(paired);
  let fix = hasTrailingComment(background)
    ? undefined
    : () => insertTextColor(background, text);

  // A state variant usually restyles an element its base rule has already
  // given a text color. Where that base rule is one the block nests in, the
  // color it inherits is known and is held to the pairing check; where it is a
  // flat sibling (`.foo:hover {}` beside `.foo {}`) nothing here can see it.
  if (isExempt(block)) {
    let inherited = inheritedTextColor(block);
    if (!inherited) {
      return;
    }
    let inheritedTokens = customPropertiesRead(inherited.value);
    if (inheritedTokens.includes(text)) {
      return;
    }
    let claim = inheritedTokens.find(token =>
      claimsOtherPairing(token, paired)
    );
    if (!claim) {
      return;
    }
    report({
      message: messages.inheritedTextColor(paired, claim, text),
      node: background,
      result,
      ruleName,
      fix,
    });
    return;
  }

  report({
    message: messages.noTextColor(paired, text),
    node: background,
    result,
    ruleName,
    fix,
  });
};

/**
 * Reports the background and text color tokens of one block when they are not
 * the semantic pair they were designed as.
 *
 * @param {object} backgroundDeclaration - The Declaration painting the background.
 * @param {object} textDeclaration - The Declaration setting the text color.
 * @param {object} result - The PostCSS result to report to.
 */
let checkPair = (backgroundDeclaration, textDeclaration, result) => {
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

  // Mixing two variants of the same component's tokens is a mistake even where
  // neither is paired. A component with any text color has one for every
  // background variant (the design system's tests enforce it), so the
  // counterpart exists. The global background-color/text-color tokens have no
  // component prefix and are meant to combine freely, so they are not variants
  // of each other.
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
      report({
        message: messages.notPaired(background, text, expected),
        node: textDeclaration,
        result,
        ruleName,
        fix: () => replaceCustomProperty(textDeclaration, text, expected),
      });
      return;
    }
  }
};

/**
 * Checks the color tokens of one declaration block: a background token needs a
 * text color, and a text color declared beside it needs to be the background's
 * counterpart. Only the declarations that win the cascade within the block are
 * considered.
 *
 * @param {object} block - A PostCSS Rule or AtRule.
 * @param {object} result - The PostCSS result to report to.
 */
let checkBlock = (block, result) => {
  let { background, text } = findColorDeclarations(block);

  // A block that sets no background claims no surface, and a text color it
  // sets pairs with a background from an ancestor, a sibling rule, or another
  // pseudo-element.
  if (!background) {
    return;
  }

  if (text) {
    checkPair(background, text, result);
  } else {
    checkTextColorPresent(block, background, result);
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
