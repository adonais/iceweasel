/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "./aitab-tool-ui.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab Tool UI",
  component: "aitab-tool-ui",
  argTypes: {
    state: {
      control: "select",
      options: ["creating", "choose", "complete"],
    },
    title: { control: "text" },
    viewerURL: { control: "text" },
    completeStateOpen: { control: "boolean" },
  },
  parameters: {
    actions: {
      handles: ["aitab-open-request"],
    },
    fluent: `
smartwindow-aitab-creating = Creating a page…
smartwindow-aitab-open-current =
    .label = Open here
smartwindow-aitab-open-new =
    .label = Open in new tab
smartwindow-aitab-created-an-aitab = Created a Smart Page
    `,
  },
};

const Template = ({ state, title, viewerURL, completeStateOpen }) => html`
  <div style="max-width: 360px;">
    <aitab-tool-ui
      .state=${state}
      .title=${title}
      .viewerURL=${viewerURL}
      .completeStateOpen=${completeStateOpen}
    ></aitab-tool-ui>
  </div>
`;

export const Creating = Template.bind({});
Creating.args = {
  state: "creating",
  title: "",
  viewerURL: "",
  completeStateOpen: true,
};

export const Choose = Template.bind({});
Choose.args = {
  state: "choose",
  title: "Weekend trip to Portland",
  viewerURL: "about:smartpage",
  completeStateOpen: true,
};

export const CompleteExpanded = Template.bind({});
CompleteExpanded.args = {
  ...Choose.args,
  state: "complete",
};

export const CompleteCollapsed = Template.bind({});
CompleteCollapsed.args = {
  ...CompleteExpanded.args,
  completeStateOpen: false,
};
