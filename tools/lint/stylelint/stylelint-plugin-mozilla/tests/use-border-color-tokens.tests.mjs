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
import useBorderColorTokens from "../rules/use-border-color-tokens.mjs";

let plugin = stylelint.createPlugin(
  useBorderColorTokens.ruleName,
  useBorderColorTokens
);
let {
  ruleName,
  rule: { messages },
} = plugin;

testRule({
  plugins: [plugin],
  ruleName,
  config: true,
  fix: false,
  accept: [
    // allowed token values
    {
      code: ".a { border: 2px solid var(--border-color); }",
      description: "Using border token in border shorthand is valid.",
    },
    {
      code: ".a { border-color: var(--border-color); }",
      description: "Using border-color token is valid.",
    },
    {
      code: ".a { border-top: 2px solid var(--border-color); }",
      description: "Using border token in border-top is valid.",
    },
    {
      code: ".a { border-right: 2px solid var(--border-color); }",
      description: "Using border token in border-right is valid.",
    },
    {
      code: ".a { border-bottom: 2px solid var(--border-color); }",
      description: "Using border token in border-bottom is valid.",
    },
    {
      code: ".a { border-left: 2px solid var(--border-color); }",
      description: "Using border token in border-left is valid.",
    },
    {
      code: ".a { border-top-color: var(--border-color); }",
      description: "Using border token in border-top-color is valid.",
    },
    {
      code: ".a { border-right-color: var(--border-color); }",
      description: "Using border token in border-right-color is valid.",
    },
    {
      code: ".a { border-bottom-color: var(--border-color); }",
      description: "Using border token in border-bottom-color is valid.",
    },
    {
      code: ".a { border-left-color: var(--border-color); }",
      description: "Using border token in border-left-color is valid.",
    },
    {
      code: ".a { outline: 1px solid var(--border-color); }",
      description: "Using border token in outline shorthand is valid.",
    },
    {
      code: ".a { outline-color: var(--border-color); }",
      description: "Using border token in outline-color is valid.",
    },
    // allowed CSS values
    {
      code: ".a { border-color: currentColor; }",
      description: "Using currentColor is valid.",
    },
    {
      code: ".a { border-color: white; }",
      description: "Using white is valid.",
    },
    {
      code: ".a { border-color: black; }",
      description: "Using black is valid.",
    },
    {
      code: ".a { border: none; }",
      description: "Using none is valid.",
    },
    {
      code: ".a { border: 0; }",
      description: "Using 0 is valid.",
    },
    {
      code: ".a { border: 1px solid transparent; }",
      description: "Using transparent in shorthand is valid.",
    },
    {
      code: ".a { border-color: var(--border-color, var(--another-property)); }",
      description: "Using a fallback value with two tokens is valid.",
    },
    {
      code: ".a { border: 1px solid var(--border-color, transparent); }",
      description: "Using a fallback value with an allowed value is valid",
    },
    {
      code: ".a { border: 1px solid var(--border-color, #666); }",
      description: "Using a fallback value with an color value is valid",
    },
    {
      code: `
        :root { --custom-token: var(--border-color); }
        .a { border-color: var(--custom-token); }
      `,
      description: "Using a local custom property (in the same file) is valid.",
    },
    {
      code: `
        :root { --custom-token: var(--border-color); }
        .a { border: 1px solid var(--custom-token); }
      `,
      description:
        "Using a local custom property (in the same file) in shorthand is valid.",
    },
    {
      code: "outline: var(--focus-outline);",
      description: "Using a focus-outline token in outline is valid.",
    },
    {
      code: `
        :root { --custom-token: var(--border-width) solid var(--border-color); }
        .a { border: var(--custom-token); }
      `,
    },
  ],

  reject: [
    {
      code: ".a { border-color: #666; }",
      message: messages.rejected("#666"),
      description: "#666 should use a border-color design token.",
    },
    {
      code: ".a { border: 2px solid #666; }",
      message: messages.rejected("2px solid #666"),
      description: "2px solid #666 should use a border-color design token.",
    },
    {
      code: ".a { border-color: oklch(69% 0.19 15); }",
      message: messages.rejected("oklch(69% 0.19 15)"),
      description: "oklch(69% 0.19 15) should use a border-color design token.",
    },
    {
      code: ".a { border: 3px dashed oklch(42 42 42); }",
      message: messages.rejected("3px dashed oklch(42 42 42)"),
      description:
        "3px dashed oklch(42 42 42) should use a border-color design token.",
    },
    {
      code: ".a { border-color: rgba(42 42 42 / 0.15); }",
      message: messages.rejected("rgba(42 42 42 / 0.15)"),
      description:
        "rgba(42 42 42 / 0.15) should use a border-color design token.",
    },
    {
      code: ".a { border: 3px dashed rgba(42 42 42 / 0.15); }",
      message: messages.rejected("3px dashed rgba(42 42 42 / 0.15)"),
      description:
        "3px dashed rgba(42 42 42 / 0.15) should use a border-color design token.",
    },
    {
      code: ".a { border-top: 1px solid #666666; }",
      message: messages.rejected("1px solid #666666"),
      description: "1px solid #666666 should use a border-color design token.",
    },
    {
      code: ".a { border-top-color: rgb(10 20 30); }",
      message: messages.rejected("rgb(10 20 30)"),
      description: "rgb(10 20 30) should use a border-color design token.",
    },
    {
      code: ".a { border-right: 4px dotted #666; }",
      message: messages.rejected("4px dotted #666"),
      description: "4px dotted #666 should use a border-color design token.",
    },
    {
      code: ".a { border-right-color: oklch(69% 0.19 15); }",
      message: messages.rejected("oklch(69% 0.19 15)"),
      description: "oklch(69% 0.19 15) should use a border-color design token.",
    },
    {
      code: ".a { border-bottom: medium solid color-mix(in srgb, red, blue); }",
      message: messages.rejected("medium solid color-mix(in srgb, red, blue)"),
      description:
        "color-mix(in srgb, red, blue) should use a border-color design token.",
    },
    {
      code: ".a { border-bottom-color: oklch(69% 0.19 15); }",
      message: messages.rejected("oklch(69% 0.19 15)"),
      description: "oklch(69% 0.19 15) should use a border-color design token.",
    },
    {
      code: ".a { border-left: thin double #191919; }",
      message: messages.rejected("thin double #191919"),
      description:
        "thin double #989898 should use a border-color design token.",
    },
    {
      code: ".a { border-left-color: oklch(69% 0.19 15); }",
      message: messages.rejected("oklch(69% 0.19 15)"),
      description: "oklch(69% 0.19 15) should use a border-color design token.",
    },
    {
      code: ".a { outline: 2px solid #666; }",
      message: messages.rejected("2px solid #666"),
      description: "2px solid #616263 should use a border-color design token.",
    },
    {
      code: ".a { outline-color: rgba(0 0 0 / 0.25); }",
      message: messages.rejected("rgba(0 0 0 / 0.25)"),
      description: "rgba(0 0 0 / 0.25) should use a border-color design token.",
    },
    {
      code: ".a { border: 1px solid var(--random-token, #666); }",
      message: messages.rejected("1px solid var(--random-token, #666)"),
      description:
        "1px solid var(--random-token, #666) should use a border-color design token.",
    },
    {
      code: `
        :root { --custom-token: #666; }
        .a { border-color: var(--custom-token); }
      `,
      message: messages.rejected("var(--custom-token)"),
      description:
        "var(--custom-token) should use a border-color design token.",
    },
    {
      code: `
        :root { --custom-token: oklch(69% 0.19 15); }
        .a { border: 1px solid var(--custom-token); }
      `,
      message: messages.rejected("1px solid var(--custom-token)"),
      description:
        "1px solid var(--custom-token) should use a border-color design token.",
    },
  ],
});

testRule({
  plugins: [plugin],
  ruleName,
  config: true,
  fix: true,
  reject: [
    {
      code: ".a { border-color: #fff; }",
      fixed: ".a { border-color: white; }",
      message: messages.rejected("#fff"),
      description: "#fff should be fixed to white",
    },
    {
      code: ".a { border: 1px solid #ffffff; }",
      fixed: ".a { border: 1px solid white; }",
      message: messages.rejected("1px solid #ffffff"),
      description: "#ffffff should be fixed to white",
    },
    {
      code: ".a { outline-color: #FFF; }",
      fixed: ".a { outline-color: white; }",
      message: messages.rejected("#FFF"),
      description: "#FFF should be fixed to white",
    },
    {
      code: ".a { border-left-color: #FFFFFF; }",
      fixed: ".a { border-left-color: white; }",
      message: messages.rejected("#FFFFFF"),
      description: "#FFFFFF should be fixed to white",
    },
    {
      code: ".a { outline: 1px solid #000; }",
      fixed: ".a { outline: 1px solid black; }",
      message: messages.rejected("1px solid #000"),
      description: "#000 should be fixed to black",
    },
    {
      code: ".a { border-block-end-color: #000000; }",
      fixed: ".a { border-block-end-color: black; }",
      message: messages.rejected("#000000"),
      description: "#000000 should be fixed to black",
    },
  ],
});
