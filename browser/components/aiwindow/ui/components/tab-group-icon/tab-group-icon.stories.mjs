/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/tab-group-icon.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Tab Group Icon",
  component: "tab-group-icon",
  argTypes: {
    label: {
      control: "text",
    },
    color: {
      control: "select",
      options: [
        "blue",
        "cyan",
        "gray",
        "green",
        "orange",
        "pink",
        "purple",
        "red",
        "yellow",
      ],
    },
  },
};

// The colors come from the --tab-group-* tokens, which the AI Window documents
// pull in through ai-window-shared.css.
const tabGroupTokens = html`<link
  rel="stylesheet"
  href="chrome://browser/skin/tabbrowser/tab.tokens.css"
/>`;

const Template = ({ label, color }) => html`
  ${tabGroupTokens}
  <tab-group-icon .label=${label} .color=${color}></tab-group-icon>
`;

export const Default = Template.bind({});
Default.args = {
  label: "Trip planning",
  color: "blue",
};

export const AllColors = () => html`
  ${tabGroupTokens}
  <div style="display: flex; flex-wrap: wrap; gap: 8px;">
    ${[
      "blue",
      "cyan",
      "gray",
      "green",
      "orange",
      "pink",
      "purple",
      "red",
      "yellow",
    ].map(
      color =>
        html`<tab-group-icon .label=${color} .color=${color}></tab-group-icon>`
    )}
  </div>
`;

// The icon draws its label at --font-size-small; a consumer that wants a bigger
// icon overrides the size, and the font size with it.
export const Sized = () => html`
  ${tabGroupTokens}
  <tab-group-icon
    style="--tab-group-icon-size: 32px; --tab-group-icon-font-size: 20px;"
    label="Trip planning"
    color="purple"
  ></tab-group-icon>
`;
