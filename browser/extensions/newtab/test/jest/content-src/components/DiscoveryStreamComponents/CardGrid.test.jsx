/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { WrapWithProvider } from "test/jest/test-utils";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import {
  _CardGrid as CardGrid,
  CardGrid as ConnectedCardGrid,
  // eslint-disable-next-line no-shadow
  IntersectionObserver,
} from "content-src/components/DiscoveryStreamComponents/CardGrid/CardGrid";

describe("<CardGrid>", () => {
  let defaultProps;

  // Mirrors the legacy shallow() base props. The unconnected _CardGrid reads
  // Prefs/DiscoveryStream from its own props, but it renders connected children
  // (DSCard, TopicsWidget, AdBanner), so it is still wrapped in a redux Provider
  // so those children can resolve the store. Each renderGrid() call stands in for
  // the legacy wrapper.setProps().
  function renderGrid(props) {
    return render(
      <WrapWithProvider>
        <CardGrid {...defaultProps} {...props} />
      </WrapWithProvider>
    );
  }

  beforeEach(() => {
    defaultProps = {
      Prefs: INITIAL_STATE.Prefs,
      DiscoveryStream: INITIAL_STATE.DiscoveryStream,
    };
  });

  it("should render an empty div", () => {
    const { container } = renderGrid();

    expect(container).toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("should render DSCards", () => {
    const { container } = renderGrid({
      items: 2,
      data: { recommendations: [{ id: "rec-1" }, { id: "rec-2" }] },
    });

    const grid = container.querySelector(".ds-card-grid");
    expect(grid.children).toHaveLength(2);
    expect(grid.children[0]).toHaveClass("ds-card");
  });

  it("should add 4 card classname to card grid", () => {
    const { container } = renderGrid({
      fourCardLayout: true,
      data: { recommendations: [{ id: "rec-1" }, { id: "rec-2" }] },
    });

    expect(
      container.querySelector(".ds-card-grid-four-card-variant")
    ).toBeInTheDocument();
  });

  it("should add no description classname to card grid", () => {
    const { container } = renderGrid({
      hideCardBackground: true,
      data: { recommendations: [{ id: "rec-1" }, { id: "rec-2" }] },
    });

    expect(
      container.querySelector(".ds-card-grid-hide-background")
    ).toBeInTheDocument();
  });

  it("should add/hide description classname to card grid", () => {
    const withDescriptions = renderGrid({
      data: { recommendations: [{ id: "rec-1" }, { id: "rec-2" }] },
    });
    expect(
      withDescriptions.container.querySelector(
        ".ds-card-grid-include-descriptions"
      )
    ).toBeInTheDocument();

    const hiddenDescriptions = renderGrid({
      hideDescriptions: true,
      data: { recommendations: [{ id: "rec-1" }, { id: "rec-2" }] },
    });
    expect(
      hiddenDescriptions.container.querySelector(
        ".ds-card-grid-include-descriptions"
      )
    ).not.toBeInTheDocument();
  });

  it("should create a widget card", () => {
    // Bug 2064532: CardGrid splices TopicsWidget into the cards array without a
    // React key, which logs a "unique key" warning. Silence it so the jest-setup
    // console.error guard doesn't fail on it. Remove this spy once that bug is
    // fixed.
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { container } = renderGrid({
        widgets: {
          positions: [{ index: 1 }],
          data: [{ type: "TopicsWidget" }],
        },
        data: {
          recommendations: [{ id: "rec-1" }, { id: "rec-2" }, { id: "rec-3" }],
        },
      });

      expect(container.querySelector(".ds-topics-widget")).toBeInTheDocument();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("should render ds-card-grid-container as outer wrapper", () => {
    const { container } = renderGrid({ data: { recommendations: [] } });
    expect(
      container.querySelector(".ds-card-grid-container")
    ).toBeInTheDocument();
  });

  it("should render nova header h2 when nova enabled and sections disabled", () => {
    const { container } = renderGrid({
      data: { recommendations: [] },
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
          "discoverystream.sections.enabled": false,
        },
      },
    });

    const header = container.querySelector("h2.ds-header");
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute(
      "data-l10n-id",
      "newtab-section-header-stories"
    );
  });

  it("should not render nova header h2 when nova disabled", () => {
    const { container } = renderGrid({
      data: { recommendations: [] },
      title: "My Title",
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": false,
          "discoverystream.sections.enabled": false,
        },
      },
    });

    expect(container.querySelector("h2.ds-header")).not.toBeInTheDocument();
    expect(container.querySelector(".ds-header")).toBeInTheDocument();
  });

  it("should not render nova header h2 when sections enabled", () => {
    const { container } = renderGrid({
      data: { recommendations: [] },
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
          "discoverystream.sections.enabled": true,
        },
      },
    });

    expect(container.querySelector("h2.ds-header")).not.toBeInTheDocument();
  });

  it("should render title div header when not in nova mode", () => {
    const { container } = renderGrid({
      data: { recommendations: [] },
      title: "Test Title",
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": false,
        },
      },
    });

    const titleEl = container.querySelector(".ds-header .title");
    expect(titleEl).toBeInTheDocument();
    expect(titleEl).toHaveTextContent("Test Title");
  });

  it("should render AdBanner if enabled", () => {
    const { container } = renderGrid({
      items: 2,
      data: { recommendations: [{ id: "rec-1" }, { id: "rec-2" }] },
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "newtabAdSize.leaderboard": true,
          "newtabAdSize.billboard": true,
          // A numeric position keeps AdBanner's gridRow out of NaN, which would
          // otherwise log a React style warning and trip the console.error guard.
          "newtabAdSize.leaderboard.position": 1,
        },
      },
      DiscoveryStream: {
        ...INITIAL_STATE.DiscoveryStream,
        spocs: {
          ...INITIAL_STATE.DiscoveryStream.spocs,
          data: {
            newtab_spocs: {
              items: [
                {
                  id: "spoc-1",
                  format: "leaderboard",
                },
              ],
            },
          },
        },
      },
    });

    expect(container.querySelector(".ad-banner-wrapper")).toBeInTheDocument();
  });

  describe("Keyboard navigation", () => {
    let gridRef;
    let renderResult;

    beforeEach(() => {
      gridRef = createRef();
      const commonProps = {
        items: 3,
        data: {
          recommendations: [{ id: "rec-1" }, { id: "rec-2" }, { id: "rec-3" }],
        },
        Prefs: INITIAL_STATE.Prefs,
        DiscoveryStream: INITIAL_STATE.DiscoveryStream,
      };

      renderResult = render(
        <WrapWithProvider>
          <CardGrid ref={gridRef} {...commonProps} />
        </WrapWithProvider>
      );
    });

    afterEach(() => {
      renderResult.unmount();
    });

    it("should pass tabIndex={0} to the first card and tabIndex={-1} to other cards", () => {
      const cards = renderResult.container.querySelectorAll("a.ds-card-link");

      expect(cards[0]).toHaveAttribute("tabindex", "0");
      expect(cards[1]).toHaveAttribute("tabindex", "-1");
      expect(cards[2]).toHaveAttribute("tabindex", "-1");
    });

    it("should update focused index when onFocus is called", () => {
      const { container } = renderResult;
      const [, secondCard] = container.querySelectorAll("a.ds-card-link");

      fireEvent.focus(secondCard);

      const cards = container.querySelectorAll("a.ds-card-link");
      expect(cards[1]).toHaveAttribute("tabindex", "0");
      expect(cards[0]).toHaveAttribute("tabindex", "-1");
    });

    describe("handleCardKeyDown", () => {
      let mockLink;
      let mockTargetCard;
      let mockCurrentCard;
      let mockEvent;

      beforeEach(() => {
        mockLink = { focus: jest.fn() };
        mockTargetCard = {
          matches: jest.fn().mockReturnValue(true),
          querySelector: jest.fn().mockReturnValue(mockLink),
        };
        mockCurrentCard = {};
        mockEvent = {
          preventDefault: jest.fn(),
          target: {
            closest: jest.fn().mockReturnValue(mockCurrentCard),
          },
        };
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      it("should navigate to next card with ArrowRight", () => {
        mockEvent.key = "ArrowRight";
        mockCurrentCard.nextElementSibling = mockTargetCard;

        gridRef.current.handleCardKeyDown(mockEvent);

        expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(mockTargetCard.querySelector).toHaveBeenCalledTimes(1);
        expect(mockTargetCard.querySelector).toHaveBeenCalledWith(
          "a.ds-card-link"
        );
        expect(mockLink.focus).toHaveBeenCalledTimes(1);
      });

      it("should navigate to previous card with ArrowLeft", () => {
        mockEvent.key = "ArrowLeft";
        mockCurrentCard.previousElementSibling = mockTargetCard;

        gridRef.current.handleCardKeyDown(mockEvent);

        expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(mockTargetCard.querySelector).toHaveBeenCalledTimes(1);
        expect(mockTargetCard.querySelector).toHaveBeenCalledWith(
          "a.ds-card-link"
        );
        expect(mockLink.focus).toHaveBeenCalledTimes(1);
      });

      it("should return early if no current card found", () => {
        mockEvent.key = "ArrowRight";
        mockEvent.target.closest.mockReturnValue(null);

        gridRef.current.handleCardKeyDown(mockEvent);

        expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(mockTargetCard.querySelector).not.toHaveBeenCalled();
      });

      it("should handle case where no matching sibling card is found", () => {
        mockEvent.key = "ArrowRight";
        mockCurrentCard.nextElementSibling = {
          matches: jest.fn().mockReturnValue(false),
        };

        gridRef.current.handleCardKeyDown(mockEvent);

        expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(mockLink.focus).not.toHaveBeenCalled();
      });
    });
  });
});

// Build IntersectionObserver class with the arg `entries` for the intersect callback.
function buildIntersectionObserver(entries) {
  return class {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {
      this.callback(entries);
    }

    unobserve() {}

    disconnect() {}
  };
}

describe("<IntersectionObserver>", () => {
  let renderResult;
  let fakeWindow;
  let intersectEntries;

  beforeEach(() => {
    intersectEntries = [{ isIntersecting: true }];
    fakeWindow = {
      IntersectionObserver: buildIntersectionObserver(intersectEntries),
    };
    renderResult = render(<IntersectionObserver windowObj={fakeWindow} />);
  });

  it("should render an empty div", () => {
    expect(renderResult.container.firstChild).toBeInTheDocument();
    expect(renderResult.container.firstChild.tagName).toBe("DIV");
  });

  it("should fire onIntersecting", () => {
    const onIntersecting = jest.fn();
    renderResult = render(
      <IntersectionObserver
        windowObj={fakeWindow}
        onIntersecting={onIntersecting}
      />
    );
    expect(onIntersecting).toHaveBeenCalledTimes(1);
  });
});

describe("<CardGrid> data rendering", () => {
  it("should not render without data", () => {
    const { container } = render(
      <WrapWithProvider>
        <ConnectedCardGrid dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".ds-card-grid-container")
    ).not.toBeInTheDocument();
  });

  it("should render when data is provided", () => {
    const { container } = render(
      <WrapWithProvider>
        <ConnectedCardGrid
          dispatch={jest.fn()}
          data={{ recommendations: [] }}
          feed={{ url: "https://example.com" }}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".ds-card-grid-container")
    ).toBeInTheDocument();
  });
});
