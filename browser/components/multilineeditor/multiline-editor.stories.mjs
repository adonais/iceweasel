/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/multilineeditor/multiline-editor.mjs";

export default {
  title: "UI Widgets/Multiline Editor",
  component: "moz-multiline-editor",
  argTypes: {
    action: {
      options: [null, "chat", "search", "navigate"],
      control: { type: "select" },
    },
  },
};

const Template = ({ placeholder }) => html`
  <moz-multiline-editor .placeholder=${placeholder}></moz-multiline-editor>
`;

export const Default = Template.bind({});
Default.args = {
  placeholder: "Placeholder text",
};
