import { fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore, combineReducers } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { SectionContextMenu } from "content-src/components/DiscoveryStreamComponents/SectionContextMenu/SectionContextMenu";
import { WrapWithProvider } from "test/jest/test-utils";

// The panel-list is persistent (always in the DOM, paired to its moz-button via
// menuId), so menu items can be queried and clicked without "opening" it first.
function clickOption(container, l10nId) {
  fireEvent.click(
    container.querySelector(`[data-l10n-id="${l10nId}"]`).closest("panel-item")
  );
}

function renderWithStore(props) {
  const store = createStore(combineReducers(reducers), INITIAL_STATE);
  const dispatch = jest.spyOn(store, "dispatch");
  const utils = render(
    <Provider store={store}>
      <SectionContextMenu dispatch={store.dispatch} {...props} />
    </Provider>
  );
  return { ...utils, dispatch };
}

describe("<SectionContextMenu>", () => {
  it("should render a panel-list menu", () => {
    const { container } = render(
      <WrapWithProvider>
        <SectionContextMenu
          dispatch={jest.fn()}
          index={0}
          sectionKey=""
          following={false}
          sectionPersonalization={null}
          sectionPosition={null}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".section-context-menu")
    ).toBeInTheDocument();
    expect(container.querySelector("panel-list")).toBeInTheDocument();
  });

  it("should label the menu button with the section title", () => {
    const { container } = renderWithStore({
      sectionKey: "sports",
      title: "Sports",
      sectionPersonalization: {},
      sectionPosition: 1,
    });
    const button = container.querySelector(
      ".section-context-menu > moz-button"
    );

    expect(button).toHaveAttribute(
      "data-l10n-id",
      "newtab-menu-content-tooltip"
    );
    expect(JSON.parse(button.getAttribute("data-l10n-args"))).toEqual({
      title: "Sports",
    });
  });

  it("should use the variable-free tooltip when the section has no title", () => {
    // Sections render with a blank title while spocs load. Formatting
    // newtab-menu-content-tooltip without $title crashes the Fluent resolver in
    // debug builds, so the button has to switch messages rather than pass an
    // empty $title.
    const { container } = renderWithStore({
      sectionKey: "sports",
      title: "",
      sectionPersonalization: {},
      sectionPosition: 1,
    });
    const button = container.querySelector(
      ".section-context-menu > moz-button"
    );

    expect(button).toHaveAttribute(
      "data-l10n-id",
      "newtab-menu-section-tooltip"
    );
    expect(button).not.toHaveAttribute("data-l10n-args");
  });

  it("should open the learn more url and record telemetry when Learn More is clicked", () => {
    const learnMoreUrl = "https://example.com/learn-more";
    const { container, dispatch } = renderWithStore({ learnMoreUrl });

    clickOption(container, "newtab-menu-section-learn-more");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OPEN_LINK",
        data: expect.objectContaining({ url: learnMoreUrl }),
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CLICK_SECTION_LEARN_MORE" })
    );
  });

  it("should open the block confirmation dialog when Block is clicked", () => {
    const { container, dispatch } = renderWithStore({
      sectionKey: "sports",
      title: "Sports",
      sectionPersonalization: {},
      sectionPosition: 1,
    });

    clickOption(container, "newtab-menu-section-block");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DIALOG_OPEN" })
    );
  });

  it("should unfollow the section when Unfollow is clicked", () => {
    const { container, dispatch } = renderWithStore({
      following: true,
      sectionKey: "sports",
      title: "Sports",
      sectionPersonalization: { sports: { isFollowed: true } },
      sectionPosition: 1,
    });

    clickOption(container, "newtab-menu-section-unfollow-topic");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SECTION_PERSONALIZATION_SET" })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UNFOLLOW_SECTION" })
    );
  });
});
