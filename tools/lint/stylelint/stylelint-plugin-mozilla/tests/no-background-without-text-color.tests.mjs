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
import noBackgroundWithoutTextColor from "../rules/no-background-without-text-color.mjs";

let plugin = stylelint.createPlugin(
  noBackgroundWithoutTextColor.ruleName,
  noBackgroundWithoutTextColor
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
      code: ".a { background-color: var(--button-background-color); color: var(--button-text-color); }",
      description: "A background token with a text color.",
    },
    {
      code: ".a { color: var(--button-text-color); }",
      description: "A block that paints no background claims no surface.",
    },
    {
      code: ".a { background-color: var(--color-accent-primary); }",
      description: "A base color is not a background token.",
    },
    {
      code: ".a { background-color: var(--text-color-deemphasized); }",
      description:
        "A token with no background counterpart guarantees nothing to pair with.",
    },
    {
      code: ".a { background-color: transparent; }",
      description: "A background that paints nothing claims no surface.",
    },
    {
      code: ".a { background-color: var(--my-local-background); }",
      description: "A local custom property is not a token.",
    },
    {
      code: ".a { --box-background: var(--button-background-color); }",
      description: "Defining a custom property is not painting a surface.",
    },
    {
      code: ".a:hover { background-color: var(--button-background-color-hover); }",
      description:
        "A state variant takes the text color from the rule it varies.",
    },
    {
      code: ".a { &:hover { background-color: var(--button-background-color-hover); } }",
      description: "A nested state variant is one as well.",
    },
    {
      code: ".a:hover { .b { background-color: var(--button-background-color-hover); } }",
      description: "A block nested inside a state variant is covered too.",
    },
    {
      code: "menulist[disabled] { background-color: var(--button-background-color); }",
      description: "A state carried as an attribute is a state variant.",
    },
    {
      code: '.a[aria-expanded="true"] { background-color: var(--button-background-color); }',
      description: "An ARIA state attribute is one as well.",
    },
    {
      code: ".a:not(.b):is(:hover, [open]) { background-color: var(--button-background-color); }",
      description: "A state beside a negation still exempts the block.",
    },
    {
      code: ".a { background-color: var(--button-background-color); color: inherit; }",
      description: "Any text color satisfies the rule, token or not.",
    },
    {
      code: ".a { color: CanvasText; @media (prefers-contrast) { background-color: var(--button-background-color); } }",
      description:
        "An at-rule paints the surface of the rule around it, which has a text color.",
    },
    {
      code: ".a { color: var(--panel-text-color); background-color: var(--panel-background-color); }",
      description: "Declaration order does not matter.",
    },
    {
      code: "@namespace url(http://www.w3.org/1998/Math/MathML);",
      description: "A statement at-rule has no block to check.",
    },
    {
      code: ".a[type='text'] { background-color: var(--button-background-color); color: var(--button-text-color); }",
      description: "An attribute that is not a state is not a carve-out.",
    },
    {
      code: ".a { background-color: var(--badge-background-color-filled); --badge-text-color: var(--badge-text-color-filled); }",
      description:
        "A paired text token handed to a component through a custom property.",
    },
    {
      code: ".a { background-color: var(--button-background-color-ghost); --button-text-color-ghost: currentColor; }",
      description: "Defining the paired text token itself counts as well.",
    },
  ],
  reject: [
    {
      code: ".a { background-color: var(--sidebar-background-color); }",
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description: "A block that paints a surface and names no text color.",
      line: 1,
      column: 6,
    },
    {
      code: ".a { background: var(--panel-background-color) no-repeat; }",
      message: messages.noTextColor(
        "--panel-background-color",
        "--panel-text-color"
      ),
      description: "The background shorthand paints a surface too.",
      line: 1,
      column: 6,
    },
    {
      code: ".a { background-color: light-dark(var(--button-background-color-hover), var(--button-background-color-hover)); }",
      message: messages.noTextColor(
        "--button-background-color-hover",
        "--button-text-color-hover"
      ),
      description: "A token nested in light-dark() paints a surface.",
      line: 1,
      column: 6,
    },
    {
      code: ".a { @media (prefers-contrast) { background-color: var(--sidebar-background-color); } }",
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description:
        "Declarations nested directly inside an at-rule are checked.",
      line: 1,
      column: 34,
    },
    {
      code: ".a { background-color: var(--sidebar-background-color); color: var(--sidebar-text-color); &::after { background-color: var(--panel-background-color); } }",
      message: messages.noTextColor(
        "--panel-background-color",
        "--panel-text-color"
      ),
      description:
        "A pseudo-element paints its own surface and inherits nothing from its host block.",
      line: 1,
      column: 102,
    },
    {
      code: ".a { --box-radius: 4px; background-color: var(--sidebar-background-color); }",
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description:
        "A custom property that carries no text color does not excuse the block.",
      line: 1,
      column: 25,
    },
    {
      code: ".a { background-color: var(--button-background-color); @media (prefers-contrast) { color: CanvasText; } }",
      message: messages.noTextColor(
        "--button-background-color",
        "--button-text-color"
      ),
      description:
        "A text color set only inside a nested at-rule leaves the surface without one outside it.",
      line: 1,
      column: 6,
    },
    {
      code: ".a { &:not(:hover) { background-color: var(--button-background-color); } }",
      message: messages.noTextColor(
        "--button-background-color",
        "--button-text-color"
      ),
      description:
        "A negated state names the base state, which owes the surface a text color.",
      line: 1,
      column: 22,
    },
    {
      code: ".a:not([open]) { background-color: var(--button-background-color); }",
      message: messages.noTextColor(
        "--button-background-color",
        "--button-text-color"
      ),
      description: "A negated state attribute is no exemption either.",
      line: 1,
      column: 18,
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
      code: ".a { background-color: var(--sidebar-background-color); color: inherit; }",
      description: "A block that already has a text color is left alone.",
    },
    {
      code: ".a:hover { background-color: var(--button-background-color-hover); }",
      description: "A state variant is left alone as well.",
    },
    {
      code: "/* stylelint-disable-next-line stylelint-plugin-mozilla/no-background-without-text-color */\n.a { background-color: var(--sidebar-background-color); }",
      description: "A disable comment holds off the fix as well as the report.",
    },
  ],
  reject: [
    {
      code: ".a { background-color: var(--sidebar-background-color); }",
      fixed:
        ".a { background-color: var(--sidebar-background-color); color: var(--sidebar-text-color); }",
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description: "The counterpart is declared after the background.",
    },
    {
      code: ".a { background: var(--panel-background-color) no-repeat; }",
      fixed:
        ".a { background: var(--panel-background-color) no-repeat; color: var(--panel-text-color); }",
      message: messages.noTextColor(
        "--panel-background-color",
        "--panel-text-color"
      ),
      description: "The shorthand keeps its value and gains a text color.",
    },
    {
      code: ".a { background-color: light-dark(var(--button-background-color-hover), var(--button-background-color-hover)); }",
      fixed:
        ".a { background-color: light-dark(var(--button-background-color-hover), var(--button-background-color-hover)); color: var(--button-text-color-hover); }",
      message: messages.noTextColor(
        "--button-background-color-hover",
        "--button-text-color-hover"
      ),
      description: "A token nested in light-dark() gets its counterpart too.",
    },
    {
      code: ".a {\n  background-color: var(--sidebar-background-color);\n  border: 1px solid;\n}",
      fixed:
        ".a {\n  background-color: var(--sidebar-background-color);\n  color: var(--sidebar-text-color);\n  border: 1px solid;\n}",
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description: "The declaration takes the indentation of the block.",
    },
    {
      code: ".a {\n  @media (prefers-contrast) {\n    background-color: var(--sidebar-background-color);\n  }\n}",
      fixed:
        ".a {\n  @media (prefers-contrast) {\n    background-color: var(--sidebar-background-color);\n    color: var(--sidebar-text-color);\n  }\n}",
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description:
        "A surface painted only inside a query takes its text color there.",
    },
    {
      code: ".a { background-color: var(--sidebar-background-color); color: var(--sidebar-text-color); &::after { background-color: var(--panel-background-color); } }",
      fixed:
        ".a { background-color: var(--sidebar-background-color); color: var(--sidebar-text-color); &::after { background-color: var(--panel-background-color); color: var(--panel-text-color); } }",
      message: messages.noTextColor(
        "--panel-background-color",
        "--panel-text-color"
      ),
      description: "A nested block gets its own counterpart.",
    },
    {
      code: ".a {\n  background-color: var(--sidebar-background-color) !important;\n}",
      fixed:
        ".a {\n  background-color: var(--sidebar-background-color) !important;\n  color: var(--sidebar-text-color) !important;\n}",
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description:
        "A background forced with !important gets a counterpart that wins with it.",
    },
    {
      code: ".z {\n  border :0;\n}\n.a {\n  background-color: var(--sidebar-background-color);\n}",
      fixed:
        ".z {\n  border :0;\n}\n.a {\n  background-color: var(--sidebar-background-color);\n  color: var(--sidebar-text-color);\n}",
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description:
        "The spacing comes from the background declaration, not from the first one in the file.",
    },
    {
      code: ".a {\n  background-color: var(--sidebar-background-color); /* The row below hands it a color. */\n}",
      unfixable: true,
      message: messages.noTextColor(
        "--sidebar-background-color",
        "--sidebar-text-color"
      ),
      description:
        "A comment ending the declaration's line would move onto the inserted one, so the insertion is left to the author.",
    },
  ],
});
