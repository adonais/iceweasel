/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/smartwindow-chip.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Smart Window Chip",
  component: "smartwindow-chip",
  argTypes: {
    type: {
      control: "select",
      options: ["in-line", "context", "source"],
    },
    label: {
      control: "text",
    },
    iconSrc: {
      control: "text",
    },
    href: {
      control: "text",
    },
    isTabGroup: {
      control: "boolean",
    },
    tabGroupColor: {
      control: "select",
      options: [
        "",
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
    removable: {
      control: "boolean",
    },
  },
  parameters: {
    fluent: `
aiwindow-website-chip-placeholder = Tag a tab or site
aiwindow-website-chip-remove-button =
  .aria-label = Remove
    `,
  },
};

// A tab group chip is tinted with the --tab-group-* tokens.
const tabGroupTokens = html`<link
  rel="stylesheet"
  href="chrome://browser/skin/tabbrowser/tab.tokens.css"
/>`;

const Template = ({
  type,
  label,
  iconSrc,
  href,
  isTabGroup,
  tabGroupColor,
  removable,
}) => html`
  ${isTabGroup ? tabGroupTokens : ""}
  <smartwindow-chip
    .type=${type}
    .label=${label}
    .iconSrc=${iconSrc}
    .href=${href || ""}
    .isTabGroup=${isTabGroup ?? false}
    .tabGroupColor=${tabGroupColor || ""}
    .removable=${removable ?? false}
  ></smartwindow-chip>
`;

export const InLineDefault = Template.bind({});
InLineDefault.args = {
  type: "in-line",
  label: "mozilla.org",
  iconSrc: "chrome://branding/content/about-logo.svg",
};

export const InLineEmpty = Template.bind({});
InLineEmpty.args = {
  type: "in-line",
  label: "",
  iconSrc: "",
};

export const InLineCollection = () => html`
  <div style="display: flex; flex-wrap: wrap; gap: 8px;">
    <smartwindow-chip
      type="in-line"
      label="mozilla.org"
      iconSrc="chrome://branding/content/icon16.png"
    ></smartwindow-chip>
    <smartwindow-chip type="in-line" label=""></smartwindow-chip>
  </div>
`;

export const ContextRemovable = Template.bind({});
ContextRemovable.args = {
  type: "context",
  label: "example.com",
  iconSrc: "chrome://branding/content/icon16.png",
  removable: true,
};

export const ContextNonRemovable = Template.bind({});
ContextNonRemovable.args = {
  type: "context",
  label: "example.com",
  iconSrc: "chrome://branding/content/icon16.png",
  removable: false,
};

export const SourceChip = Template.bind({});
SourceChip.args = {
  type: "source",
  label: "example.com",
  iconSrc: "chrome://branding/content/icon16.png",
  href: "https://example.com",
};

export const MixedCollection = () => html`
  <div style="display: flex; flex-wrap: wrap; gap: 8px;">
    <smartwindow-chip
      type="in-line"
      label="mozilla.org"
      iconSrc="chrome://branding/content/icon16.png"
    ></smartwindow-chip>
    <smartwindow-chip type="in-line" label=""></smartwindow-chip>
    <smartwindow-chip
      type="context"
      label="example.com"
      iconSrc="chrome://branding/content/about-logo.svg"
      href="https://example.com"
      .removable=${true}
    ></smartwindow-chip>
    <smartwindow-chip
      type="source"
      label="example.com"
      iconSrc="chrome://branding/content/icon16.png"
      href="https://example.com"
    ></smartwindow-chip>
  </div>
`;

export const TabGroupContextChip = Template.bind({});
TabGroupContextChip.args = {
  type: "context",
  label: "Trip planning",
  isTabGroup: true,
  tabGroupColor: "purple",
  removable: true,
};

export const TabGroupInLine = Template.bind({});
TabGroupInLine.args = {
  type: "in-line",
  label: "Trip planning",
  isTabGroup: true,
  tabGroupColor: "blue",
};

export const TabGroupColors = () => html`
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
        html`<smartwindow-chip
          type="context"
          .label=${color}
          .isTabGroup=${true}
          .tabGroupColor=${color}
          .removable=${true}
        ></smartwindow-chip>`
    )}
  </div>
`;
