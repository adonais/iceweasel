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
import useFontWeightTokens from "../rules/use-font-weight-tokens.mjs";

let plugin = stylelint.createPlugin(
  useFontWeightTokens.ruleName,
  useFontWeightTokens
);
let {
  ruleName,
  rule: { messages },
} = plugin;

testRule({
  plugins: [plugin],
  ruleName,
  config: [true, { tokenType: "brand" }],
  fix: false,
  accept: [
    // allowed token values
    {
      code: ".a { font-weight: var(--font-weight); }",
      description: "Using font-weight token is valid.",
    },
    {
      code: ".a { font-weight: var(--font-weight-semibold); }",
      description: "Using font-weight-semibold token is valid.",
    },
    {
      code: ".a { font-weight: var(--font-weight-bold); }",
      description: "Using font-weight-bold token is valid.",
    },
    {
      code: ".a { font-weight: var(--button-font-weight); }",
      description: "Using button-font-weight token is valid.",
    },
    {
      code: ".a { font-weight: var(--heading-font-weight); }",
      description: "Using heading-font-weight token is valid.",
    },
    // allowed CSS values
    {
      code: ".a { font-weight: inherit; }",
      description: "Using inherit is valid.",
    },
    {
      code: ".a { font-weight: initial; }",
      description: "Using initial is valid.",
    },
    {
      code: ".a { font-weight: unset; }",
      description: "Using unset is valid.",
    },
    {
      code: ".a { font-weight:var(--my-local, var(--font-weight-semibold)); }",
      description:
        "Using a custom property with fallback to design token is valid.",
    },
    {
      code: `
        :root { --custom-token: var(--font-weight-semibold); }
        .a { font-weight: var(--custom-token); }
      `,
      description:
        "Using a custom property with fallback to a design token is valid.",
    },
  ],

  reject: [
    {
      code: ".a { font-weight: normal; }",
      message: messages.rejected("normal"),
      description: "Using normal keyword should use a design token.",
    },
    {
      code: ".a { font-weight: bold; }",
      message: messages.rejected("bold"),
      description: "Using bold keyword should use a design token.",
    },
    {
      code: ".a { font-weight: bolder; }",
      message: messages.rejected("bolder"),
      description: "Using bolder keyword should use a design token.",
    },
    {
      code: ".a { font-weight: lighter; }",
      message: messages.rejected("lighter"),
      description: "Using lighter keyword should use a design token.",
    },
    {
      code: ".a { font-weight: 100; }",
      message: messages.rejected("100"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: 200; }",
      message: messages.rejected("200"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: 300; }",
      message: messages.rejected("300"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: 400; }",
      message: messages.rejected("400"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: 500; }",
      message: messages.rejected("500"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: 600; }",
      message: messages.rejected("600"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: 700; }",
      message: messages.rejected("700"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: 800; }",
      message: messages.rejected("800"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: 900; }",
      message: messages.rejected("900"),
      description: "Using a numeric value should use a design token.",
    },
    {
      code: ".a { font-weight: calc(var(--my-local) + 100); }",
      message: messages.rejected("calc(var(--my-local) + 100)"),
      description:
        "Using a calc() with custom variables should use a design token.",
    },
    {
      code: ".a { font-weight: var(--random-token, 600); }",
      message: messages.rejected("var(--random-token, 600)"),
      description: "Using a custom property should use a design token.",
    },
    {
      code: `
        :root { --custom-token: 600; }
        .a { font-weight: var(--custom-token); }
      `,
      message: messages.rejected("var(--custom-token)"),
      description:
        "Using a custom property that does not resolve to a design token should use a design token.",
    },
  ],
});

// autofix tests
testRule({
  plugins: [plugin],
  ruleName,
  config: [true, { tokenType: "brand" }],
  fix: true,
  reject: [
    {
      code: ".a { font-weight: normal; }",
      fixed: ".a { font-weight: var(--font-weight); }",
      message: messages.rejected("normal"),
      description: "Normal keyword should be fixed to use design token.",
    },
    {
      code: ".a { font-weight: 600; }",
      fixed: ".a { font-weight: var(--font-weight-semibold); }",
      message: messages.rejected("600"),
      description: "Numeric value should be fixed to use design token.",
    },
    {
      code: ".a { font-weight: 700; }",
      fixed: ".a { font-weight: var(--font-weight-bold); }",
      message: messages.rejected("700"),
      description: "Numeric value should be fixed to use design token.",
    },
    {
      code: ".a { font-weight: 200; }",
      fixed: ".a { font-weight: var(--font-weight); }",
      message: messages.rejected("200"),
      description:
        "Numeric values less than or equal to 400 should be fixed to use the base font-weight token.",
    },
    {
      code: ".a { font-weight: 300; }",
      fixed: ".a { font-weight: var(--font-weight); }",
      message: messages.rejected("300"),
      description:
        "Numeric values less than or equal to 400 should be fixed to use the base font-weight token.",
    },
    {
      code: ".a { font-weight: 400; }",
      fixed: ".a { font-weight: var(--font-weight); }",
      message: messages.rejected("400"),
      description:
        "Numeric values less than or equal to 400 should be fixed to use the base font-weight token.",
    },
    {
      code: ".a { font-weight: lighter; }",
      fixed: ".a { font-weight: var(--font-weight); }",
      message: messages.rejected("lighter"),
      description:
        "The lighter keyword should be fixed to use the base font-weight token.",
    },
    {
      code: ".a { font-weight: 500; }",
      fixed: ".a { font-weight: var(--font-weight-semibold); }",
      message: messages.rejected("500"),
      description:
        "Numeric values between 500 and 600 should be fixed to use the semibold font-weight token.",
    },
    {
      code: ".a { font-weight: 510; }",
      fixed: ".a { font-weight: var(--font-weight-semibold); }",
      message: messages.rejected("510"),
      description:
        "Numeric values between 500 and 600 should be fixed to use the semibold font-weight token.",
    },
    {
      code: ".a { font-weight: 800; }",
      fixed: ".a { font-weight: var(--font-weight-bold); }",
      message: messages.rejected("800"),
      description:
        "Numeric values greater than 700 should be fixed to use the bold font-weight token.",
    },
    {
      code: ".a { font-weight: bold; }",
      fixed: ".a { font-weight: var(--font-weight-bold); }",
      message: messages.rejected("bold"),
      description:
        "The bold keyword should be fixed to use the bold font-weight token.",
    },
    {
      code: ".a { font-weight: bolder; }",
      fixed: ".a { font-weight: var(--font-weight-bold); }",
      message: messages.rejected("bolder"),
      description:
        "The bolder keyword should be fixed to use the bold font-weight token.",
    },
  ],
});
