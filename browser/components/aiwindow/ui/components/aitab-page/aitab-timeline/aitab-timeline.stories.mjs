/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-timeline.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab Timeline",
  component: "aitab-timeline",
  // The type scale and the narrow layout both query a container that
  // aitab-page normally provides. Without it the headings stay at their
  // narrow sizes and the gutter never collapses.
  decorators: [
    story =>
      html`<div style="container: aitab-page / inline-size;">${story()}</div>`,
  ],
  argTypes: {
    title: { control: { type: "text" } },
    description: { control: { type: "text" } },
  },
};

const KANAZAWA_ITEMS = [
  {
    date_label: "Thu, Oct 9",
    date_eyebrow: "Arrival",
    title: "Korinbo & the 21st Century Museum",
    description:
      "Train in at 2pm, drop bags, museum until closing, dinner in the covered arcade five minutes from the hotel.",
  },
  {
    date_label: "Fri, Oct 10",
    date_eyebrow: "Full day",
    title: "Kenroku-en, castle, Nagamachi",
    description:
      "Garden at opening before the tour buses, castle grounds after, samurai district in the afternoon heat.",
  },
  {
    date_label: "Sat, Oct 11",
    date_eyebrow: "Ryokan night",
    title: "Higashiyama, then kaiseki",
    description:
      "Teahouse district in the morning, Omicho for lunch, check into the ryokan by 4pm — dinner is the evening.",
  },
  {
    date_label: "Sun, Oct 12",
    date_eyebrow: "Depart",
    title: "Train back at noon",
    description:
      "Breakfast at the inn, one last walk along the canal, Thunderbird to Kyoto.",
  },
];

const Template = ({ title, description, items }) => html`
  <aitab-timeline
    .title=${title}
    description=${description}
    .items=${items}
  ></aitab-timeline>
`;

export const Default = Template.bind({});
Default.args = {
  title: "Three days",
  description: "Walking order for the sights you saved, arrival day first.",
  items: KANAZAWA_ITEMS,
};

// Times rather than dates, and no eyebrows to put under them.
export const TimesOnly = Template.bind({});
TimesOnly.args = {
  title: "Release day",
  description: "Everything that has to happen before the tree reopens.",
  items: [
    {
      date_label: "09:00",
      title: "Soft freeze",
      description: "Only approved uplifts land after this point.",
    },
    {
      date_label: "11:30",
      title: "Release candidate build",
      description: "Automation kicks off; expect results inside two hours.",
    },
    { date_label: "16:00", title: "Go / no-go" },
    { date_label: "18:00", title: "Push to the CDN" },
  ],
};

// A timeline that has to stand on its own, with no intro beside it.
export const NoIntro = Template.bind({});
NoIntro.args = {
  title: "",
  description: "",
  items: KANAZAWA_ITEMS.slice(0, 2),
};
