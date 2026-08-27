/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/ai-action-result.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Action Result",
  component: "ai-action-result",
  parameters: {
    fluent: `
smartwindow-nl-undo-button =
    .label = Undo
smartwindow-assistant-citations-more-label = +{ $count } more
  `,
  },
  argTypes: {
    label: { control: "text" },
    summary: { control: "text" },
    canUndo: { control: "boolean" },
    isExpanded: { control: "boolean" },
    rows: { control: "object" },
  },
};

const makeWebsites = count =>
  Array.from({ length: count }, (_, index) => ({
    url: `https://example.com/${index + 1}`,
    label: `Example Site ${index + 1}`,
  }));

const Template = ({ label, summary, canUndo, isExpanded, rows }) => html`
  <ai-action-result
    label=${label}
    summary=${summary}
    ?can-undo=${canUndo}
    ?is-expanded=${isExpanded}
    .rows=${rows}
  ></ai-action-result>
`;

export const Collapsed = Template.bind({});
Collapsed.args = {
  label: "Closed tab",
  summary: "Closed open tabs.",
  canUndo: true,
  isExpanded: false,
  rows: [
    {
      label: "Closed tab",
      items: makeWebsites(1),
    },
  ],
};

export const Expanded = Template.bind({});
Expanded.args = {
  label: "Closed tab",
  summary: "Closed open tabs.",
  canUndo: true,
  isExpanded: true,
  rows: [
    {
      label: "Closed tab",
      items: makeWebsites(1),
    },
  ],
};

export const ExpandedBulk = Template.bind({});
ExpandedBulk.args = {
  label: "Closed 3 tabs",
  summary: "Closed open tabs.",
  canUndo: true,
  isExpanded: true,
  rows: [
    {
      label: "Closed tabs",
      items: makeWebsites(3),
    },
  ],
};

export const ExpandedAfterUndo = Template.bind({});
ExpandedAfterUndo.args = {
  label: "Closed tab",
  summary: "Closed open tabs.",
  canUndo: false,
  isExpanded: true,
  rows: [
    {
      label: "Closed tab",
      items: makeWebsites(1),
    },
    {
      label: "Undo – reopened tab",
      items: [],
    },
  ],
};

const ResizableTemplate = ({
  label,
  summary,
  canUndo,
  isExpanded,
  rows,
}) => html`
  <div
    style="resize: horizontal; overflow: auto; inline-size: 560px; min-inline-size: 200px; max-inline-size: 100%; border: 1px dashed #ccc; padding: 8px;"
  >
    <ai-action-result
      label=${label}
      summary=${summary}
      ?can-undo=${canUndo}
      ?is-expanded=${isExpanded}
      .rows=${rows}
    ></ai-action-result>
  </div>
`;

export const ExpandedWithOverflowingChips = ResizableTemplate.bind({});
ExpandedWithOverflowingChips.args = {
  label: "Closed 6 tabs",
  summary: "Closed open tabs.",
  canUndo: true,
  isExpanded: true,
  rows: [
    {
      label: "Closed tabs",
      items: makeWebsites(6),
    },
  ],
};

export const ExpandedBulkAfterUndo = Template.bind({});
ExpandedBulkAfterUndo.args = {
  label: "Closed 3 tabs",
  summary: "Closed open tabs.",
  canUndo: false,
  isExpanded: true,
  rows: [
    {
      label: "Closed tabs",
      items: makeWebsites(3),
    },
    {
      label: "Restored tabs",
      items: [],
    },
  ],
};
