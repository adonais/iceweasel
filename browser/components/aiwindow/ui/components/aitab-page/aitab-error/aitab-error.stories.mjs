/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-error.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab Error",
  component: "aitab-error",
  // The type scale queries a container that aitab-page normally provides.
  // Without it the headings stay at their narrow sizes at every width.
  decorators: [
    story =>
      html`<div style="container: aitab-page / inline-size;">${story()}</div>`,
  ],

  parameters: {
    fluent: `
aitab-page-error-heading = This page isn’t available anymore.
aitab-page-error-description = Some other supplementary string.
    `,
  },
};

const Template = () => html`<aitab-error></aitab-error>`;

export const Default = Template.bind({});
Default.args = {};
