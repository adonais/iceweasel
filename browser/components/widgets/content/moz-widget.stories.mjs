/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { html, ifDefined } from "lit.all.mjs";
import "./moz-widget.mjs";

export default {
  title: "Domain-specific UI Widgets/Widget",
  component: "moz-widget",
  parameters: {
    fluent: `
moz-widget-title =
  .title = Localized widget
moz-widget-back-button =
  .title = Back
  .aria-label = Back
moz-widget-units-button =
  .label = Units
moz-widget-menu-refresh = Refresh
moz-widget-menu-remove = Remove widget
    `,
  },
  argTypes: {
    size: {
      options: ["small", "medium", "large"],
      control: { type: "select" },
    },
    l10nId: {
      options: [undefined, "moz-widget-title"],
      control: { type: "select" },
    },
    badge: {
      options: [undefined, "new"],
      control: { type: "select" },
    },
  },
};

const WIDGET_DOCUMENT = `data:text/html,${encodeURIComponent(`
  <!doctype html>
  <body style="margin: 0;">
    <section style="padding: 1rem;">
      <h3>Framed widget</h3>
      <p>A document of its own.</p>
    </section>
  </body>
`)}`;

const headerTemplate = ({
  headerTitle,
  badge,
  backButton,
  trailingButton,
  menuLabel,
}) =>
  headerTitle || badge || backButton || trailingButton
    ? html`<moz-widget-header
        slot="header"
        title=${ifDefined(headerTitle)}
        menu-label=${ifDefined(menuLabel)}
      >
        ${backButton
          ? html`<moz-button
              slot="leading"
              type="ghost"
              size="small"
              iconsrc="chrome://global/skin/icons/arrow-left.svg"
              data-l10n-id="moz-widget-back-button"
            ></moz-button>`
          : ""}
        ${badge
          ? html`<moz-badge slot="leading" type=${badge}></moz-badge>`
          : ""}
        ${trailingButton
          ? html`<moz-button
              slot="trailing"
              size="small"
              iconsrc="chrome://global/skin/icons/arrow-down-12.svg"
              iconposition="end"
              data-l10n-id="moz-widget-units-button"
            ></moz-button>`
          : ""}
      </moz-widget-header>`
    : "";

const menuTemplate = menu =>
  menu
    ? html`<panel-list slot="menu" id="moz-widget-menu">
        <panel-item data-l10n-id="moz-widget-menu-refresh"></panel-item>
        <hr />
        <panel-item data-l10n-id="moz-widget-menu-remove"></panel-item>
      </panel-list>`
    : "";

const Template = ({
  size,
  widgetId,
  title,
  l10nId,
  padded,
  menu,
  menuLabel,
  ...header
}) => html`
  <moz-widget
    size=${size}
    widget-id=${widgetId}
    title=${title}
    data-l10n-id=${ifDefined(l10nId)}
    ?padded=${padded}
    menu-label=${ifDefined(menuLabel)}
  >
    ${headerTemplate({ ...header, menuLabel })} ${menuTemplate(menu)}
    <section style="padding: 1rem;">
      <p>Any HTML can go in the default slot.</p>
    </section>
  </moz-widget>
`;

const FramedTemplate = ({
  size,
  widgetId,
  title,
  l10nId,
  padded,
  src,
  menu,
  menuLabel,
  ...header
}) => html`
  <moz-widget
    size=${size}
    widget-id=${widgetId}
    title=${title}
    data-l10n-id=${ifDefined(l10nId)}
    ?padded=${padded}
    menu-label=${ifDefined(menuLabel)}
    src=${src}
  >
    ${headerTemplate({ ...header, menuLabel })} ${menuTemplate(menu)}
  </moz-widget>
`;

export const Default = Template.bind({});
Default.args = {
  size: "medium",
  widgetId: "example",
  title: "Example widget",
  headerTitle: "Example widget",
  badge: undefined,
  backButton: false,
  trailingButton: false,
  menu: false,
  menuLabel: "Widget options",
  padded: false,
};

export const Framed = FramedTemplate.bind({});
Framed.args = {
  ...Default.args,
  title: "Framed widget",
  headerTitle: "Framed widget",
  src: WIDGET_DOCUMENT,
};

export const Padded = FramedTemplate.bind({});
Padded.args = {
  ...Framed.args,
  padded: true,
};

export const HeaderActions = Template.bind({});
HeaderActions.args = {
  ...Default.args,
  badge: "new",
  backButton: true,
  trailingButton: true,
  menu: true,
};

export const WithoutHeader = FramedTemplate.bind({});
WithoutHeader.args = {
  ...Framed.args,
  headerTitle: undefined,
  menu: true,
};
