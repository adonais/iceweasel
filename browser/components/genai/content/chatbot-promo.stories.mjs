/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/genai/content/chatbot-promo.mjs";

export default {
  title: "Domain-specific UI Widgets/GenAI/Chatbot Promo",
  component: "chatbot-promo",
  argTypes: {
    type: {
      options: ["default", "vibrant"],
      control: { type: "select" },
    },
  },
  parameters: {
    status: "in-development",
    docs: {
      description: {
        component:
          "An asrouter-driven promotional card rendered in the chatbot sidebar footer. Receives resolved content (heading, message, action labels) via the `message` property and dispatches `ChatbotPromo:PrimaryAction`, `ChatbotPromo:Close`, and `ChatbotPromo:Impression` events. The surrounding gradient background comes from the `.promo-active` rule in chat.css and so is not reproduced here.",
      },
    },
  },
};

const Template = ({
  type,
  heading,
  message,
  primaryActionText,
  additionalActionText,
}) => html`
  <div style="width: 360px; padding: 16px;">
    <chatbot-promo
      .message=${{
        type,
        heading,
        message,
        primaryActionText,
        additionalActionText,
      }}
      @ChatbotPromo:PrimaryAction=${() =>
        // eslint-disable-next-line no-console
        console.log("ChatbotPromo:PrimaryAction")}
      @ChatbotPromo:Close=${() =>
        // eslint-disable-next-line no-console
        console.log("ChatbotPromo:Close")}
      @ChatbotPromo:Impression=${() =>
        // eslint-disable-next-line no-console
        console.log("ChatbotPromo:Impression")}
    ></chatbot-promo>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
  type: "default",
  heading: "Give your AI the full picture",
  message:
    "In Smart Window, AI reads every page and tab you have open, not just this sidebar. Skip the copy-paste and just ask.",
  primaryActionText: "Try Smart Window",
  additionalActionText: "Dismiss",
};

export const PrimaryActionOnly = Template.bind({});
PrimaryActionOnly.args = {
  ...Default.args,
  additionalActionText: "",
};

export const NoButtons = Template.bind({});
NoButtons.args = {
  ...Default.args,
  primaryActionText: "",
  additionalActionText: "",
};

export const LongCopy = Template.bind({});
LongCopy.args = {
  ...Default.args,
  heading: "A longer heading to verify wrapping inside the promo card",
  message:
    "A much longer message to confirm wrapping and spacing within the promo card when the sidebar is narrow and the copy runs to several lines.",
};
