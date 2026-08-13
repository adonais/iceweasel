/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { html } from "lit.all.mjs";
import "chrome://global/content/elements/moz-card.mjs";
import "./menu-message.mjs";

export default {
  title: "Domain-specific UI Widgets/ASRouter/Menu Message",
  component: "menu-message",
  argTypes: {
    layout: {
      options: ["column", "row", "simple", "split"],
      control: { type: "select" },
    },
    imagePosition: {
      options: ["start", "end"],
      control: { type: "inline-radio" },
    },
  },
};

const Template = ({
  buttonText,
  imageURL,
  logoURL,
  primaryText,
  secondaryText,
  primaryButtonSize,
  imageVerticalTopOffset,
  imageVerticalBottomOffset,
  containerVerticalBottomOffset,
  containerPaddingBottom,
  layout,
  imagePosition,
  imageWidth,
  logoWidth,
}) => html`
  <moz-card style="width: 22.5rem;">
    <menu-message
      buttonText=${buttonText}
      primaryText=${primaryText}
      primaryButtonSize=${primaryButtonSize}
      secondaryText=${secondaryText}
      imageURL=${imageURL}
      logoURL=${logoURL}
      style="
        ${imageVerticalTopOffset !== undefined
        ? `--illustration-margin-block-start-offset: ${imageVerticalTopOffset}px;`
        : ""}
        ${imageVerticalBottomOffset !== undefined
        ? `--illustration-margin-block-end-offset: ${imageVerticalBottomOffset}px;`
        : ""}
        ${containerVerticalBottomOffset !== undefined
        ? `--container-margin-block-end-offset: ${containerVerticalBottomOffset}px;`
        : ""}
        ${imageWidth !== undefined ? `--image-width: ${imageWidth}px;` : ""}
        ${logoWidth !== undefined ? `--logo-width: ${logoWidth}px;` : ""}
        ${containerPaddingBottom !== undefined
        ? `--container-padding-block-end: ${containerPaddingBottom}px;`
        : ""}
      "
      layout=${layout}
      image-position=${imagePosition}
    >
    </menu-message>
  </moz-card>
`;

export const Default = Template.bind({});
Default.args = {
  buttonText: "Sign up",
  logoURL: "chrome://branding/content/about-logo.svg",
  imageURL:
    "chrome://browser/content/asrouter/assets/fox-with-box-on-cloud.svg",
  primaryText: "Bounce between devices",
  primaryButtonSize: "default",
  secondaryText:
    "Sync and encrypt your bookmarks, passwords, and more on all your devices.",
  imageVerticalTopOffset: -20,
  imageVerticalBottomOffset: 0,
  containerVerticalBottomOffset: 0,
  containerPaddingBottom: 8,
  layout: "column",
  imagePosition: "end",
  imageWidth: 120,
  logoWidth: 18,
};

export const Split = Template.bind({});
Split.args = {
  ...Default.args,
  primaryText: "Sync all your devices",
  secondaryText:
    "Instantly get your bookmarks and passwords everywhere you’re signed in to Firefox.",
  buttonText: "Sign in",
  layout: "split",
  imagePosition: "end",
  imageWidth: 100,
  imageVerticalTopOffset: 0,
};
