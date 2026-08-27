import { render } from "@testing-library/react";
import { _CollapsibleSection as CollapsibleSection } from "content-src/components/CollapsibleSection/CollapsibleSection";
import { ErrorBoundary } from "content-src/components/ErrorBoundary/ErrorBoundary";

const DEFAULT_PROPS = {
  id: "cool",
  className: "cool-section",
  title: "Cool Section",
  prefName: "collapseSection",
  collapsed: false,
  eventSource: "foo",
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: "visible",
  },
  dispatch: () => {},
  Prefs: { values: { featureConfig: {} } },
};

describe("CollapsibleSection", () => {
  let wrapper;

  function testSetup(props = {}) {
    const customProps = Object.assign({}, DEFAULT_PROPS, props);
    wrapper = render(
      <CollapsibleSection {...customProps}>foo</CollapsibleSection>
    );
  }

  beforeEach(() => testSetup());

  it("should render the component", () => {
    expect(wrapper.container.firstChild).toBeInTheDocument();
  });

  it("should render an ErrorBoundary with class section-body-fallback", () => {
    const errorBoundaryRenderSpy = jest.spyOn(
      ErrorBoundary.prototype,
      "render"
    );
    testSetup();
    expect(errorBoundaryRenderSpy.mock.instances[0].props.className).toBe(
      "section-body-fallback"
    );
    errorBoundaryRenderSpy.mockRestore();
  });

  describe("without collapsible pref", () => {
    let dispatch;
    beforeEach(() => {
      dispatch = jest.fn();
      testSetup({ collapsed: undefined, dispatch });
    });
    it("should render the section uncollapsed", () => {
      expect(
        wrapper.container.querySelector(".collapsible-section")
      ).not.toHaveClass("collapsed");
    });

    it("should not render the arrow if no collapsible pref exists for the section", () => {
      expect(
        wrapper.container.querySelector(".click-target .collapsible-arrow")
      ).not.toBeInTheDocument();
    });
  });

  describe("icon", () => {
    it("no icon should be shown", () => {
      expect(wrapper.container.querySelector(".icon")).not.toBeInTheDocument();
    });
  });
});
