/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/preferences/widgets/setting-group.mjs";

export default {
  title: "Domain-specific UI Widgets/Settings/Setting Group",
  component: "setting-group",
  parameters: {
    status: "in-development",
    handles: ["click", "input", "change"],
    fluent: `
group-example-label =
  .label = Group Label
  .description = Could have a description as well.
checkbox-example-input =
  .label = Checkbox example of setting-control
  .description = Could have a description like moz-checkbox.
checkbox-example-input2 =
  .label = Another checkbox
browser-layout-label =
  .label = Browser layout
browser-layout-radio-horizontal =
  .label = Horizontal tabs
  .description = Displayed at the top of the browser
browser-layout-radio-vertical =
  .label = Vertical tabs
  .description = Displayed on the side, in the sidebar
browser-layout-sidebar =
  .label = Show sidebar
  .description = Quickly access bookmarks, tabs from your phone, AI chatbots, and more without leaving your main view
`,
  },
};

function getSetting() {
  return {
    value: true,
    on() {},
    off() {},
    userChange() {},
    visible: () => true,
    getControlConfig: c => c,
  };
}

const Template = ({ config }) => html`
  <setting-group .config=${config} .getSetting=${getSetting}></setting-group>
`;

export const Group = Template.bind({});
Group.args = {
  config: {
    id: "group-example",
    l10nId: "group-example-label",
    items: [
      {
        id: "checkbox-example",
        l10nId: "checkbox-example-input",
      },
      {
        id: "checkbox-example2",
        l10nId: "checkbox-example-input2",
        supportPage: "example-support",
        iconSrc: "chrome://global/skin/icons/highlights.svg",
      },
    ],
  },
};

export const BrowserLayout = Template.bind({});
BrowserLayout.args = {
  config: {
    id: "browser-layout-example",
    l10nId: "browser-layout-label",
    items: [
      {
        id: "tabs-layout",
        control: "moz-radio-group",
        options: [
          {
            id: "horizontal-tabs",
            l10nId: "browser-layout-radio-horizontal",
            value: true,
          },
          {
            id: "vertical-tabs",
            l10nId: "browser-layout-radio-vertical",
            value: false,
          },
        ],
      },
      {
        id: "show-sidebar",
        l10nId: "browser-layout-sidebar",
      },
    ],
  },
};
