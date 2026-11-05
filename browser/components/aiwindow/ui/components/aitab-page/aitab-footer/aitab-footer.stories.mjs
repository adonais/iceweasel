/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/aitab-footer.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Tab Footer",
  component: "aitab-footer",
  parameters: {
    fluent: `
aitab-page-footer-brand = Smart Window
    `,
  },
};

const Template = () => html`<aitab-footer></aitab-footer>`;

export const Default = Template.bind({});
Default.args = {};
