/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { html, ifDefined } from "lit.all.mjs";
import "./moz-card.mjs";

export default {
  title: "UI Widgets/Card",
  component: "moz-card",
  parameters: {
    status: "stable",
    fluent: `
moz-card-heading =
  .heading = This is the label
moz-card-heading-with-icon =
  .heading = This is a card with a heading icon
    `,
  },
  argTypes: {
    type: {
      options: ["default", "accordion"],
      control: { type: "select" },
    },
    spacing: {
      options: ["default", "compact"],
      control: { type: "select" },
    },
    headingLevel: {
      options: [1, 2, 3, 4, 5, 6],
      control: { type: "select" },
    },
    expanded: {
      options: [true, null],
      control: {
        type: "radio",
        labels: {
          true: "True",
          null: "False",
        },
      },
      if: { arg: "type", eq: "accordion" },
    },
  },
};

const Template = ({
  l10nId,
  content,
  type,
  spacing,
  headingLevel,
  iconSrc,
  expanded,
}) => html`
  <style>
    main {
      max-width: 400px;
    }
  </style>
  <main>
    <moz-card
      type=${ifDefined(type)}
      spacing=${ifDefined(spacing)}
      headingLevel=${ifDefined(headingLevel)}
      iconSrc=${ifDefined(iconSrc)}
      data-l10n-id=${ifDefined(l10nId)}
      expanded=${ifDefined(expanded)}
    >
      <div>${content}</div>
    </moz-card>
  </main>
`;

const TemplateWithImage = ({
  l10nId,
  content,
  type,
  spacing,
  headingLevel,
  iconSrc,
  expanded,
}) => html`
  <style>
    main {
      max-width: 400px;
    }
  </style>
  <main>
    <moz-card
      type=${ifDefined(type)}
      spacing=${ifDefined(spacing)}
      headingLevel=${ifDefined(headingLevel)}
      iconSrc=${ifDefined(iconSrc)}
      data-l10n-id=${ifDefined(l10nId)}
      expanded=${ifDefined(expanded)}
    >
      <img
        src="https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/newtab-wallpapers-v2/e1108381-5c19-4cb4-a630-69f9e45503fb.avif"
        alt
        slot="cover-image"
      />
      <div>${content}</div>
    </moz-card>
  </main>
`;

const TemplateWithLightDOMStyling = ({
  l10nId,
  content,
  type,
  spacing,
  headingLevel,
  iconSrc,
  expanded,
}) => html`
  <style>
    main {
      max-width: 400px;
    }

    .custom-cover-image {
      width: 100%;
      height: 215px;
      border-radius: var(--border-radius-small);
    }
  </style>
  <main>
    <moz-card
      type=${ifDefined(type)}
      spacing=${ifDefined(spacing)}
      headingLevel=${ifDefined(headingLevel)}
      iconSrc=${ifDefined(iconSrc)}
      data-l10n-id=${ifDefined(l10nId)}
      expanded=${ifDefined(expanded)}
    >
      <picture slot="cover-image">
        <img
          src="https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/newtab-wallpapers-v2/e1108381-5c19-4cb4-a630-69f9e45503fb.avif"
          alt
          class="custom-cover-image"
        />
      </picture>
      <div>${content}</div>
    </moz-card>
  </main>
`;

export const WithHeading = Template.bind({});
WithHeading.args = {
  l10nId: "moz-card-heading",
  content: "This is the content",
};

export const WithHeadingLevel = Template.bind({});
WithHeadingLevel.args = {
  ...WithHeading.args,
  content: "This is the content",
  headingLevel: 3,
};

export const Default = Template.bind({});
Default.args = {
  content: "This card only contains content",
};

export const Compact = Template.bind({});
Compact.args = {
  l10nId: "moz-card-heading",
  content: "This is the content",
  spacing: "compact",
};

export const Accordion = Template.bind({});
Accordion.args = {
  ...WithHeading.args,
  content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  Nunc velit turpis, mollis a ultricies vitae, accumsan ut augue.
  In a eros ac dolor hendrerit varius et at mauris.`,
  type: "accordion",
};
Accordion.parameters = {
  a11y: {
    config: {
      rules: [
        /*
        The accordion card can be expanded either by the chevron icon
        button or by activating the details element. Mouse users can
        click on the chevron button or the details element, while
        keyboard users can tab to the details element and have a
        focus ring around the details element in the card.
        Additionally, the details element is announced as a button
        so I don't believe we are providing a degraded experience
        to non-mouse users.

        Bug 1854008: We should probably make the accordion button a
        clickable div or something that isn't announced to screen
        readers.
        */
        {
          id: "button-name",
          reviewOnFail: true,
        },
        {
          id: "nested-interactive",
          reviewOnFail: true,
        },
      ],
    },
  },
};

export const AccordionExpanded = Template.bind({});
AccordionExpanded.args = {
  ...Accordion.args,
  expanded: true,
};
AccordionExpanded.parameters = Accordion.parameters;

export const WithHeadingIcon = Template.bind({});
WithHeadingIcon.args = {
  l10nId: "moz-card-heading-with-icon",
  content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  Nunc velit turpis, mollis a ultricies vitae, accumsan ut augue.
  In a eros ac dolor hendrerit varius et at mauris.`,
  type: "default",
  iconSrc: "chrome://global/skin/icons/settings.svg",
};

export const WithImage = TemplateWithImage.bind({});
WithImage.args = {
  l10nId: "moz-card-heading",
  content:
    'Using an img tag with `slot="cover-image"` will use some default styles that can be overridden with CSS custom properties.',
};

export const WithCustomImage = TemplateWithLightDOMStyling.bind({});
WithCustomImage.args = {
  l10nId: "moz-card-heading",
  content:
    "Custom content can be put into the cover-image slot, but you need to bring your own styles.",
};
