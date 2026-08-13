/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/ai-grouped-chip-container.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Grouped Chip Container",
  component: "ai-grouped-chip-container",
  parameters: {
    fluent: `smart-window-context-chips-tag-count = { $tags } Tags
    `,
  },
};

const chips = [
  {
    url: "https://example.com",
    label: "example.com",
    iconSrc: "chrome://branding/content/about-logo.svg",
  },
  {
    url: "https://firefox.com",
    label: "firefox.com",
    iconSrc: "chrome://branding/content/icon16.png",
  },
  {
    url: "https://example.com",
    label: "example.com",
    iconSrc: "chrome://branding/content/about-logo.svg",
  },
];

export const Default = () => html`
  <ai-grouped-chip-container .chips=${chips}></ai-grouped-chip-container>
`;
