/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/smartwindow-history-menu.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Smartwindow History Menu",
  component: "smartwindow-history-menu",
  argTypes: {
    mode: {
      options: ["sidebar", "fullpage"],
      control: { type: "radio" },
    },
    recentChats: { control: "object" },
  },
  parameters: {
    status: "in-development",
    fluent: `
aiwindow-history-menu =
    .tooltiptext = More options
    .aria-label = More options
aiwindow-history-menu-chat-history = Chat history
aiwindow-history-menu-back =
    .tooltiptext = Back
    .aria-label = Back
aiwindow-history-menu-view-all-chats = View all chats
aiwindow-history-menu-settings = Smart Window settings
aiwindow-fullpage-new-chat =
    .label = New chat
aiwindow-fullpage-chat-history =
    .label = Chat history
aiwindow-fullpage-more =
    .label = More
    .title = More
    `,
  },
};

const Template = ({ mode, recentChats }) => html`
  <div style="padding: 40px; position: relative;">
    <smartwindow-history-menu
      mode=${mode}
      .recentChats=${recentChats}
    ></smartwindow-history-menu>
  </div>
`;

const SAMPLE_CHATS = [
  {
    id: "1",
    title: "Eggplant Adobo shopping list",
    pageUrl: "https://example.com/",
  },
  { id: "2", title: "Figma tutorials", pageUrl: "https://figma.com/" },
  { id: "3", title: "Trip planning", pageUrl: null },
];

export const Sidebar = Template.bind({});
Sidebar.args = { mode: "sidebar", recentChats: SAMPLE_CHATS };

export const Fullpage = Template.bind({});
Fullpage.args = { mode: "fullpage", recentChats: SAMPLE_CHATS };
