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
import useBackgroundColorTokens from "../rules/use-background-color-tokens.mjs";

let plugin = stylelint.createPlugin(
  useBackgroundColorTokens.ruleName,
  useBackgroundColorTokens
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
    {
      code: ".bg { background-color: var(--background-color-box); }",
      description: "Using background-color token is valid.",
    },
    {
      code: ".bg { background-color: var(--background-color-box, #666); }",
      description:
        "Using background-color token with a raw color fallback is valid.",
    },
    {
      code: ".bg { background-color: var(--background-color-box, var(--another-token)); }",
      description:
        "Using background-color token with a variable fallback is valid.",
    },
    {
      code: `
        :root { --custom-token: var(--background-color-box); }
        .bg { background-color: var(--custom-token); }
      `,
      description:
        "Using a custom token that resolves to a background-color token is valid.",
    },
    {
      code: ".bg { background-color: inherit; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: initial; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: revert; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: revert-layer; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: unset; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: transparent; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: currentColor; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: auto; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: normal; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background-color: none; }",
      description: "Using a keyword is valid.",
    },
    {
      code: ".bg { background: var(--background-color-box); }",
      description: "Using background-color token is valid in the shorthand.",
    },
    {
      code: ".bg { background: var(--background-color-box, #666); }",
      description:
        "Using background-color token with a raw color fallback is valid in the shorthand.",
    },
    {
      code: ".bg { background: var(--background-color-box, var(--another-token)); }",
      description:
        "Using background-color token with a token fallback is valid in the shorthand.",
    },
    {
      code: `
        :root { --custom-token: var(--background-color-box); }
        .bg { background: var(--custom-token); }
      `,
      description:
        "Using a custom token that resolves to a background-color token is valid in the shorthand.",
    },
    {
      code: ".bg { background: url('image.png'); }",
      description:
        "Using the background shorthand without any color declarations is valid.",
    },
    {
      code: ".bg { background: linear-gradient(to bottom, #fff, #000) var(--background-color-box); }",
      description:
        "Using the background shorthand, other properties plus a background-color token is valid.",
    },
    {
      code: ".bg { background: url('image.png') no-repeat center center / auto var(--background-color-box, oklch(69% 0.19 15)); }",
      description:
        "Using a background-color token with a raw color value fallback is valid in the shorthand.",
    },
    {
      code: ".bg { background: url('image.png') fixed content-box var(--background-color-box, var(--another-token)); }",
      description:
        "Using a background-color token with another token fallback is valid in the shorthand.",
    },
    {
      code: `
        :root { --custom-token: var(--background-color-box); }
        .bg { background: url('image.png') var(--custom-token) repeat-y fixed; }
      `,
      description:
        "Using a custom token that resolves to a background-color token is valid in the shorthand.",
    },
    {
      code: ".bg { background: inherit; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: initial; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: revert; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: revert-layer; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: unset; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: transparent; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: currentColor; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: auto; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: normal; }",
      description: "Using a keyword is valid in the shorthand.",
    },
    {
      code: ".bg { background: none; }",
      description: "Using a keyword is valid in the shorthand.",
    },
  ],

  reject: [
    {
      code: ".bg { background-color: #666; }",
      message: messages.rejected("#666"),
      description: "#666 should use a background-color design token.",
    },
    {
      code: ".bg { background-color: #fff0; }",
      message: messages.rejected("#fff0"),
      description: "#fff0 should use a background-color design token.",
    },
    {
      code: ".bg { background-color: #666666; }",
      message: messages.rejected("#666666"),
      description: "#666666 should use a background-color design token.",
    },
    {
      code: ".bg { background-color: #ffffff00; }",
      message: messages.rejected("#ffffff00"),
      description: "#ffffff00 should use a background-color design token.",
    },
    {
      code: ".bg { background-color: oklch(69% 0.19 15); }",
      message: messages.rejected("oklch(69% 0.19 15)"),
      description:
        "oklch(69% 0.19 15) should use a background-color design token.",
    },
    {
      code: ".bg { background-color: rgba(42 42 42 / 0.15); }",
      message: messages.rejected("rgba(42 42 42 / 0.15)"),
      description:
        "rgba(42 42 42 / 0.15) should use a background-color design token.",
    },
    {
      code: ".bg { background-color: ButtonFace; }",
      message: messages.rejected("ButtonFace"),
      description: "ButtonFace should use a background-color design token.",
    },
    {
      code: ".bg { background-color: var(--random-token, oklch(69% 0.19 15)); }",
      message: messages.rejected("var(--random-token, oklch(69% 0.19 15))"),
      description:
        "var(--random-token, oklch(69% 0.19 15)) should use a background-color design token.",
    },
    {
      code: `
        :root { --custom-token: #666; }
        .bg { background-color: var(--custom-token); }
      `,
      message: messages.rejected("var(--custom-token)"),
      description:
        "var(--custom-token) should use a background-color design token.",
    },
    {
      code: ".bg { background: #666; }",
      message: messages.rejected("#666"),
      description: "#666 should use a background-color design token.",
    },
    {
      code: ".bg { background: #fff0; }",
      message: messages.rejected("#fff0"),
      description: "#fff0 should use a background-color design token.",
    },
    {
      code: ".bg { background: #666666; }",
      message: messages.rejected("#666666"),
      description: "#666666 should use a background-color design token.",
    },
    {
      code: ".bg { background: #ffffff00; }",
      message: messages.rejected("#ffffff00"),
      description: "#ffffff00 should use a background-color design token.",
    },
    {
      code: ".bg { background: oklch(69% 0.19 15); }",
      message: messages.rejected("oklch(69% 0.19 15)"),
      description:
        "oklch(69% 0.19 15) should use a background-color design token.",
    },
    {
      code: ".bg { background: rgba(42 42 42 / 0.15); }",
      message: messages.rejected("rgba(42 42 42 / 0.15)"),
      description:
        "rgba(42 42 42 / 0.15) should use a background-color design token.",
    },
    {
      code: ".bg { background: border-box #666; }",
      message: messages.rejected("border-box #666"),
      description:
        "border-box #666 should use a background-color design token.",
    },
    {
      code: ".bg { background: url('image.png') #fff0, #666; }",
      message: messages.rejected("url('image.png') #fff0, #666"),
      description:
        "url('image.png') #fff0, #666 should use a background-color design token.",
    },
    {
      code: ".bg { background: url('image.png') oklch(69% 0.19 15) repeat-y; }",
      message: messages.rejected(
        "url('image.png') oklch(69% 0.19 15) repeat-y"
      ),
      description:
        "url('image.png') oklch(69% 0.19 15) repeat-y should use a background-color design token.",
    },
    {
      code: ".bg { background: url('image.png') top center fixed #ffffff00; }",
      message: messages.rejected("url('image.png') top center fixed #ffffff00"),
      description:
        "url('image.png') top center fixed #ffffff00 should use a background-color design token.",
    },
    {
      code: ".bg { background: url('image.png') center left / auto no-repeat scroll content-box padding-box red, rgba(42 42 42 / 0.15); }",
      message: messages.rejected(
        "url('image.png') center left / auto no-repeat scroll content-box padding-box red, rgba(42 42 42 / 0.15)"
      ),
      description:
        "url('image.png') center left / auto no-repeat scroll content-box padding-box red, rgba(42 42 42 / 0.15) should use a background-color design token.",
    },
    {
      code: ".bg { background: url('image.png') var(--random-token, rgba(42 42 42 / 0.15)); }",
      message: messages.rejected(
        "url('image.png') var(--random-token, rgba(42 42 42 / 0.15))"
      ),
      description:
        "url('image.png') var(--random-token, rgba(42 42 42 / 0.15)) should use a background-color design token.",
    },
    {
      code: ".bg { background: url('image.png') Canvas; }",
      message: messages.rejected("url('image.png') Canvas"),
      description:
        "url('image.png') Canvas should use a background-color design token.",
    },
    {
      code: `
        :root { --custom-token: #666666; }
        .bg { background: url('image.png') no-repeat center / auto var(--custom-token); }
      `,
      message: messages.rejected(
        "url('image.png') no-repeat center / auto var(--custom-token)"
      ),
      description:
        "url('image.png') no-repeat center / auto var(--custom-token) should use a background-color design token.",
    },
  ],
});
