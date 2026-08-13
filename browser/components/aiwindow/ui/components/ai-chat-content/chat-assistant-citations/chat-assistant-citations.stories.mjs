/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/chat-assistant-citations.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/Chat Assistant Citations",
  component: "chat-assistant-citations",
  parameters: {
    fluent: `
smartwindow-assistant-citations-more-label = +{ $count } more
    `,
  },
};

const Template = ({ citations }) =>
  html`<chat-assistant-citations
    .citations=${citations}
  ></chat-assistant-citations>`;

export const OneSource = Template.bind({});
OneSource.args = {
  citations: [{ url: "https://www.mozilla.org/" }],
};

export const ThreeSources = Template.bind({});
ThreeSources.args = {
  citations: [
    { url: "https://www.mozilla.org/" },
    {
      url: "https://developer.mozilla.org/en-US/docs/Web",
      title: "Web technology for developers | MDN",
    },
    { url: "https://www.test.com/" },
  ],
};

export const FiveSources = Template.bind({});
FiveSources.args = {
  citations: [
    { url: "https://www.mozilla.org/" },
    {
      url: "https://developer.mozilla.org/en-US/docs/Web",
      title: "Web technology for developers | MDN",
    },
    { url: "https://www.test.com/" },
    { url: "https://support.mozilla.org/" },
    { url: "https://blog.mozilla.org/" },
  ],
};
