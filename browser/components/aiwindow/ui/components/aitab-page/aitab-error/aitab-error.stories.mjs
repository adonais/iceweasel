/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import-x/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-error.mjs";
import { withHeadingFont } from "../aitab-story-font.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab Error",
  component: "aitab-error",
  decorators: [withHeadingFont],

  parameters: {
    fluent: `
aitab-page-error-heading = This Smart Page isn’t available
aitab-page-error-intro = Here’s what may have happened:
aitab-page-error-reason-deleted = <strong>The page was deleted.</strong> To create a new one, go to another tab in Smart Window and ask in the sidebar.
aitab-page-error-reason-incorrect-link = <strong>The link is incorrect.</strong> Search for the page by name in the address bar.
aitab-page-error-reason-shared-link = <strong>The link was shared with you.</strong> Smart Pages can’t be shared by link. Ask the sender for a PDF instead.
    `,
  },
};

const Template = args =>
  html`<aitab-error .status=${args.status}></aitab-error>`;

export const Unavailable = Template.bind({});
Unavailable.args = {
  status: "unavailable",
};

export const GenericError = Template.bind({});
GenericError.args = {
  status: "error",
};
