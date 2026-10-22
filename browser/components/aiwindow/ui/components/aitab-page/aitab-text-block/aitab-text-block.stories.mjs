/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-text-block.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab Text Block",
  component: "aitab-text-block",
  // The type scale queries a container that aitab-page normally provides.
  // Without it the headings stay at their narrow sizes at every width.
  decorators: [
    story =>
      html`<div style="container: aitab-page / inline-size;">${story()}</div>`,
  ],
  argTypes: {
    heading: { control: { type: "text" } },
    paragraphs: { control: { type: "object" } },
    references: { control: { type: "object" } },
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

const Template = ({ heading, paragraphs, references }) => html`
  <aitab-text-block
    heading=${heading}
    .paragraphs=${paragraphs}
    .references=${references}
  ></aitab-text-block>
`;

export const Default = Template.bind({});
Default.args = {
  heading:
    "Three nights is enough for Kanazawa if you stay near Korinbo and treat the market as a morning stop, not a destination.",
  paragraphs: [
    "Everything you flagged sits inside a 25-minute walk of each other: Kenroku-en, the castle grounds, the Nagamachi samurai district and the 21st Century Museum. Hotels east of the river are cheaper but add a bus leg to every evening, and the last useful bus back is earlier than the guides suggest.",
    "The one real trade-off is the ryokan question. A traditional inn with a kaiseki dinner takes the whole evening and roughly doubles the nightly rate — worth one of the three nights, not all of them, which is how two of your open tabs recommend splitting it.",
  ],
  references: REFERENCES,
};

export const OneParagraph = Template.bind({});
OneParagraph.args = {
  heading:
    "Three nights is enough for Kanazawa if you stay near Korinbo and treat the market as a morning stop, not a destination.",
  paragraphs: [
    "Everything you flagged sits inside a 25-minute walk of each other: Kenroku-en, the castle grounds, the Nagamachi samurai district and the 21st Century Museum. Hotels east of the river are cheaper but add a bus leg to every evening, and the last useful bus back is earlier than the guides suggest.",
  ],
  references: REFERENCES,
};

export const NoReferences = Template.bind({});
NoReferences.args = {
  heading:
    "Three nights is enough for Kanazawa if you stay near Korinbo and treat the market as a morning stop, not a destination.",
  paragraphs: [
    "Everything you flagged sits inside a 25-minute walk of each other: Kenroku-en, the castle grounds, the Nagamachi samurai district and the 21st Century Museum. Hotels east of the river are cheaper but add a bus leg to every evening, and the last useful bus back is earlier than the guides suggest.",
    "The one real trade-off is the ryokan question. A traditional inn with a kaiseki dinner takes the whole evening and roughly doubles the nightly rate — worth one of the three nights, not all of them, which is how two of your open tabs recommend splitting it.",
  ],
  references: [],
};
