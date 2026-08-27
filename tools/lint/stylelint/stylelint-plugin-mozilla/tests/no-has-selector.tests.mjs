/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Bug 1948378: remove this exception when the eslint import plugin fully
// supports exports in package.json files
// eslint-disable-next-line import/no-unresolved
import { testRule } from "stylelint-test-rule-node";
import stylelint from "stylelint";
import noHasSelector from "../rules/no-has-selector.mjs";

let plugin = stylelint.createPlugin(noHasSelector.ruleName, noHasSelector);
let {
  ruleName,
  rule: { messages },
} = plugin;

testRule({
  plugins: [plugin],
  ruleName,
  config: [true],
  fix: false,
  accept: [
    {
      code: ".foo > .bar { color: red; }",
      description: "Selectors without :has() are valid.",
    },
    {
      code: ".foo:not(.bar) { color: red; }",
      description: "Other functional pseudo-classes are valid.",
    },
    {
      code: ".foo:has-slotted { color: red; }",
      description: ":has-slotted is a different pseudo-class and is valid.",
    },
    {
      code: "@supports selector(:has(.foo)) { .bar { color: red; } }",
      description: "Feature detection of :has() support is valid.",
    },
    {
      code: ".foo { --not-a-selector: :has(.bar); }",
      description: "Declaration values are not selectors.",
    },
    {
      code: "/* stylelint-disable-next-line stylelint-plugin-mozilla/no-has-selector */\n.foo:has(.bar) { color: red; }",
      description: "The rule can be disabled where :has() is needed.",
    },
    {
      code: "/* stylelint-disable-next-line stylelint-plugin-mozilla/no-has-selector */\n.foo:has(.bar),\n.baz:has(.quux) {\n  color: red;\n}",
      description:
        "One disable comment covers a whole multi-line selector list.",
    },
  ],

  reject: [
    {
      code: ".foo:has(.bar) { color: red; }",
      message: messages.rejected,
      description: "Using :has() should be flagged.",
      line: 1,
      column: 1,
    },
    {
      code: ".foo:HAS(.bar) { color: red; }",
      message: messages.rejected,
      description: ":has() is case-insensitive.",
    },
    {
      code: ".foo:not(:has(.bar)) { color: red; }",
      message: messages.rejected,
      description:
        "Using :has() inside another pseudo-class should be flagged.",
    },
    {
      code: ".foo:has(.bar), .baz:has(.quux) { color: red; }",
      message: messages.rejected,
      description:
        "A selector list is reported once, at the start of the rule.",
      line: 1,
      column: 1,
    },
    {
      code: ".foo,\n.baz:has(.quux) {\n  color: red;\n}",
      message: messages.rejected,
      description:
        ":has() on a later line of a selector list is reported at the rule " +
        "start, so that a disable comment can be placed before the rule.",
      line: 1,
      column: 1,
    },
    {
      code: ".foo { &:has(.bar) { color: red; } }",
      message: messages.rejected,
      description: "Using :has() in a nested selector should be flagged.",
    },
    {
      code: "@media (width > 100px) { .foo:has(.bar) { color: red; } }",
      message: messages.rejected,
      description: "Using :has() inside an at-rule should be flagged.",
    },
  ],
});
