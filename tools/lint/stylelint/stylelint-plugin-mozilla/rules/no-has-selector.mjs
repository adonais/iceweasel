/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import stylelint from "stylelint";
import { namespace } from "../helpers.mjs";

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = namespace("no-has-selector");

const messages = ruleMessages(ruleName, {
  rejected:
    'Unexpected ":has()" selector. It scales with the size of the DOM subtree ' +
    "and needs more complex invalidation and matching than regular selectors. " +
    "Prefer setting an attribute or class from JS, or disable this rule with a " +
    "comment explaining why :has() is needed.",
});

const meta = {
  url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/no-has-selector.html",
  fixable: false,
};

const HAS_PSEUDO_CLASS = /:has\(/i;

const ruleFunction = primaryOption => {
  return (root, result) => {
    const validOptions = validateOptions(result, ruleName, {
      actual: primaryOption,
      possible: [true],
    });

    if (!validOptions) {
      return;
    }

    root.walkRules(rule => {
      // Report at the start of the rule rather than at each :has(), so that a
      // single stylelint-disable-next-line comment before the rule covers it.
      // A comment in the middle of a multi-line selector list wouldn't be a
      // standalone comment node, and thus wouldn't disable anything.
      if (HAS_PSEUDO_CLASS.test(rule.raws.selector?.raw ?? rule.selector)) {
        report({
          message: messages.rejected,
          node: rule,
          result,
          ruleName,
        });
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default ruleFunction;
