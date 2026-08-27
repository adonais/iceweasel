/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent, render } from "@testing-library/react";
import {
  ErrorBoundary,
  ErrorBoundaryFallback,
} from "content-src/components/ErrorBoundary/ErrorBoundary";

// The Enzyme test called componentDidCatch() directly on the shallow instance.
// RTL has no instance access, so we trigger the lifecycle for real via a child
// that throws while rendering.
function ThrowingChild() {
  throw new Error("boom");
}

describe("<ErrorBoundary>", () => {
  it("should render its children if componentDidCatch wasn't called", () => {
    const { container } = render(
      <ErrorBoundary>
        <div className="kids" />
      </ErrorBoundary>
    );

    expect(container.querySelector(".kids")).toBeInTheDocument();
  });

  it("should render ErrorBoundaryFallback if componentDidCatch called", () => {
    // React logs caught render errors via console.error, which jest-setup
    // treats as a failure, so suppress it for this intentional-error case.
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { container } = render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(container.querySelector(".as-error-fallback")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it("should render the given FallbackComponent if componentDidCatch called", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    function TestFallback() {
      return <div className="my-fallback">doh!</div>;
    }

    const { container } = render(
      <ErrorBoundary FallbackComponent={TestFallback}>
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(container.querySelector(".my-fallback")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it("should pass the given className prop to the FallbackComponent", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    function TestFallback({ className }) {
      return <div className={className}>doh!</div>;
    }

    const { container } = render(
      <ErrorBoundary FallbackComponent={TestFallback} className="sheep">
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(container.querySelector(".sheep")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});

describe("ErrorBoundaryFallback", () => {
  it("should render a <div> with a class of as-error-fallback", () => {
    const { container } = render(<ErrorBoundaryFallback />);

    expect(
      container.querySelector("div.as-error-fallback")
    ).toBeInTheDocument();
  });

  it("should render a <div> with the props.className and .as-error-fallback", () => {
    const { container } = render(<ErrorBoundaryFallback className="monkeys" />);

    expect(
      container.querySelector("div.monkeys.as-error-fallback")
    ).toBeInTheDocument();
  });

  it("should call window.location.reload(true) if .reload-button clicked", () => {
    const reloadSpy = jest.fn();
    const fakeWindow = { location: { reload: reloadSpy } };
    const { container } = render(
      <ErrorBoundaryFallback windowObj={fakeWindow} />
    );

    fireEvent.click(container.querySelector(".reload-button"));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledWith(true);
  });

  it("should render .reload-button as an <A11yLinkButton>", () => {
    const { container } = render(<ErrorBoundaryFallback />);

    // A11yLinkButton renders a <button class="a11y-link-button ...">; that is
    // the RTL-observable stand-in for Enzyme's find("A11yLinkButton.reload-button").
    const reloadButton = container.querySelector("button.reload-button");
    expect(reloadButton).toBeInTheDocument();
    expect(reloadButton).toHaveClass("a11y-link-button");
  });

  it("should render newtab-error-fallback-refresh-link node", () => {
    const { container } = render(<ErrorBoundaryFallback />);

    const refreshLink = container.querySelector(
      '[data-l10n-id="newtab-error-fallback-refresh-link"]'
    );
    expect(refreshLink).toBeInTheDocument();
    expect(refreshLink.tagName).toBe("BUTTON");
  });

  it("should render newtab-error-fallback-info node", () => {
    const { container } = render(<ErrorBoundaryFallback />);

    expect(
      container.querySelector('[data-l10n-id="newtab-error-fallback-info"]')
    ).toBeInTheDocument();
  });
});
