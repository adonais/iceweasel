/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const PURPOSE = {
  SEMANTIC: "semantic",
  STORYBOOK: "storybook",
};

export const TOKEN_CATEGORIES = [
  {
    categoryName: "table-background",
    purposes: [PURPOSE.STORYBOOK],
  },
  {
    categoryName: "table-border",
    purposes: [PURPOSE.STORYBOOK],
  },
  {
    categoryName: "table-header",
    purposes: [PURPOSE.STORYBOOK],
  },
  {
    categoryName: "background-color",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "text-color",
    alternateNames: ["link-color"],
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "border-color",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "border-radius",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "border-width",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "border",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "outline-color",
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    categoryName: "outline-width",
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    categoryName: "outline-offset",
    alternateNames: ["outline-inset"],
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    categoryName: "outline",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "focus-outline",
    purposes: [PURPOSE.SEMANTIC],
  },
  {
    categoryName: "space",
    alternateNames: ["padding", "margin", "inset", "gap"],
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "box-shadow",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "font-size",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "font-weight",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "icon-size",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "icon-color",
    alternateNames: ["fill", "stroke"],
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "size",
    alternateNames: ["height", "width", "transform"],
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "opacity",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
  {
    categoryName: "color",
    purposes: [PURPOSE.SEMANTIC, PURPOSE.STORYBOOK],
  },
];
