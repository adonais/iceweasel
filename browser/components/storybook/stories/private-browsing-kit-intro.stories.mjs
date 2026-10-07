/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit.all.mjs";
// Imported for side-effects: defines <private-browsing-mask-intro>.
import "../../privatebrowsing/content/private-browsing-mask-intro.mjs";

export default {
  title:
    "Domain-specific UI Widgets/Private Browsing Window/Kit Intro Animation",
  component: "private-browsing-mask-intro",
  parameters: {
    docs: {
      description: {
        component: `The one-time "kit" intro on the private-browsing mask. With \`play\`, the kit
bounces inside the circular window then drops out as the mask fades in; without it,
only the mask shows. In the product it is gated behind \`browser.privateWindowRedesign.enabled\`
and shown once per profile; Storybook always renders it. Toggle **play** to replay.`,
      },
    },
  },
  argTypes: {
    play: {
      control: "boolean",
      description: "Play the intro (vs. render the final resting state).",
    },
  },
  args: {
    play: true,
  },
};

const Template = ({ play }) => html`
  <div style="padding: 24px;">
    <private-browsing-mask-intro .play=${play}></private-browsing-mask-intro>
  </div>
`;

export const KitIntro = Template.bind({});
KitIntro.args = {
  play: true,
};
