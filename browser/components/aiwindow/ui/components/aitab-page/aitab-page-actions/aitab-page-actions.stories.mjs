/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-page-actions.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab Page Actions",
  component: "aitab-page-actions",
  argTypes: {
    refreshing: { control: { type: "boolean" } },
  },
  parameters: {
    fluent: `
aitab-page-refresh-sources =
    .label = Refresh sources
aitab-page-refreshing-sources =
    .label = Refreshing sources
aitab-page-delete =
    .aria-label = Delete page
    .title = Delete page
aitab-page-delete-dialog-title = Delete this [AI Tab]?
aitab-page-delete-dialog-message = This generated page will be removed. The sources it was built from aren't affected.
aitab-page-delete-dialog-cancel =
    .label = Cancel
aitab-page-delete-dialog-confirm =
    .label = Delete
    `,
  },
};

const Template = ({ refreshing }) => html`
  <aitab-page-actions ?refreshing=${refreshing}></aitab-page-actions>
`;

export const Default = Template.bind({});
Default.args = { refreshing: false };

export const Refreshing = Template.bind({});
Refreshing.args = { refreshing: true };
