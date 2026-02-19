/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/PL/2.0/.
 */

// Bug 1948378: remove this exception when the eslint import plugin fully
// supports exports in package.json files
// eslint-disable-next-line import/no-unresolved
import { testRule } from "stylelint-test-rule-node";
import stylelint from "stylelint";
import useDesignTokens from "../rules/use-design-tokens.mjs";

let plugin = stylelint.createPlugin(useDesignTokens.ruleName, useDesignTokens);
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
    {
      code: ".a { color: var(--text-color); }",
      description: "Using text color token for color is valid.",
    },
    {
      code: ".a { color: var(--link-color); }",
      description: "Using link text color token for color is valid.",
    },
    {
      code: ".a { color: var(--text-color, #000); }",
      description:
        "Using text color token with fallback value for color is valid.",
    },
    {
      code: `
        :root { --local-color: var(--text-color); }
        .a { color: var(--local-color); }
      `,
      description:
        "Using locally defined variable that falls back to text color token for color is valid.",
    },
    {
      code: ".a { color: light-dark(var(--text-color), var(--link-color)); }",
      description:
        "var using a text-color token inside a light-dark function is valid.",
    },
    {
      code: ".a { color: light-dark(color-mix(in srgb, var(--text-color) 10%, white), white); }",
      description:
        "color-mix using a text-color token inside a light-dark function is valid.",
    },
    {
      code: ".a { color: inherit; }",
      description: "Using keyword for color is valid.",
    },
    {
      code: ".a { color: initial; }",
      description: "Using keyword for color is valid.",
    },
    {
      code: ".a { color: revert; }",
      description: "Using keyword for color is valid.",
    },
    {
      code: ".a { color: revert-layer; }",
      description: "Using keyword for color is valid.",
    },
    {
      code: ".a { color: unset; }",
      description: "Using keyword for color is valid.",
    },
    {
      code: ".a { color: currentColor; }",
      description: "Using currentColor for color is valid.",
    },
  ],
  reject: [
    {
      code: ".a { color: #000; }",
      message: messages.rejected("#000", ["text-color"], "black"),
      description: "#000 should use a text-color design token.",
    },
    {
      code: ".a { color: rgba(42 42 42 / 0.15); }",
      message: messages.rejected("rgba(42 42 42 / 0.15)", ["text-color"]),
      description:
        "rgba(42 42 42 / 0.15) should use a text-color design token.",
    },
    {
      code: ".a { color: oklch(69% 0.19 15); }",
      message: messages.rejected("oklch(69% 0.19 15)", ["text-color"]),
      description: "oklch(69% 0.19 15) should use a text-color design token.",
    },
    {
      code: ".a { color: AccentColorText; }",
      message: messages.rejected("AccentColorText", ["text-color"]),
      description: "AccentColorText should use a text-color design token.",
    },
    {
      code: ".a { color: var(--random-color, #000); }",
      message: messages.rejected(
        "var(--random-color, #000)",
        ["text-color"],
        "var(--random-color, black)"
      ),
      description:
        "var(--random-color, #000) should use a text-color design token.",
    },
    {
      code: `
        :root { --custom-token: #666; }
        .a { color: var(--custom-token); }
      `,
      message: messages.rejected("var(--custom-token)", ["text-color"]),
      description: "var(--custom-token) should use a text-color design token.",
    },
    {
      code: ".a { color: color-mix(in srgb, var(--light), var(--dark)); }",
      message: messages.rejected(
        "color-mix(in srgb, var(--light), var(--dark))",
        ["text-color"]
      ),
      description:
        "color-mix(in srgb, var(--light), var(--dark)) should use a text-color design token.",
    },
    {
      code: ".a { color: light-dark(var(--light), var(--dark)); }",
      message: messages.rejected("light-dark(var(--light), var(--dark))", [
        "text-color",
      ]),
      description:
        "var inside a light-dark function should use a text-color design token.",
    },
    {
      code: ".a { color: light-dark(color-mix(in srgb, var(--dark) 10%, white), white); }",
      message: messages.rejected(
        "light-dark(color-mix(in srgb, var(--dark) 10%, white), white)",
        ["text-color"]
      ),
      description:
        "color-mix inside a light-dark function should use a text-color design token.",
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
      code: ".a { color: #fff; }",
      fixed: ".a { color: white; }",
      message: messages.rejected("#fff", ["text-color"], "white"),
      description: "#fff should be fixed to white.",
    },
    {
      code: ".a { color: #ffffff; }",
      fixed: ".a { color: white; }",
      message: messages.rejected("#ffffff", ["text-color"], "white"),
      description: "#ffffff should be fixed to white.",
    },
    {
      code: ".a { color: #FFF; }",
      fixed: ".a { color: white; }",
      message: messages.rejected("#FFF", ["text-color"], "white"),
      description: "#FFF should be fixed to white.",
    },
    {
      code: ".a { color: #FFFFFF; }",
      fixed: ".a { color: white; }",
      message: messages.rejected("#FFFFFF", ["text-color"], "white"),
      description: "#FFFFFF should be fixed to white.",
    },
    {
      code: ".a { color: #000; }",
      fixed: ".a { color: black; }",
      message: messages.rejected("#000", ["text-color"], "black"),
      description: "#000 should be fixed to black.",
    },
    {
      code: ".a { color: #000000; }",
      fixed: ".a { color: black; }",
      message: messages.rejected("#000000", ["text-color"], "black"),
      description: "#000000 should be fixed to black.",
    },
  ],
});
