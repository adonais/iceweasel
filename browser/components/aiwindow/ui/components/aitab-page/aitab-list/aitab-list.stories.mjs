/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-list.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab List",
  component: "aitab-list",
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
    layout: { control: { type: "select" }, options: ["column", "row"] },
  },
};

const KANAZAWA_GROUPS = [
  {
    heading: "Food",
    items: [
      { text: "Omicho market for lunch" },
      { text: "Kanazawa-style curry" },
      { text: "Kaiseki dinner, one night only" },
    ],
  },
  {
    heading: "Sights",
    items: [
      { text: "Kenroku-en at opening" },
      { text: "21st Century Museum" },
      { text: "Higashiyama teahouses" },
    ],
  },
  {
    heading: "Practical",
    items: [
      { text: "IC card for buses" },
      { text: "Cash for small shops" },
      { text: "Book the ryokan early" },
    ],
  },
];

const Template = ({ title, description, groups, layout }) => html`
  <aitab-list
    .title=${title}
    description=${description}
    .groups=${groups}
    layout=${layout}
  ></aitab-list>
`;

export const MultiColumn = Template.bind({});
MultiColumn.args = {
  title: "Multi-column",
  description: "Short hits pulled out of the longer guides in your tabs",
  groups: KANAZAWA_GROUPS,
  layout: "column",
};

// Groups with their headings left off, which needs no layout of its own.
export const NoDescriptors = Template.bind({});
NoDescriptors.args = {
  ...MultiColumn.args,
  title: "No descriptors",
  description: "",
  groups: KANAZAWA_GROUPS.slice(0, 2).map(({ items }) => ({ items })),
};

export const OneColumn = Template.bind({});
OneColumn.args = {
  title: "One column",
  description: "Short hits pulled out of the longer guides in your tabs",
  layout: "row",
  groups: [
    {
      heading: "Groceries",
      items: [
        { text: "Chicken breast" },
        { text: "Shishito peppers" },
        { text: "Soy sauce" },
        { text: "Cilantro" },
        { text: "Ginger" },
      ],
    },
  ],
};

// Same layout as OneColumn, with several groups of longer items.
export const Instructions = Template.bind({});
Instructions.args = {
  title: "Instructions",
  description: "The merged method, taking the best step from each source.",
  layout: "row",
  groups: [
    {
      heading: "Sear",
      items: [
        {
          text: "Pat the thighs dry and season both sides. Lay skin-side down in a cold, dry pan and bring up to medium heat together - this renders the fat instead of seizing the skin.",
        },
        {
          text: "Sear 8-10 minutes undisturbed until deep golden, flip for 2 minutes, then set the thighs aside on a plate.",
        },
      ],
    },
    {
      heading: "Braise",
      items: [
        {
          text: "Pour off all but a tablespoon of fat, soften the aromatics, then deglaze with wine or stock, scraping up the browned bits for the sauce.",
        },
        {
          text: "Return the thighs skin-up, cover, and simmer on low 35-40 minutes until the thickest one reads 165F.",
        },
      ],
    },
    {
      heading: "Finish",
      items: [
        {
          text: "Uncover and reduce the sauce 5 minutes if it's thin, then rest the chicken 5 minutes off heat before serving over the sauce.",
        },
      ],
    },
  ],
};

export const NoTitleNoDesc = Template.bind({});
NoTitleNoDesc.args = {
  title: "",
  description: "",
  groups: [KANAZAWA_GROUPS[0]],
  layout: "row",
};
