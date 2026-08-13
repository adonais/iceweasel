/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { HighlightPopoverBody } from "content-src/components/DiscoveryStreamComponents/FeatureHighlight/HighlightPopoverBody";

const defaultBody = {
  image: { src: "default.png" },
  title: { l10nId: "default-title-id" },
  subtitle: { l10nId: "default-subtitle-id" },
};

describe("<HighlightPopoverBody>", () => {
  it("renders defaults from the registry body when content has no overrides", () => {
    const { container } = render(
      <HighlightPopoverBody body={defaultBody} content={{}} />
    );
    expect(container.querySelector(".title").getAttribute("data-l10n-id")).toBe(
      "default-title-id"
    );
    expect(
      container.querySelector(".subtitle").getAttribute("data-l10n-id")
    ).toBe("default-subtitle-id");
    expect(container.querySelector("img").getAttribute("src")).toBe(
      "default.png"
    );
  });

  it("renders raw strings from content.cardTitle / cardMessage when provided", () => {
    const { container } = render(
      <HighlightPopoverBody
        body={defaultBody}
        content={{ cardTitle: "Raw Title", cardMessage: "Raw Body" }}
      />
    );
    expect(container.querySelector(".title").textContent).toBe("Raw Title");
    expect(container.querySelector(".title").hasAttribute("data-l10n-id")).toBe(
      false
    );
    expect(container.querySelector(".subtitle").textContent).toBe("Raw Body");
  });

  it("renders custom l10n ids from content.title / subtitle when raw is absent", () => {
    const { container } = render(
      <HighlightPopoverBody
        body={defaultBody}
        content={{ title: "custom-title-id", subtitle: "custom-subtitle-id" }}
      />
    );
    expect(container.querySelector(".title").getAttribute("data-l10n-id")).toBe(
      "custom-title-id"
    );
    expect(
      container.querySelector(".subtitle").getAttribute("data-l10n-id")
    ).toBe("custom-subtitle-id");
  });

  it("renders content.imageURL override over registry default", () => {
    const { container } = render(
      <HighlightPopoverBody
        body={defaultBody}
        content={{ imageURL: "override.png" }}
      />
    );
    expect(container.querySelector("img").getAttribute("src")).toBe(
      "override.png"
    );
  });

  it("hides the image when content.hideImage is truthy", () => {
    const { container } = render(
      <HighlightPopoverBody body={defaultBody} content={{ hideImage: true }} />
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders a <picture> with srcset when body has srcLight/srcDark", () => {
    const { container } = render(
      <HighlightPopoverBody
        body={{
          ...defaultBody,
          image: { srcLight: "light.png", srcDark: "dark.png" },
        }}
        content={{}}
      />
    );
    expect(container.querySelector("picture")).toBeInTheDocument();
    expect(
      container.querySelector('source[media="(prefers-color-scheme: dark)"]')
        .srcset
    ).toBe("dark.png");
    expect(
      container.querySelector('source[media="(prefers-color-scheme: light)"]')
        .srcset
    ).toBe("light.png");
  });

  it("renders no CTA button when the body has no cta", () => {
    const { container } = render(
      <HighlightPopoverBody
        body={defaultBody}
        content={{}}
        onCtaClick={jest.fn()}
      />
    );
    expect(container.querySelector(".button-wrapper")).toBeNull();
  });

  it("renders no CTA button when a cta exists but onCtaClick is missing", () => {
    const { container } = render(
      <HighlightPopoverBody
        body={{ ...defaultBody, cta: { l10nId: "default-cta-id" } }}
        content={{}}
      />
    );
    expect(container.querySelector(".button-wrapper")).toBeNull();
  });

  it("renders the CTA moz-button from the registry default cta l10n id", () => {
    const { container } = render(
      <HighlightPopoverBody
        body={{ ...defaultBody, cta: { l10nId: "default-cta-id" } }}
        content={{}}
        onCtaClick={jest.fn()}
      />
    );
    const button = container.querySelector(".button-wrapper moz-button");
    expect(button).toBeInTheDocument();
    expect(button.getAttribute("data-l10n-id")).toBe("default-cta-id");
  });

  it("renders a raw cardCta label over the default l10n id", () => {
    const { container } = render(
      <HighlightPopoverBody
        body={{ ...defaultBody, cta: { l10nId: "default-cta-id" } }}
        content={{ cardCta: "Raw CTA" }}
        onCtaClick={jest.fn()}
      />
    );
    const button = container.querySelector(".button-wrapper moz-button");
    expect(button.getAttribute("label")).toBe("Raw CTA");
    expect(button.hasAttribute("data-l10n-id")).toBe(false);
  });

  it("calls onCtaClick when the CTA button is clicked", () => {
    const onCtaClick = jest.fn();
    const { container } = render(
      <HighlightPopoverBody
        body={{ ...defaultBody, cta: { l10nId: "default-cta-id" } }}
        content={{}}
        onCtaClick={onCtaClick}
      />
    );
    fireEvent.click(container.querySelector(".button-wrapper moz-button"));
    expect(onCtaClick).toHaveBeenCalledTimes(1);
  });
});
