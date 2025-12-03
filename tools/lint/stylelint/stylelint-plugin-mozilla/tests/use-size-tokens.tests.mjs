/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
// eslint-disable-next-line import/no-unresolved
import { testRule } from "stylelint-test-rule-node";
import stylelint from "stylelint";
import useSizeTokens from "../rules/use-size-tokens.mjs";

let plugin = stylelint.createPlugin(useSizeTokens.ruleName, useSizeTokens);
let {
  ruleName,
  rule: { messages },
} = plugin;

testRule({
  plugins: [plugin],
  ruleName,
  config: true,
  fix: true,
  accept: [
    {
      code: ".a { max-height: var(--size-item-medium); }",
      description:
        "Using the medium item size token with the max-height property is valid.",
    },
    {
      code: ".a { min-height: var(--size-item-large); }",
      description:
        "Using the large item size token with the min-height property is valid.",
    },
    {
      code: ".a { max-width: var(--size-item-xlarge); }",
      description:
        "Using the xlarge item size token with the max-width property is valid.",
    },
    {
      code: ".a { min-width: var(--size-item-medium); }",
      description:
        "Using the medium item size token with the min-width property is valid.",
    },
    {
      code: ".a { min-width: var(--size-item-medium); }",
      description:
        "Using the medium item size token with the min-width property is valid.",
    },
    {
      code: ".a { inline-size: 50%; }",
      description:
        "Using a percentage value with the inline-size property is valid.",
    },
    {
      code: ".a { inline-size: var(--size-item-xlarge); }",
      description:
        "Using the xlarge item size token with the inline-size property is valid.",
    },
    {
      code: `
        @media (min-width: 768px) {
          a. { color: var(--text-color); }
        }
      `,
      description:
        "Using a pixel value with a size property within an atrule is valid.",
    },
    {
      code: ".a { width: calc(var(--size-item-small) * 2); }",
      description:
        "Using the small item size token in a `calc()` declaration with the width property is valid.",
    },
    {
      code: ".a { width: calc(2 * var(--size-item-small)); }",
      description:
        "Using the small item size token in a `calc()` declaration with the width property is valid.",
    },
    {
      code: ".a { width: calc(2 * var(--size-item-small, 14px)); }",
      description:
        "Using the small item size token with a fallback value in a `calc()` declaration with the width property is valid.",
    },
    {
      code: ".a { width: calc(var(--size-item-small, 14px) * 2); }",
      description:
        "Using the small item size token with a fallback value in a `calc()` declaration with the width property is valid.",
    },
    {
      code: ".a { height: 100vh; }",
      description:
        "Using a value using the `vh` unit in the height property is valid.",
    },
    {
      code: ".a { height: calc(100vh - 2em); }",
      description:
        "Using a value using the `vh` unit and a percentage value in a `calc()` function in the height property is valid.",
    },
    {
      code: ".a { height: calc(100% - 2em); }",
      description:
        "Using a percentage value and a value using the `em` unit in a `calc()` function in the height property is valid.",
    },
    {
      code: ".a { width: calc(100vw - 10%); }",
      description:
        "Using a percentage value and a value using the `em` unit in a `calc()` function in the height property is valid.",
    },
    {
      code: ".a { min-block-size: 8em; }",
      description:
        "Using a value using the `em` unit in the min-block-size property is valid.",
    },
    {
      code: ".a { max-block-size: 75%; }",
      description:
        "Using a percentage value in the min-block-size property is valid.",
    },
    {
      code: ".a { max-height: var(--size-item-medium, 50%); }",
      description:
        "Using a size design token with a fallback value in the max-height property is valid.",
    },
    {
      code: ".a { min-block-size: fit-content; }",
      description:
        "Using the fit-content value in the min-block-size property is valid.",
    },
    {
      code: ".a { background-size: var(--icon-size-medium) auto; }",
      description:
        "Using the medium icon size token and the auto value in the background-size property is valid.",
    },
    {
      code: ".a { background-size: calc(100vh * 0.8); }",
      description:
        "Using the medium icon size token and the auto value in the background-size property is valid.",
    },
  ],
  reject: [
    {
      code: ".a { max-height: 500px; }",
      unfixable: true,
      message: messages.rejected("500px"),
      description:
        "Consider using a size design token instead of using a pixel value. This may be fixable by running the same command again with --fix.",
    },
    {
      code: ".a { height: 0.75rem; }",
      fixed: ".a { height: var(--size-item-xsmall); }",
      message: messages.rejected("0.75rem"),
      description:
        "Consider using a size design token instead of using a rem value. This may be fixable by running the same command again with --fix.",
    },
    {
      code: `
        :root { --local-size: 24px; }
        .a { min-height: var(--local-size); }
      `,
      unfixable: true,
      message: messages.rejected("var(--local-size)"),
      description:
        "Consider using a size design token instead of using a pixel value. This may be fixable by running the same command again with --fix.",
    },
    {
      code: `.a { max-inline-size: calc(16px + 32px); }`,
      fixed: `.a { max-inline-size: calc(var(--size-item-small) + var(--size-item-large)); }`,
      message: messages.rejected("calc(16px + 32px)"),
      description:
        "Consider using a size design token instead of using a pixel value. This may be fixable by running the same command again with --fix.",
    },
    {
      code: `.a { max-inline-size: calc(16px + var(--size-item-xlarge)); }`,
      fixed: `.a { max-inline-size: calc(var(--size-item-small) + var(--size-item-xlarge)); }`,
      message: messages.rejected("calc(16px + var(--size-item-xlarge))"),
      description:
        "Consider using a size design token instead of using a pixel value. This may be fixable by running the same command again with --fix.",
    },
    {
      code: `.a { max-inline-size: calc(var(--size-item-small) + 32px); }`,
      fixed: `.a { max-inline-size: calc(var(--size-item-small) + var(--size-item-large)); }`,
      message: messages.rejected("calc(var(--size-item-small) + 32px)"),
      description:
        "Consider using a size design token instead of using a pixel value. This may be fixable by running the same command again with --fix.",
    },
    {
      code: `.a { max-block-size: calc(100vh + 32px); }`,
      fixed: `.a { max-block-size: calc(100vh + var(--size-item-large)); }`,
      message: messages.rejected("calc(100vh + 32px)"),
      description:
        "Consider using a size design token instead of using a pixel value. This may be fixable by running the same command again with --fix.",
    },
  ],
});
