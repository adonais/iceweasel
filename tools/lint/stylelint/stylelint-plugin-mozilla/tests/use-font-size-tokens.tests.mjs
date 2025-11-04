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
import useFontSizeTokens from "../rules/use-font-size-tokens.mjs";

let plugin = stylelint.createPlugin(
  useFontSizeTokens.ruleName,
  useFontSizeTokens
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
      code: ".a { font-size: var(--font-size-root); }",
      description: "Using root font-size token is valid.",
    },
    {
      code: ".a { font-size: var(--font-size-xsmall); }",
      description: "Using xsmall font-size token is valid.",
    },
    {
      code: ".a { font-size: var(--font-size-small); }",
      description: "Using small font-size token is valid.",
    },
    {
      code: ".a { font-size: var(--font-size-large); }",
      description: "Using large font-size token is valid.",
    },
    {
      code: ".a { font-size: var(--font-size-xlarge); }",
      description: "Using xlarge font-size token is valid.",
    },
    {
      code: ".a { font-size: var(--font-size-xxlarge); }",
      description: "Using xxlarge font-size token is valid.",
    },
    {
      code: ".a { font-size: var(--font-size-xxxlarge); }",
      description: "Using xxxlarge font-size token is valid.",
    },
    {
      code: ".a { font-size: var(--heading-font-size-medium); }",
      description: "Using heading-font-size-medium token is valid.",
    },
    {
      code: ".a { font-size: var(--heading-font-size-large); }",
      description: "Using heading-font-size-large token is valid.",
    },
    {
      code: ".a { font-size: var(--heading-font-size-xlarge); }",
      description: "Using heading-font-size-xlarge token is valid.",
    },
    // allowed CSS values
    {
      code: ".a { font-size: xx-small; }",
      description: "Using xx-small keyword is valid.",
    },
    {
      code: ".a { font-size: x-small; }",
      description: "Using x-small keyword is valid.",
    },
    {
      code: ".a { font-size: small; }",
      description: "Using small keyword is valid.",
    },
    {
      code: ".a { font-size: medium; }",
      description: "Using medium keyword is valid.",
    },
    {
      code: ".a { font-size: large; }",
      description: "Using large keyword is valid.",
    },
    {
      code: ".a { font-size: x-large; }",
      description: "Using x-large keyword is valid.",
    },
    {
      code: ".a { font-size: xx-large; }",
      description: "Using xx-large keyword is valid.",
    },
    {
      code: ".a { font-size: xxx-large; }",
      description: "Using xxx-large keyword is valid.",
    },
    {
      code: ".a { font-size: smaller; }",
      description: "Using smaller keyword is valid.",
    },
    {
      code: ".a { font-size: larger; }",
      description: "Using larger keyword is valid.",
    },
    {
      code: ".a { font-size: inherit; }",
      description: "Using inherit is valid.",
    },
    {
      code: ".a { font-size: initial; }",
      description: "Using initial is valid.",
    },
    {
      code: ".a { font-size: unset; }",
      description: "Using unset is valid.",
    },
    {
      code: ".a { font-size:var(--my-local, var(--font-size-small)); }",
      description:
        "Using a custom property with fallback to design token is valid.",
    },
    {
      code: `
        :root { --custom-token: var(--font-size-small); }
        .a { font-size: var(--custom-token); }
      `,
      description:
        "Using a custom property with fallback to a design token is valid.",
    },
  ],

  reject: [
    {
      code: ".a { font-size: 12px; }",
      message: messages.rejected("12px"),
      description: "Using a pixel value should use a design token.",
    },
    {
      code: ".a { font-size: 1rem; }",
      message: messages.rejected("1rem"),
      description: "Using a rem value should use a design token.",
    },
    {
      code: ".a { font-size: 1.2em; }",
      message: messages.rejected("1.2em"),
      description: "Using an em value should use a design token.",
    },
    {
      code: ".a { font-size: 100%; }",
      message: messages.rejected("100%"),
      description: "Using a percentage value should use a design token.",
    },
    {
      code: ".a { font-size: 16pt; }",
      message: messages.rejected("16pt"),
      description: "Using a pt value should use a design token.",
    },
    {
      code: ".a { font-size: calc(var(--my-local) + 2px); }",
      message: messages.rejected("calc(var(--my-local) + 2px)"),
      description:
        "Using a calc() with custom variables should use a design token.",
    },
    {
      code: ".a { font-size: var(--random-token, 14px); }",
      message: messages.rejected("var(--random-token, 14px)"),
      description: "Using a custom property should use a design token.",
    },
    {
      code: `
        :root { --custom-token: 14px; }
        .a { font-size: var(--custom-token); }
      `,
      message: messages.rejected("var(--custom-token)"),
      description:
        "Using a custom property that does not resolve to a design token should use a design token.",
    },
  ],
});
