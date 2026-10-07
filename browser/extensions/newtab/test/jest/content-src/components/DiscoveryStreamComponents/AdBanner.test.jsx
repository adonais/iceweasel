/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent, render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { AdBanner } from "content-src/components/DiscoveryStreamComponents/AdBanner/AdBanner";
import { actionCreators as ac } from "common/Actions.mjs";
import React from "react";

const DEFAULT_PROPS = {
  prefs: {
    "discoverystream.sections.enabled": false,
  },
  type: "foo",
  row: 3,
  spoc: {
    format: "billboard",
    id: "12345",
    raw_image_src: "https://picsum.photos/200",
    alt_text: "alt-text",
    url: "https://example.com",
    shim: {
      url: "https://fallback.example.com",
    },
  },
};

describe("Discovery Stream <AdBanner>", () => {
  let wrapper;
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn();

    wrapper = render(
      <WrapWithProvider>
        <AdBanner dispatch={dispatch} {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );
  });

  it("should render", () => {
    expect(wrapper.container.firstChild).toBeInTheDocument();
    expect(
      wrapper.container.querySelector(".ad-banner-wrapper")
    ).toBeInTheDocument();
  });

  it("should have 'sponsored' text visible", () => {
    expect(
      wrapper.container.querySelector(".ad-banner-sponsored")
    ).toBeInTheDocument();
    expect(
      wrapper.container.querySelector(
        "[data-l10n-id='newtab-label-sponsored-fixed']"
      )
    ).toBeInTheDocument();
  });

  it("should load API image for the billboard banner with correct dimensions", () => {
    const image = wrapper.container.querySelector(".ad-banner-content img");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", DEFAULT_PROPS.spoc.raw_image_src);
    expect(image).toHaveAttribute("width", "970");
    expect(image).toHaveAttribute("height", "250");
  });

  it("should add alt text from spoc.alt_text property", () => {
    const image = wrapper.container.querySelector(".ad-banner-content img");
    expect(image).toHaveAttribute("alt", DEFAULT_PROPS.spoc.alt_text);
  });

  it("should load API image for the leaderboard banner with correct dimensions", () => {
    wrapper.rerender(
      <WrapWithProvider>
        <AdBanner
          dispatch={dispatch}
          {...DEFAULT_PROPS}
          spoc={{ ...DEFAULT_PROPS.spoc, format: "leaderboard" }}
        />
      </WrapWithProvider>
    );
    const image = wrapper.container.querySelector(".ad-banner-content img");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", DEFAULT_PROPS.spoc.raw_image_src);
    expect(image).toHaveAttribute("width", "728");
    expect(image).toHaveAttribute("height", "90");
  });

  it("should set image dimensions to undefined if format is not specified", () => {
    wrapper.rerender(
      <WrapWithProvider>
        <AdBanner
          dispatch={dispatch}
          {...DEFAULT_PROPS}
          spoc={{ ...DEFAULT_PROPS.spoc, format: undefined }}
        />
      </WrapWithProvider>
    );

    const image = wrapper.container.querySelector(".ad-banner-content img");
    expect(image).toBeInTheDocument();
    expect(image).not.toHaveAttribute("width");
    expect(image).not.toHaveAttribute("height");
  });

  it("should pass row prop as `gridRow` to aside element", () => {
    const aside = wrapper.container.querySelector(".ad-banner-wrapper");
    const clampedRow = Math.max(1, Math.min(9, DEFAULT_PROPS.row));
    expect(aside).toHaveStyle({ gridRow: String(clampedRow) });
  });

  it("should have the context menu button be visible", () => {
    const dismiss = wrapper.container.querySelector("moz-button");
    expect(dismiss).toBeInTheDocument();

    // The rest of the context menu functionality is now tested in
    // AdBannerContextMenu.test.jsx
  });

  it("should render data-is-sponsored-link='true' on banner link", () => {
    const link = wrapper.container.querySelector("a.ad-banner-link");
    expect(link).toHaveAttribute("data-is-sponsored-link", "true");
  });

  it("should call onLinkClick when banner is clicked", () => {
    const link = wrapper.container.querySelector("a.ad-banner-link");
    fireEvent.click(link);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(dispatch.mock.calls[2][0]).toEqual(
      ac.DiscoveryStreamUserEvent({
        event: "CLICK",
        source: "FOO",
        // Banner ads don't have a position, but a row number
        action_position: DEFAULT_PROPS.row,
        value: {
          card_type: "spoc",
          tile_id: DEFAULT_PROPS.spoc.id,
          format: DEFAULT_PROPS.spoc.format,
        },
      })
    );
  });

  it("should set proper ohttp src if ohttp, contextual, inferred, and sections are true", () => {
    wrapper.rerender(
      <WrapWithProvider>
        <AdBanner
          dispatch={dispatch}
          {...DEFAULT_PROPS}
          prefs={{
            ...DEFAULT_PROPS.prefs,
            "discoverystream.sections.enabled": true,
            "unifiedAds.ohttp.enabled": true,
            ohttpImagesConfig: { enabled: true },
            "discoverystream.sections.contextualAds.enabled": true,
            "discoverystream.sections.personalization.inferred.user.enabled": true,
            "discoverystream.sections.personalization.inferred.enabled": true,
          }}
        />
      </WrapWithProvider>
    );

    const image = wrapper.container.querySelector(".ad-banner-content img");
    expect(image).toHaveAttribute(
      "src",
      `moz-cached-ohttp://newtab-image/?url=${encodeURIComponent(DEFAULT_PROPS.spoc.raw_image_src)}`
    );
  });
});
