/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/ai-website-confirmation.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Website confirmation",
  component: "ai-website-confirmation",
  argTypes: {
    tabs: {
      control: "object",
    },
  },
  parameters: {
    fluent: `
smart-window-confirm-select-all =
    .tooltiptext = Select all
    .aria-label = Select all
    .label = Select all
smart-window-confirm-deselect-all =
    .tooltiptext = Deselect all
    .aria-label = Deselect all
    .label = Deselect all
smart-window-close-confirm =
    .tooltiptext = Close confirm
    .aria-label = Close confirm
smart-window-confirm-close-tab = Close
smart-window-confirm-close-tabs =
    { $count ->
        [one] Close { $count } tab
       *[other] Close { $count } tabs
    }
    `,
  },
};

const Template = ({ tabs }) => html`
  <ai-website-confirmation .tabs=${tabs}></ai-website-confirmation>
`;

export const Default = Template.bind({});
Default.args = {
  tabs: [
    {
      tabId: "tab-1",
      label: "Mozilla Developer Network - Web Docs",
      iconSrc: "chrome://branding/content/about-logo.svg",
      href: "https://developer.mozilla.org",
      checked: true,
    },
    {
      tabId: "tab-2",
      label: "Stack Overflow - Where Developers Learn",
      iconSrc: "chrome://global/skin/icons/defaultFavicon.svg",
      href: "https://stackoverflow.com",
      checked: false,
    },
    {
      tabId: "tab-3",
      label: "GitHub - Build and ship software",
      iconSrc: "chrome://global/skin/icons/defaultFavicon.svg",
      href: "https://github.com",
      checked: true,
    },
    {
      tabId: "tab-4",
      label: "MDN Web Docs - Resources for developers",
      iconSrc: "chrome://branding/content/about-logo.svg",
      href: "https://developer.mozilla.org/en-US/",
      checked: false,
    },
    {
      tabId: "tab-5",
      label: "W3Schools - Learn to Code",
      iconSrc: "chrome://global/skin/icons/defaultFavicon.svg",
      href: "https://www.w3schools.com",
      checked: true,
    },
    {
      tabId: "tab-6",
      label: "CSS-Tricks - Tips, Tricks, and Techniques",
      iconSrc: "chrome://global/skin/icons/defaultFavicon.svg",
      href: "https://css-tricks.com",
      checked: false,
    },
    {
      tabId: "tab-7",
      label: "JavaScript.info - The Modern JavaScript Tutorial",
      iconSrc: "chrome://global/skin/icons/defaultFavicon.svg",
      href: "https://javascript.info",
      checked: true,
    },
    {
      tabId: "tab-8",
      label: "React - A JavaScript library for building user interfaces",
      iconSrc: "chrome://global/skin/icons/defaultFavicon.svg",
      href: "https://reactjs.org",
      checked: false,
    },
  ],
};
