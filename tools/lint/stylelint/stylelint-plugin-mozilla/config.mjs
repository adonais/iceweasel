/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createRawValuesObject } from "./helpers.mjs";

/**
 * @typedef {object} PropertyTypeConfig
 * @property {string[]} allow Allowed keyword values (e.g., "auto", "none", "transparent")
 * @property {string[]} [tokenTypes] Token categories from tokens-table.mjs whose tokens are valid
 * @property {string[]} [allowFunctions] Allowed CSS function names (e.g., "url", "linear-gradient")
 * @property {boolean} [allowUnits] Whether values with CSS units (e.g., "10px", "50%") are allowed
 * @property {Record<string, string>} [customFixes] Map of raw values to their token replacements for autofix
 */

const customColorFixes = {
  "#000": "black",
  "#000000": "black",
  "#fff": "white",
  "#ffffff": "white",
};

/** @type {PropertyTypeConfig} */
const BackgroundColor = {
  allow: [
    "transparent",
    "currentColor",
    "auto",
    "normal",
    "none",
    "white",
    "black",
  ],
  tokenTypes: ["background-color"],
  customFixes: customColorFixes,
};

/** @type {PropertyTypeConfig} */
const BackgroundAttachment = {
  allow: ["scroll", "fixed", "local"],
};

/** @type {PropertyTypeConfig} */
const BackgroundImage = {
  allow: ["none"],
  allowFunctions: [
    "url",
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "repeating-linear-gradient",
    "repeating-radial-gradient",
    "repeating-conic-gradient",
    "image-set",
  ],
};

/** @type {PropertyTypeConfig} */
const BackgroundPosition = {
  allow: ["top", "bottom", "left", "right", "center"],
  tokenTypes: ["size", "space"],
  allowUnits: true,
};

/** @type {PropertyTypeConfig} */
const BackgroundSize = {
  allow: ["auto", "cover", "contain"],
  tokenTypes: ["size", "space", "icon-size"],
  allowUnits: true,
};

/** @type {PropertyTypeConfig} */
const BackgroundRepeat = {
  allow: ["repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"],
};

/** @type {PropertyTypeConfig} */
const BackgroundClip = {
  allow: ["border-box", "padding-box", "content-box"],
};

/** @type {PropertyTypeConfig} */
const BoxShadow = {
  allow: ["none"],
  tokenTypes: ["box-shadow"],
};

/** @type {PropertyTypeConfig} */
const FontSize = {
  allow: [
    "xx-small",
    "x-small",
    "small",
    "medium",
    "large",
    "x-large",
    "xx-large",
    "xxx-large",
    "smaller",
    "larger",
  ],
  tokenTypes: ["font-size"],
};

/** @type {PropertyTypeConfig} */
const FontWeight = {
  allow: ["normal"],
  tokenTypes: ["font-weight"],
  customFixes: {
    ...createRawValuesObject(["font-weight"]),
    200: "normal",
    300: "normal",
    400: "normal",
    lighter: "normal",
    500: "var(--font-weight-semibold)",
    510: "var(--font-weight-semibold)",
    800: "var(--font-weight-bold)",
    bold: "var(--font-weight-bold)",
    bolder: "var(--font-weight-bold)",
  },
};

/** @type {PropertyTypeConfig} */
const BorderColor = {
  allow: [
    "transparent",
    "currentColor",
    "white",
    "black",
    "auto",
    "normal",
    "none",
    "0",
  ],
  tokenTypes: ["border-color", "border", "outline"],
  customFixes: customColorFixes,
};

/** @type {PropertyTypeConfig} */
const BorderWidth = {
  allow: [
    "solid",
    "dashed",
    "dotted",
    "double",
    "groove",
    "ridge",
    "inset",
    "outset",
    "none",
    "hidden",
  ],
  tokenTypes: ["border-width"],
  allowUnits: true,
};

/** @type {PropertyTypeConfig} */
const BorderRadius = {
  allow: ["0"],
  tokenTypes: ["border-radius"],
  customFixes: {
    ...createRawValuesObject(["border-radius"]),
    "50%": "var(--border-radius-circle)",
    "100%": "var(--border-radius-circle)",
    "1000px": "var(--border-radius-circle)",
  },
};

/** @type {PropertyTypeConfig} */
const TextColor = {
  allow: ["currentColor", "white", "black"],
  tokenTypes: ["text-color"],
  customFixes: customColorFixes,
};

/** @type {PropertyTypeConfig} */
const Space = {
  allow: ["0", "auto"],
  tokenTypes: ["space"],
  customFixes: {
    "2px": "var(--space-xxsmall)",
    "4px": "var(--space-xsmall)",
    "8px": "var(--space-small)",
    "12px": "var(--space-medium)",
    "16px": "var(--space-large)",
    "24px": "var(--space-xlarge)",
    "32px": "var(--space-xxlarge)",
  },
};

/**
 * @typedef {object} PropertyConfig
 * @property {PropertyTypeConfig[]} validTypes Valid type configurations for this property
 * @property {boolean} [shorthand] Whether this property accepts multiple space-separated values
 * @property {boolean} [multiple] Whether this property accepts comma-separated value groups
 * @property {boolean} [slash] Whether this property accepts slash-separated values (e.g., position/size)
 */

/** @type {Record<string, PropertyConfig>} */
export const propertyConfig = {
  "background-color": {
    validTypes: [BackgroundColor],
  },
  background: {
    validTypes: [
      BackgroundColor,
      BackgroundImage,
      BackgroundPosition,
      BackgroundSize,
      BackgroundRepeat,
      BackgroundAttachment,
      BackgroundClip,
    ],
    shorthand: true,
    multiple: true,
    slash: true,
  },
  "box-shadow": {
    validTypes: [BoxShadow],
    multiple: true,
  },
  border: {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-block": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-block-color": {
    validTypes: [BorderColor],
  },
  "border-block-end": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-block-end-color": {
    validTypes: [BorderColor],
  },
  "border-block-start": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-block-start-color": {
    validTypes: [BorderColor],
  },
  "border-color": {
    validTypes: [BorderColor],
  },
  "border-inline": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-inline-color": {
    validTypes: [BorderColor],
  },
  "border-inline-end": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-inline-end-color": {
    validTypes: [BorderColor],
  },
  "border-inline-start": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-inline-start-color": {
    validTypes: [BorderColor],
  },
  "border-bottom": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-bottom-color": {
    validTypes: [BorderColor],
  },
  "border-left": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-left-color": {
    validTypes: [BorderColor],
  },
  "border-right": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-right-color": {
    validTypes: [BorderColor],
  },
  "border-top": {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "border-top-color": {
    validTypes: [BorderColor],
  },
  outline: {
    validTypes: [BorderColor, BorderWidth],
    shorthand: true,
  },
  "outline-color": {
    validTypes: [BorderColor],
  },
  "border-radius": {
    validTypes: [BorderRadius],
    shorthand: true,
  },
  "border-top-left-radius": {
    validTypes: [BorderRadius],
  },
  "border-top-right-radius": {
    validTypes: [BorderRadius],
  },
  "border-bottom-right-radius": {
    validTypes: [BorderRadius],
  },
  "border-bottom-left-radius": {
    validTypes: [BorderRadius],
  },
  "border-start-start-radius": {
    validTypes: [BorderRadius],
  },
  "border-start-end-radius": {
    validTypes: [BorderRadius],
  },
  "border-end-start-radius": {
    validTypes: [BorderRadius],
  },
  "border-end-end-radius": {
    validTypes: [BorderRadius],
  },
  color: {
    validTypes: [TextColor],
  },
  "font-size": {
    validTypes: [FontSize],
  },
  "font-weight": {
    validTypes: [FontWeight],
  },
  margin: {
    validTypes: [Space],
    shorthand: true,
  },
  "margin-block": {
    validTypes: [Space],
    shorthand: true,
  },
  "margin-block-end": {
    validTypes: [Space],
  },
  "margin-block-start": {
    validTypes: [Space],
  },
  "margin-inline": {
    validTypes: [Space],
    shorthand: true,
  },
  "margin-inline-end": {
    validTypes: [Space],
  },
  "margin-inline-start": {
    validTypes: [Space],
  },
  "margin-top": {
    validTypes: [Space],
  },
  "margin-right": {
    validTypes: [Space],
  },
  "margin-bottom": {
    validTypes: [Space],
  },
  "margin-left": {
    validTypes: [Space],
  },
  padding: {
    validTypes: [Space],
    shorthand: true,
  },
  "padding-block": {
    validTypes: [Space],
    shorthand: true,
  },
  "padding-block-end": {
    validTypes: [Space],
  },
  "padding-block-start": {
    validTypes: [Space],
  },
  "padding-inline": {
    validTypes: [Space],
    shorthand: true,
  },
  "padding-inline-end": {
    validTypes: [Space],
  },
  "padding-inline-start": {
    validTypes: [Space],
  },
  "padding-top": {
    validTypes: [Space],
  },
  "padding-right": {
    validTypes: [Space],
  },
  "padding-bottom": {
    validTypes: [Space],
  },
  "padding-left": {
    validTypes: [Space],
  },
  gap: {
    validTypes: [Space],
    shorthand: true,
  },
  "column-gap": {
    validTypes: [Space],
  },
  "row-gap": {
    validTypes: [Space],
  },
  inset: {
    validTypes: [Space],
    shorthand: true,
  },
  "inset-block": {
    validTypes: [Space],
    shorthand: true,
  },
  "inset-block-end": {
    validTypes: [Space],
  },
  "inset-block-start": {
    validTypes: [Space],
  },
  "inset-inline": {
    validTypes: [Space],
    shorthand: true,
  },
  "inset-inline-end": {
    validTypes: [Space],
  },
  "inset-inline-start": {
    validTypes: [Space],
  },
  top: {
    validTypes: [Space],
  },
  right: {
    validTypes: [Space],
  },
  bottom: {
    validTypes: [Space],
  },
  left: {
    validTypes: [Space],
  },
};
