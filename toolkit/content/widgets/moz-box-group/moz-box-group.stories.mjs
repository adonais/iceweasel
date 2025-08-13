/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, ifDefined } from "../vendor/lit.all.mjs";
import { GROUP_TYPES } from "./moz-box-group.mjs";

export default {
  title: "UI Widgets/Box Group",
  component: "moz-box-group",
  argTypes: {
    type: {
      options: Object.keys(GROUP_TYPES),
      mapping: GROUP_TYPES,
      control: "select",
    },
  },
  parameters: {
    status: "in-development",
    fluent: `
moz-box-item =
  .label = I'm a box item
  .description = I'm part of a group
moz-box-button-1 =
  .label = I'm a box button in a group
moz-box-button-2 =
  .label = I'm another box button in a group
moz-box-link =
  .label = I'm a box link in a group
moz-box-delete-action =
  .title = Delete I'm a box item
moz-box-edit-action =
  .title = Edit I'm a box item
moz-box-toggle-action =
  .aria-label = Toggle I'm a box item
moz-box-more-action =
  .title = More options, I'm a box item
moz-box-item-reorderable-1 =
  .label = I'm box item number 1
moz-box-item-reorderable-2 =
  .label = I'm box item number 2
moz-box-item-reorderable-3 =
  .label = I'm box item number 3
moz-box-item-reorderable-4 =
  .label = I'm box item number 4
moz-box-item-reorderable-5 =
  .label = I'm box item number 5
moz-box-item-header =
  .label = I'm a header box item
moz-box-button-footer =
  .label = I'm a footer box button
    `,
  },
};

function getInnerElements(type) {
  if (type == GROUP_TYPES.reorderable) {
    return reorderableElements();
  }
  return basicElements();
}

function reorderableElements() {
  return Array.from({ length: 5 }).map((_, i) => {
    return html`<moz-box-item
      data-l10n-id=${`moz-box-item-reorderable-${i + 1}`}
    >
      <moz-button
        iconsrc="chrome://global/skin/icons/edit-outline.svg"
        data-l10n-id="moz-box-edit-action"
        slot="actions-start"
      ></moz-button>
      <moz-toggle
        slot="actions"
        pressed
        data-l10n-id="moz-box-toggle-action"
      ></moz-toggle>
    </moz-box-item>`;
  });
}

function basicElements() {
  return html`<moz-box-item data-l10n-id="moz-box-item">
      <moz-button
        iconsrc="chrome://global/skin/icons/edit-outline.svg"
        data-l10n-id="moz-box-edit-action"
        type="ghost"
        slot="actions"
      ></moz-button>
      <moz-toggle
        slot="actions"
        pressed
        data-l10n-id="moz-box-toggle-action"
      ></moz-toggle>
      <moz-button
        iconsrc="chrome://global/skin/icons/more.svg"
        data-l10n-id="moz-box-more-action"
        slot="actions-start"
      ></moz-button>
    </moz-box-item>
    <moz-box-link data-l10n-id="moz-box-link"></moz-box-link>
    <moz-box-button data-l10n-id="moz-box-button-1"></moz-box-button>
    <moz-box-item data-l10n-id="moz-box-item">
      <moz-button
        iconsrc="chrome://global/skin/icons/edit-outline.svg"
        data-l10n-id="moz-box-edit-action"
        type="ghost"
        slot="actions-start"
      ></moz-button>
      <moz-button
        iconsrc="chrome://global/skin/icons/more.svg"
        data-l10n-id="moz-box-more-action"
        slot="actions-start"
      ></moz-button>
    </moz-box-item>
    <moz-box-button data-l10n-id="moz-box-button-2"></moz-box-button>`;
}

const Template = ({ type, hasHeader, hasFooter }) => html`
  <style>
    .delete {
      margin-top: var(--space-medium);
    }
  </style>
  <moz-box-group type=${ifDefined(type)}>
    ${hasHeader
      ? html`<moz-box-item
          slot="header"
          data-l10n-id="moz-box-item-header"
        ></moz-box-item>`
      : ""}
    ${getInnerElements(type)}
    ${hasFooter
      ? html`<moz-box-button
          slot="footer"
          data-l10n-id="moz-box-button-footer"
        ></moz-box-button>`
      : ""}
  </moz-box-group>
  ${type == "list"
    ? html`<moz-button class="delete" @click=${appendItem}>
        Add an item
      </moz-button>`
    : ""}
`;

const appendItem = event => {
  let group = event.target.getRootNode().querySelector("moz-box-group");

  let boxItem = document.createElement("moz-box-item");
  boxItem.label = "New box item";
  boxItem.description = "New items are added to the list";

  let actionButton = document.createElement("moz-button");
  actionButton.addEventListener("click", () => boxItem.remove());
  actionButton.iconSrc = "chrome://global/skin/icons/delete.svg";
  actionButton.slot = "actions";
  actionButton.setAttribute("data-l10n-id", "moz-box-delete-action");
  boxItem.append(actionButton);

  group.prepend(boxItem);
};

export const Default = Template.bind({});
Default.args = {
  type: "default",
  hasHeader: false,
  hasFooter: false,
};

export const List = Template.bind({});
List.args = {
  ...Default.args,
  type: "list",
};

export const Reorderable = Template.bind({});
Reorderable.args = {
  ...Default.args,
  type: "reorderable",
};

export const ListWithHeaderAndFooter = Template.bind({});
ListWithHeaderAndFooter.args = {
  ...List.args,
  hasHeader: true,
  hasFooter: true,
};
