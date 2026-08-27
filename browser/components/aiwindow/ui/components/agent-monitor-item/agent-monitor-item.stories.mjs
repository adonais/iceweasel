/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/agent-monitor-item.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Agent Monitor Item",
  component: "agent-monitor-item",
  argTypes: {
    agent: { control: "object" },
    mode: { control: "select", options: ["display", "create"] },
    expanded: { control: "boolean" },
    editing: { control: "boolean" },
  },
};

const AGENT = {
  id: "agent-sony",
  monitorName: "Nike Men's Vomero Plus Running Shoes",
  url: "soundnest.com/audio/sony-wh-1000xm5",
  faviconText: "S",
  faviconColor: "#e8663a",
  value: "$299",
  valueMeta: "checked 2:14 PM / was $299",
  condition: "",
  conditionPresets: [],
  status: { label: "$278 ▼ −7%", kind: "triggered" },
  cadence: "Auto / on-device",
  history: [
    {
      when: "Today 2:14 PM",
      oldValue: "$299",
      newValue: "$278",
      note: "−7%",
    },
    {
      when: "Jun 24",
      flag: "possible change",
      note: "no notification",
      low: true,
    },
    {
      when: "Jun 17",
      oldValue: "$319",
      newValue: "$299",
      note: "first checked",
    },
  ],
};

const Template = ({ agent, mode, expanded, editing }) => html`
  <div style="max-width: 416px;">
    <agent-monitor-item
      .agent=${agent}
      mode=${mode}
      ?expanded=${expanded}
      ?editing=${editing}
    ></agent-monitor-item>
  </div>
`;

export const DisplayCollapsed = Template.bind({});
DisplayCollapsed.args = {
  agent: { ...AGENT, status: { label: "Watching", kind: "watching" } },
  mode: "display",
  expanded: false,
  editing: false,
};

export const DisplayExpanded = Template.bind({});
DisplayExpanded.args = {
  agent: AGENT,
  mode: "display",
  expanded: true,
  editing: false,
};

export const Editing = Template.bind({});
Editing.args = {
  agent: AGENT,
  mode: "display",
  expanded: true,
  editing: true,
};

export const Create = Template.bind({});
Create.args = {
  agent: {
    ...AGENT,
    monitorName: "",
    value: "",
    valueMeta: "found on this page just now",
    status: null,
    history: [],
  },
  mode: "create",
  expanded: false,
  editing: false,
};
