/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-header.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab Header",
  component: "aitab-header",
  // The type scale queries a container that aitab-page normally provides.
  // Without it the headings stay at their narrow sizes at every width.
  decorators: [
    story =>
      html`<div style="container: aitab-page / inline-size;">${story()}</div>`,
  ],
  argTypes: {
    createdAt: { control: { type: "text" } },
    title: { control: { type: "text" } },
    subhead: { control: { type: "text" } },
    refreshing: { control: { type: "boolean" } },
  },
  parameters: {
    fluent: `
smart-window-context-chips-tag-count = { $tags ->
    [one] { $tags } Tag
   *[other] { $tags } Tags
}
aitab-page-refresh-sources =
    .label = Refresh sources
aitab-page-refreshing-sources =
    .label = Refreshing sources
aitab-page-delete =
    .aria-label = Delete page
    .title = Delete page
aitab-page-delete-dialog-title = Delete this [AI Tab]?
aitab-page-delete-dialog-message = This generated page will be removed. The sources it was built from aren't affected.
aitab-page-delete-dialog-cancel =
    .label = Cancel
aitab-page-delete-dialog-confirm =
    .label = Delete
    `,
  },
};

const REFERENCES = [
  {
    title: "energy.gov",
    href: "https://energy.gov",
    favicon: "chrome://branding/content/about-logo.svg",
  },
  {
    title: "NEEP",
    href: "https://neep.org",
    favicon: "chrome://branding/content/icon16.png",
  },
  {
    title: "r/heatpumps",
    href: "https://reddit.com/r/heatpumps",
    favicon: "chrome://global/skin/icons/defaultFavicon.svg",
  },
  {
    title: "Yelp",
    href: "https://yelp.com",
    favicon: "chrome://branding/content/about-logo.svg",
  },
];

const Template = ({
  createdAt,
  title,
  subhead,
  references,
  refreshing,
}) => html`
  <aitab-header
    .createdAt=${createdAt}
    .title=${title}
    subhead=${subhead}
    .references=${references}
    ?refreshing=${refreshing}
  ></aitab-header>
`;

export const Default = Template.bind({});
Default.args = {
  createdAt: "Created today",
  title: "Three days in Kanazawa",
  subhead:
    "Travel research: short names, tidy numbers, real photography. The comfortable case for all six blocks.",
  references: REFERENCES,
  refreshing: false,
};

export const Refreshing = Template.bind({});
Refreshing.args = { ...Default.args, refreshing: true };

export const CreatedEarlier = Template.bind({});
CreatedEarlier.args = { ...Default.args, createdAt: "Created Jul 31" };

export const NoReferences = Template.bind({});
NoReferences.args = {
  createdAt: "Created today",
  title: "Heat Pump for a 1940s House",
  subhead: "What nine sources agree on — and where they don't",
  references: [],
  refreshing: false,
};

export const HeadingOnly = Template.bind({});
HeadingOnly.args = {
  createdAt: "",
  title: "Places to Stay on Niijima",
  subhead: "",
  references: [],
  refreshing: false,
};
