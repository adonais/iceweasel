/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/smartwindow-resume-card.mjs";

window.MozXULElement.insertFTLIfNeeded("preview/aiWindow.ftl");

export default {
  title: "Domain-specific UI Widgets/AI Window/Smartwindow Resume Card",
  component: "smartwindow-resume-card",
};

const Template = ({ content, journeyId }) => html`
  <div style="width: 340px; padding: 20px;">
    <smartwindow-resume-card
      .content=${content}
      .journeyId=${journeyId}
      @smartwindow-resume-card:resume=${e => {
        alert(`Resume: ${e.detail.journeyId}`);
      }}
      @smartwindow-resume-card:dismiss=${e => {
        alert(`Dismiss: ${e.detail.journeyId}`);
      }}
      @smartwindow-resume-card:menu-item-selected=${e => {
        alert(`Menu item: ${e.detail.itemId} (${e.detail.journeyId})`);
      }}
    ></smartwindow-resume-card>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
  journeyId: "sample-1",
  content: {
    headline: "Team offsite planning",
    status:
      "You'd started a shared doc outlining offsite location options and had a Slack thread open with feedback from the team.",
    previewTabs: [
      { url: "https://docs.google.com/document/d/sample-1" },
      { url: "https://www.figma.com/file/sample-2" },
    ],
  },
};

export const ManyPreviewTabs = Template.bind({});
ManyPreviewTabs.args = {
  journeyId: "sample-2",
  content: {
    headline: "Japan trip planning",
    status:
      "Reviewed transportation options including the Japan Rail Pass and Tokyo Metro, plus a few hotel options near Shinjuku.",
    previewTabs: [
      { url: "https://docs.google.com/document/d/sample-3" },
      { url: "https://www.figma.com/file/sample-4" },
      { url: "https://en.wikipedia.org/wiki/sample-5" },
      { url: "https://en.wikipedia.org/wiki/sample-6" },
    ],
  },
};

export const LongTitleAndDescription = Template.bind({});
LongTitleAndDescription.args = {
  journeyId: "sample-3",
  content: {
    headline:
      "Comparing espresso machines and coffee grinders for the new kitchen setup",
    status:
      "Compared top-rated espresso machines and coffee grinders, with reference to several reviews and a spreadsheet tracking prices across retailers.",
    previewTabs: [{ url: "https://www.example.com/sample-7" }],
  },
};

export const NoPreviewTabs = Template.bind({});
NoPreviewTabs.args = {
  journeyId: "sample-4",
  content: {
    headline: "Recipe roundup for dinner party",
    status: "You had a handful of recipe pages open while planning the menu.",
    previewTabs: [],
  },
};
