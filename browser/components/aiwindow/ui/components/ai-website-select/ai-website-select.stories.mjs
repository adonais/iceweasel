/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/ai-website-select.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Website select",
  component: "ai-website-select",
  argTypes: {
    tabId: {
      control: "text",
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
    checked: {
      control: "boolean",
    },
  },
  parameters: {
    fluent: `
aiwindow-website-select-placeholder = site name
    `,
  },
};

const Template = ({ tabId, label, iconSrc, href, checked }) => html`
  <ai-website-select
    .tabId=${tabId}
    .label=${label}
    .iconSrc=${iconSrc}
    .href=${href || ""}
    .checked=${checked ?? false}
  ></ai-website-select>
`;

export const Default = Template.bind({});
Default.args = {
  tabId: "tab-1",
  label: "Mozilla Developer Network - Web Docs",
  iconSrc: "chrome://branding/content/about-logo.svg",
  href: "https://developer.mozilla.org",
  checked: false,
};
