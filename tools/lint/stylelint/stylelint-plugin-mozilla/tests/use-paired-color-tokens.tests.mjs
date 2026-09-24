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
import usePairedColorTokens from "../rules/use-paired-color-tokens.mjs";

let plugin = stylelint.createPlugin(
  usePairedColorTokens.ruleName,
  usePairedColorTokens
);
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
      code: ".a { background-color: var(--button-background-color-hover); color: var(--button-text-color-hover); }",
      description: "A background token used with its paired text token.",
    },
    {
      code: ".a { background-color: var(--button-background-color); }",
      description:
        "A background token alone leaves the text color to the cascade.",
    },
    {
      code: ".a { color: var(--button-text-color); }",
      description:
        "A text token alone leaves the background to another element.",
    },
    {
      code: ".a { background-color: transparent; color: var(--sidebar-text-color); }",
      description: "A text token over a background that paints nothing.",
    },
    {
      code: ".a { background-color: var(--panel-background-color); color: var(--text-color-deemphasized); }",
      description:
        "The global text color tokens pair with any background surface.",
    },
    {
      code: ".a { background-color: var(--background-color-box); color: var(--text-color-error); }",
      description:
        "The global background color tokens pair with any text color.",
    },
    {
      code: ".a { background-color: var(--urlbar-box-background-color-focus); color: var(--urlbar-box-text-color); }",
      description:
        "A variant with no text token of its own falls back to the family's base one.",
    },
    {
      code: ".a { background-color: var(--color-accent-primary); color: var(--button-text-color-primary); }",
      description:
        "A base color is not a background token, so it makes no pairing claim.",
    },
    {
      code: ".a { background-color: var(--button-background-color); color: var(--my-local-color); }",
      description: "A local custom property makes no pairing claim.",
    },
    {
      code: ".a { --box-background: var(--button-background-color); color: var(--panel-text-color); }",
      description: "Defining a custom property is not using the token.",
    },
    {
      code: ".a { background-color: light-dark(var(--button-background-color), var(--button-background-color)); color: var(--button-text-color); }",
      description: "Tokens nested in light-dark() are paired up.",
    },
    {
      code: ".a { background-color: var(--button-background-color); color: var(--button-text-color); &:hover { background-color: var(--button-background-color-hover); color: var(--button-text-color-hover); } }",
      description: "A nested rule is paired up on its own.",
    },
    {
      code: ".a { background: var(--panel-background-color) no-repeat; color: var(--panel-text-color); }",
      description: "The background shorthand carries the pair too.",
    },
    {
      code: ".a { background-color: var(--my-thing-background-color-hover); color: var(--my-thing-text-color-pressed); }",
      description:
        "Custom properties that merely look like tokens are not variants of anything.",
    },
    {
      code: "@namespace url(http://www.w3.org/1998/Math/MathML);\n.a { color: var(--panel-text-color); }",
      description: "A statement at-rule has no block to check.",
    },
    {
      code: '@import url("chrome://global/skin/design-system/tokens-brand.css");\n.a { background-color: var(--panel-background-color); color: var(--panel-text-color); }',
      description: "An @import is not a block either.",
    },
    {
      code: ".a { background-color: var(--sidebar-background-color); color: var(--panel-text-color); color: var(--sidebar-text-color); }",
      description:
        "The color declaration that wins the cascade is the paired one.",
    },
  ],
  reject: [
    {
      code: ".a { background-color: var(--button-background-color-menu); color: var(--button-text-color); }",
      message: messages.notPaired(
        "--button-background-color-menu",
        "--button-text-color",
        "--button-text-color-menu"
      ),
      description:
        "A variant background with the base text color, when the variant has its own text token.",
      line: 1,
      column: 61,
    },
    {
      code: ".a { background-color: var(--sidebar-background-color); color: var(--panel-text-color); }",
      message: messages.notPaired(
        "--sidebar-background-color",
        "--panel-text-color",
        "--sidebar-text-color"
      ),
      description: "Paired tokens from two different components.",
      line: 1,
      column: 57,
    },
    {
      code: ".a { background: var(--panel-background-color) no-repeat; color: var(--sidebar-text-color); }",
      message: messages.notPaired(
        "--panel-background-color",
        "--sidebar-text-color",
        "--panel-text-color"
      ),
      description: "The background shorthand is checked as well.",
      line: 1,
      column: 59,
    },
    {
      code: ".a { background-color: var(--urlbar-box-background-color-focus); color: var(--urlbar-box-text-color-hover); }",
      message: messages.noPairedTokenUseBase(
        "--urlbar-box-background-color-focus",
        "--urlbar-box-text-color-hover",
        "--urlbar-box-text-color-focus",
        "--urlbar-box-text-color"
      ),
      description:
        "Two variants of one family where the background's text token does not exist, but the family's base one does.",
      line: 1,
      column: 66,
    },
    {
      code: ".a { background-color: var(--urlbarview-background-color-hover); color: var(--urlbarview-text-color-selected); }",
      message: messages.noPairedToken(
        "--urlbarview-background-color-hover",
        "--urlbarview-text-color-selected",
        "--urlbarview-text-color-hover"
      ),
      description:
        "Two variants of one family where neither the counterpart nor the family's base text token exists.",
      line: 1,
      column: 66,
    },
    {
      code: ".a { background-color: var(--button-background-color); color: var(--button-text-color-hover); &:hover { background-color: var(--button-background-color-hover); color: var(--button-text-color-hover); } }",
      message: messages.notPaired(
        "--button-background-color",
        "--button-text-color-hover",
        "--button-text-color"
      ),
      description: "A nested rule does not excuse its parent.",
      line: 1,
      column: 56,
    },
    {
      code: ".a { @media (prefers-contrast) { background-color: var(--sidebar-background-color); color: var(--panel-text-color); } }",
      message: messages.notPaired(
        "--sidebar-background-color",
        "--panel-text-color",
        "--sidebar-text-color"
      ),
      description:
        "Declarations nested directly inside an at-rule are checked.",
      line: 1,
      column: 85,
    },
    {
      code: ".a { background-color: var(--urlbarview-background-color-selected); color: var(--urlbarview-text-color-secondary); }",
      message: messages.notPaired(
        "--urlbarview-background-color-selected",
        "--urlbarview-text-color-secondary",
        "--urlbarview-text-color-selected"
      ),
      description:
        "A variant whose counterpart exists is reported against it, even when the text token used is unpaired.",
      line: 1,
      column: 69,
    },
    {
      code: ".a { background-color: var(--sidebar-background-color); color: var(--sidebar-text-color); color: var(--panel-text-color); }",
      message: messages.notPaired(
        "--sidebar-background-color",
        "--panel-text-color",
        "--sidebar-text-color"
      ),
      description:
        "An earlier correct pair does not excuse the color declaration that wins.",
      line: 1,
      column: 91,
    },
  ],
});

testRule({
  plugins: [plugin],
  ruleName,
  config: [true],
  fix: true,
  accept: [
    {
      code: ".a { background-color: var(--button-background-color-menu); }",
      description: "A background color on its own does not gain a text color.",
    },
    {
      code: ".a { color: var(--panel-text-color); }",
      description: "A text color on its own is left alone as well.",
    },
  ],
  reject: [
    {
      code: ".a { background-color: var(--button-background-color-menu); color: var(--button-text-color); }",
      fixed:
        ".a { background-color: var(--button-background-color-menu); color: var(--button-text-color-menu); }",
      message: messages.notPaired(
        "--button-background-color-menu",
        "--button-text-color",
        "--button-text-color-menu"
      ),
      description: "The paired text token replaces the one used.",
    },
    {
      code: ".a { background-color: var(--sidebar-background-color); color: var(--panel-text-color); }",
      fixed:
        ".a { background-color: var(--sidebar-background-color); color: var(--sidebar-text-color); }",
      message: messages.notPaired(
        "--sidebar-background-color",
        "--panel-text-color",
        "--sidebar-text-color"
      ),
      description: "A text token from another component is replaced too.",
    },
    {
      code: ".a { background-color: var(--sidebar-background-color); color: light-dark(var(--panel-text-color), var(--panel-text-color)); }",
      fixed:
        ".a { background-color: var(--sidebar-background-color); color: light-dark(var(--sidebar-text-color), var(--sidebar-text-color)); }",
      message: messages.notPaired(
        "--sidebar-background-color",
        "--panel-text-color",
        "--sidebar-text-color"
      ),
      description: "Every read of the token is replaced, fallbacks included.",
    },
    {
      code: ".a { background-color: var(--urlbarview-background-color-selected); color: var(--urlbarview-text-color-secondary); }",
      fixed:
        ".a { background-color: var(--urlbarview-background-color-selected); color: var(--urlbarview-text-color-selected); }",
      message: messages.notPaired(
        "--urlbarview-background-color-selected",
        "--urlbarview-text-color-secondary",
        "--urlbarview-text-color-selected"
      ),
      description:
        "An unpaired text token is replaced with the background's counterpart.",
    },
    {
      code: ".a { background-color: var(--urlbar-box-background-color-focus); color: var(--urlbar-box-text-color-hover); }",
      unfixable: true,
      message: messages.noPairedTokenUseBase(
        "--urlbar-box-background-color-focus",
        "--urlbar-box-text-color-hover",
        "--urlbar-box-text-color-focus",
        "--urlbar-box-text-color"
      ),
      description:
        "Falling back to the family's base text color is left to the author.",
    },
    {
      code: ".a { background-color: var(--urlbarview-background-color-hover); color: var(--urlbarview-text-color-selected); }",
      unfixable: true,
      message: messages.noPairedToken(
        "--urlbarview-background-color-hover",
        "--urlbarview-text-color-selected",
        "--urlbarview-text-color-hover"
      ),
      description: "A token that does not exist cannot be filled in.",
    },
  ],
});
