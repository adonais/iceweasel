/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
// eslint-disable-next-line import/no-unresolved
import { testRule } from "stylelint-test-rule-node";
import stylelint from "stylelint";
import noNonSemanticTokenUsage from "../rules/no-non-semantic-token-usage.mjs";

let plugin = stylelint.createPlugin(
  noNonSemanticTokenUsage.ruleName,
  noNonSemanticTokenUsage
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
    // * allowed token usage
    {
      code: ".a { background-color: var(--background-color-canvas); }",
      description:
        "Using the canvas background color token with the background-color property is valid.",
    },
    {
      code: ".a { background-color: var(--background-color-canvas, #fff); }",
      description:
        "Using the canvas background color token with the background-color property is valid.",
    },
    {
      code: ".a { background-color: var(--background-color-canvas), #fff; }",
      description:
        "Using the canvas background color token with the background-color property is valid.",
    },
    {
      code: ".a { background: repeat cover var(--background-color-canvas); }",
      description:
        "Using the canvas background color token with the background property is valid.",
    },
    {
      code: ".a { border-color: var(--border-color); }",
      description:
        "Using the border color token with the border-color property is valid.",
    },
    {
      code: ".a { border: 2px solid var(--border-color); }",
      description:
        "Using the border color token with the border shorthand property is valid.",
    },
    {
      code: ".a { border: var(--border-width) solid var(--border-color); }",
      description:
        "Using the border width and border color tokens with the border shorthand property are valid.",
    },
    {
      code: ".a { border-radius: var(--border-radius-small, 0.25rem); }",
      description:
        "Using the small border radius token with the border-radius property is valid.",
    },
    {
      code: ".a { font-size: var(--font-size-small); }",
      description:
        "Using the small font size token with the font-size property is valid.",
    },
    {
      code: ".a { font: bold var(--font-size-small) 'Open Sans' sans-serif; }",
      description:
        "Using the small font size token with the font shorthand property is valid.",
    },
    {
      code: ".a { font-weight: var(--font-weight-bold); }",
      description:
        "Using the bold font size token with the font-weight property is valid.",
    },
    {
      code: ".a { font: var(--font-weight-bold) 16px 'Open Sans' sans-serif; }",
      description:
        "Using the bold font weight token with the font shorthand property is valid.",
    },
    {
      code: ".a { fill: var(--icon-color); }",
      description:
        "Using the icon color token with the fill property is valid.",
    },
    {
      code: ".a { height: var(--input-text-min-height); }",
      description:
        "Using the input text minimum height token with the height property is valid.",
    },
    {
      code: ".a { inset: var(--size-item-small) var(--size-item-small) var(--size-item-large) var(--size-item-xlarge); }",
      description:
        "Using the small, large, and xlarge size tokens with the inset property is valid.",
    },
    {
      code: ".a { opacity: var(--button-opacity-disabled); }",
      description:
        "Using the disabled button opacity token with the opacity property is valid.",
    },
    {
      code: ".a { padding: var(--space-small) 4px; }",
      description:
        "Using the small space token with the padding property is valid.",
    },
    {
      code: ".a { color: var(--text-color); }",
      description:
        "Using the text color token with the color property is valid.",
    },
    {
      code: ".a { color: var(--button-text-color); }",
      description:
        "Using the button text color token with the color property is valid.",
    },
    {
      code: ".a { box-shadow: var(--box-shadow-level-3); }",
      description:
        "Using the 3rd-level box shadow token with the box-shadow property is valid.",
    },
    {
      code: ".a { box-shadow: var(--box-shadow-level-2), var(--box-shadow-level-4); }",
      description:
        "Using the 2nd-level and 4th-level box shadow tokens with the box-shadow property is valid.",
    },
    {
      code: `
        button {
          background-color: var(--background-color-canvas);
          color: var(--text-color);
          border: 2px solid var(--border-color);
        }
      `,
      description:
        "Using the canvas background color token with the background-color property, the text color token with the color property, and the border color token with the border shorthand property are valid.",
    },
  ],
  reject: [
    {
      code: ".a { background: var(--border-color); }",
      message: messages.rejected("var(--border-color)"),
      description:
        "Unexpected usage of `var(--border-color)`. Design tokens should only be used with properties matching their semantic meaning.",
    },
    {
      code: ".a { border: var(--font-size-xsmall) solid var(--border-color); }",
      message: messages.rejected("var(--font-size-xsmall)"),
      description:
        "Unexpected usage of `var(--font-size-xsmall)`. Design tokens should only be used with properties matching their semantic meaning.",
    },
    {
      code: ".a { border: var(--border-width) solid var(--background-color-canvas); }",
      message: messages.rejected("var(--background-color-canvas)"),
      description:
        "Unexpected usage of `var(--background-color-canvas)`. Design tokens should only be used with properties matching their semantic meaning.",
    },
    {
      code: `
        :root { --local-background-color: var(--border-color); }
        .a { background: var(--local-background-color); }
      `,
      message: messages.rejected("var(--border-color)"),
      description:
        "Unexpected usage of `var(--border-color)`. Design tokens should only be used with properties matching their semantic meaning.",
    },
    {
      code: ".a { padding: var(--space-small) 4px var(--size-item-large) var(--space-small); }",
      message: messages.rejected("var(--size-item-large)"),
      description:
        "Unexpected usage of `var(--size-item-large)`. Design tokens should only be used with properties matching their semantic meaning.",
    },
  ],
});
