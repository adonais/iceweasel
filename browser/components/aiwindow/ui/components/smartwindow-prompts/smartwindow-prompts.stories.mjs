/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/smartwindow-prompts.mjs";

// Needed for the scroll buttons' data-l10n-id (only rendered when the row
// overflows, e.g. FullpageScrollableOverflow below).
window.MozXULElement.insertFTLIfNeeded("browser/aiWindow.ftl");

export default {
  title: "Domain-specific UI Widgets/AI Window/Smartwindow Prompts",
  component: "smartwindow-prompts",
  argTypes: {
    mode: {
      options: ["sidebar", "fullpage"],
      control: { type: "select" },
    },
  },
};

const samplePrompts = [
  { text: "Write a first draft", type: "chat" },
  { text: "Brainstorm ideas", type: "chat" },
  { text: "Compare tabs", type: "chat" },
];

const previewIconPrompts = [
  {
    text: "Pick up your Tokyo trip",
    type: "resume",
    previewIcons: [
      { iconSrc: "chrome://branding/content/about-logo.svg" },
      { iconSrc: "chrome://branding/content/about-logo.svg" },
    ],
  },
  {
    text: "Continue shopping",
    type: "resume",
    previewIcons: [
      { iconSrc: "chrome://branding/content/about-logo.svg" },
      { iconSrc: "chrome://branding/content/about-logo.svg" },
      { iconSrc: "chrome://branding/content/about-logo.svg" },
      { iconSrc: "chrome://branding/content/about-logo.svg" },
    ],
  },
  { text: "Improve your writing", type: "chat" },
];

const manyPrompts = [
  { text: "Write a first draft", type: "chat" },
  { text: "Brainstorm ideas", type: "chat" },
  { text: "Summarize tabs", type: "chat" },
  { text: "Proofread a message", type: "chat" },
  { text: "Simplify a topic", type: "chat" },
  { text: "Help make a plan", type: "chat" },
  { text: "Find tabs in history", type: "chat" },
  { text: "Compare tabs", type: "chat" },
];

const Template = ({ mode, prompts, containerWidth = "100%" }) => html`
  <div style="width: ${containerWidth}; min-height: 400px; padding: 20px;">
    <smartwindow-prompts
      .mode=${mode}
      .prompts=${prompts}
      @SmartWindowPrompt:prompt-selected=${e => {
        alert(`Selected: ${e.detail.text} (type: ${e.detail.type})`);
      }}
    ></smartwindow-prompts>
  </div>
`;

export const SidebarMode = Template.bind({});
SidebarMode.args = {
  mode: "sidebar",
  prompts: samplePrompts,
};

export const FullpageMode = Template.bind({});
FullpageMode.args = {
  mode: "fullpage",
  prompts: samplePrompts,
};

export const FullpageWithFavicons = Template.bind({});
FullpageWithFavicons.args = {
  mode: "fullpage",
  prompts: previewIconPrompts,
};

// Narrower than the pills' combined width, so the row overflows and
// exercises scrolling, the hover arrows, and the edge fade.
export const FullpageScrollableOverflow = Template.bind({});
FullpageScrollableOverflow.args = {
  mode: "fullpage",
  prompts: manyPrompts,
  containerWidth: "500px",
};
