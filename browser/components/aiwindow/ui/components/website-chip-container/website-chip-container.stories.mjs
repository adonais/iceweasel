/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/website-chip-container.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Website Chip Container",
  component: "website-chip-container",
  parameters: {
    fluent: `
smartwindow-assistant-citations-more-label = +{ $count } more
    `,
  },
  // Constrained container to simulate a chat bubble.
  decorators: [
    (story, context) =>
      context.parameters.frame === false
        ? story()
        : html`
            <div
              style="
                display: inline-block;
                ${context.parameters.frameWidth
                ? `width: ${context.parameters.frameWidth};`
                : ""}
                padding: 16px;
                box-sizing: border-box;
                border: 1px dashed #ccc;
              "
            >
              ${story()}
            </div>
          `,
  ],
};

const makeWebsites = count =>
  Array.from({ length: count }, (_, index) => ({
    url: `https://example.com/${index + 1}`,
    label: `Example Site ${index + 1}`,
    iconSrc: "chrome://branding/content/icon16.png",
  }));

export const Default = () => html`
  <website-chip-container
    .chipType=${"context-chip"}
    .websites=${makeWebsites(3)}
    .removable=${true}
  ></website-chip-container>
`;

export const AutoWidthOverflow = () => html`
  <div
    style="
      resize: horizontal;
      overflow: auto;
      inline-size: 500px;
      min-inline-size: 160px;
      max-inline-size: 100%;
      padding: 16px;
      box-sizing: border-box;
      border: 1px dashed #ccc;
    "
  >
    <website-chip-container
      .websites=${makeWebsites(6)}
      .autoOverflow=${true}
    ></website-chip-container>
  </div>
`;
// This story has its own decorator frame
AutoWidthOverflow.parameters = { frame: false };

export const NoOverflow = () => html`
  <website-chip-container
    .websites=${makeWebsites(2)}
    .autoOverflow=${true}
  ></website-chip-container>
`;

export const CountBasedGrouping = () => html`
  <website-chip-container
    .websites=${makeWebsites(6)}
    .shouldGroupChips=${true}
  ></website-chip-container>
`;
