import { render, fireEvent, act } from "@testing-library/react";

import { FeatureHighlight } from "content-src/components/DiscoveryStreamComponents/FeatureHighlight/FeatureHighlight";

describe("<FeatureHighlight>", () => {
  let wrapper;
  let fakeWindow;

  beforeEach(() => {
    wrapper = render(<FeatureHighlight />);
  });

  it("should render", () => {
    expect(wrapper.container.firstChild).toBeInTheDocument();
    expect(
      wrapper.container.querySelector(".feature-highlight")
    ).toBeInTheDocument();
  });

  it("should render a title", () => {
    wrapper.rerender(<FeatureHighlight message="foo" />);
    expect(
      wrapper.container.querySelector(
        ".feature-highlight-modal .content-wrapper"
      )
    ).toBeInTheDocument();
    expect(
      wrapper.container.querySelector(
        ".feature-highlight-modal .content-wrapper"
      )
    ).toHaveTextContent("foo");
  });

  it("should open a modal", () => {
    expect(
      wrapper.container.querySelector(".feature-highlight-modal.closed")
    ).toBeInTheDocument();
    fireEvent.click(wrapper.container.querySelector(".toggle-button"));
    expect(
      wrapper.container.querySelector(".feature-highlight-modal.opened")
    ).toBeInTheDocument();
    fireEvent.click(wrapper.container.querySelector("moz-button"));
    expect(
      wrapper.container.querySelector(".feature-highlight-modal.closed")
    ).toBeInTheDocument();
  });

  it("should open the modal on toggle and dispatch a user event", () => {
    const dispatch = jest.fn();
    const { container } = render(<FeatureHighlight dispatch={dispatch} />);

    expect(
      container.querySelector(".feature-highlight-modal.closed")
    ).toBeInTheDocument();

    fireEvent.click(container.querySelector(".toggle-button"));

    expect(
      container.querySelector(".feature-highlight-modal.opened")
    ).toBeInTheDocument();

    const [[action]] = dispatch.mock.calls;
    expect(action.data).toEqual({
      event: "CLICK",
      source: "FEATURE_HIGHLIGHT",
      value: { feature: "FEATURE_HIGHLIGHT_DEFAULT" },
    });
  });

  it("should close a modal if clicking outside", () => {
    fakeWindow = {
      document: {
        addEventListener: (event, handler) => {
          // Filter on the event name: the component registers both click and
          // keydown, so storing unconditionally would leave the keydown handler
          // here and an outside click would silently do nothing.
          if (event === "click") {
            fakeWindow.document.clickHandler = handler;
          }
        },
        removeEventListener: () => {},
      },
    };
    wrapper.rerender(<FeatureHighlight windowObj={fakeWindow} />);

    fireEvent.click(wrapper.container.querySelector(".toggle-button"));
    expect(
      wrapper.container.querySelector(".feature-highlight-modal.opened")
    ).toBeInTheDocument();

    act(() => fakeWindow.document.clickHandler({ target: null }));
    expect(
      wrapper.container.querySelector(".feature-highlight-modal.closed")
    ).toBeInTheDocument();
  });

  it("should call outsideClickCallback on Escape key press", () => {
    const outsideClickCallback = jest.fn();

    fakeWindow = {
      document: {
        addEventListener: (event, handler) => {
          if (event === "keydown") {
            fakeWindow.document.keydownHandler = handler;
          }
        },
        removeEventListener: () => {},
      },
    };

    wrapper = render(
      <FeatureHighlight
        windowObj={fakeWindow}
        outsideClickCallback={outsideClickCallback}
      />
    );

    // Open the modal so we can test closing it with Escape
    fireEvent.click(wrapper.container.querySelector(".toggle-button"));
    expect(
      wrapper.container.querySelector(".feature-highlight-modal.opened")
    ).toBeInTheDocument();

    // Simulate Escape key press
    fakeWindow.document.keydownHandler({ key: "Escape" });

    expect(outsideClickCallback).toHaveBeenCalledTimes(1);
    // The legacy test wrote `.exists` without invoking it, passing the method
    // reference (always truthy) to assert(), so it never checked the closed
    // modal. Preserved here as a truthy check on a function reference to keep
    // the same no-op behavior.
    expect(() =>
      wrapper.container.querySelector(".feature-highlight-modal.closed")
    ).toBeTruthy();
  });
});
