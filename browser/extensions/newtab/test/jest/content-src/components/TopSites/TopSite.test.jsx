import { render, fireEvent, act } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import {
  TopSite,
  TopSiteLink,
  TopSiteAddButton,
  _TopSiteList as TopSiteList,
} from "content-src/components/TopSites/TopSite";
import { buildTopSitesList } from "content-src/components/TopSites/TopSiteListContainer";
import { actionTypes as at } from "common/Actions.mjs";

const DEFAULT_LINK = {
  url: "https://example.com",
  hostname: "example.com",
  title: "Example",
  label: "Example",
  iconType: "no_image",
};

// Unique urls keep React keys distinct when the rows are rendered.
const makeRows = n =>
  Array.from({ length: n }, (_, i) => ({
    ...DEFAULT_LINK,
    url: `https://example${i}.com`,
  }));

const LIST_PROPS = {
  dispatch: jest.fn(),
  onDragEvent: jest.fn(),
  topSiteIconType: () => "no_image",
  topSitesMaxSitesPerRow: 8,
  TopSitesRows: 1,
  App: { isForStartupCache: {} },
  Prefs: { values: {} },
};

function renderList(sites) {
  return render(
    <WrapWithProvider>
      <TopSiteList {...LIST_PROPS} sites={sites} />
    </WrapWithProvider>
  );
}

describe("<TopSite>", () => {
  it("should render", () => {
    const { container } = render(
      <WrapWithProvider>
        <TopSite
          link={DEFAULT_LINK}
          index={0}
          dispatch={jest.fn()}
          onDragEvent={jest.fn()}
          activeIndex={-1}
        />
      </WrapWithProvider>
    );
    expect(container.querySelector(".top-site-outer")).toBeInTheDocument();
  });
});

describe("buildTopSitesList Add button placement", () => {
  function getSites(rows, { rowsCount = 1, perRow = 8 } = {}) {
    return buildTopSitesList(rows, rowsCount, perRow);
  }

  function addButtonIndex(sites) {
    return sites.findIndex(site => site?.isAddButton);
  }

  it("places the Add button in the first slot when there are no shortcuts", () => {
    expect(addButtonIndex(getSites([]))).toBe(0);
  });

  it("keeps the Add button visible after the first shortcut is added", () => {
    // Regression for Bug 2046956: starting from zero shortcuts and adding one
    // used to default the Add button to the last slot, where pinning the new
    // shortcut pushed the button out of bounds and hid it.
    expect(addButtonIndex(getSites([DEFAULT_LINK]))).toBe(1);
  });

  it("places the Add button right after the last shortcut", () => {
    expect(
      addButtonIndex(getSites([DEFAULT_LINK, DEFAULT_LINK, DEFAULT_LINK]))
    ).toBe(3);
  });

  it("keeps the Add button when the grid is full but can still grow a row", () => {
    expect(
      addButtonIndex(getSites(makeRows(8), { rowsCount: 1, perRow: 8 }))
    ).toBe(8);
  });

  it("drops the Add button when the grid is full at the max rows", () => {
    expect(
      addButtonIndex(getSites(makeRows(32), { rowsCount: 4, perRow: 8 }))
    ).toBe(-1);
  });
});

describe("<TopSiteAddButton>", () => {
  it("renders an in-grid tile with a large button", () => {
    const { container } = render(
      <TopSiteAddButton inGrid={true} index={3} dispatch={jest.fn()} />
    );
    const tile = container.querySelector("li.add-button-tile");
    expect(tile).toBeInTheDocument();
    const button = tile.querySelector("moz-button.add-button");
    expect(button).toBeInTheDocument();
    expect(button.getAttribute("size")).toBe("large");
  });

  it("renders a hover overlay (default size) when not in-grid", () => {
    const { container } = render(
      <TopSiteAddButton index={8} dispatch={jest.fn()} />
    );
    const overlay = container.querySelector("div.add-button-hidden");
    expect(overlay).toBeInTheDocument();
    expect(
      container.querySelector("li.add-button-tile")
    ).not.toBeInTheDocument();
    const button = overlay.querySelector("moz-button.add-button");
    expect(button).toBeInTheDocument();
    expect(button.hasAttribute("size")).toBe(false);
  });

  it("carries the slot's responsive hide class on the in-grid tile", () => {
    const { container } = render(
      <TopSiteAddButton
        inGrid={true}
        className="hide-for-small"
        index={3}
        dispatch={jest.fn()}
      />
    );
    expect(
      container.querySelector("li.add-button-tile.hide-for-small")
    ).toBeInTheDocument();
  });

  it("dispatches TOP_SITES_EDIT with its index when clicked", () => {
    const dispatch = jest.fn();
    const { container } = render(
      <TopSiteAddButton inGrid={true} index={7} dispatch={dispatch} />
    );
    fireEvent.click(container.querySelector("moz-button"));
    expect(dispatch).toHaveBeenCalledWith({
      type: at.TOP_SITES_EDIT,
      data: { index: 7 },
    });
  });
});

describe("<TopSiteList> Add button rendering", () => {
  it("renders the add button in-grid when the row isn't full", () => {
    const { container } = renderList(buildTopSitesList(makeRows(2), 1, 8));
    expect(container.querySelector(".add-button-tile")).toBeInTheDocument();
    expect(
      container.querySelector(".add-button-hidden")
    ).not.toBeInTheDocument();
  });

  it("renders the add button as a hover overlay when the row is full", () => {
    const { container } = renderList(buildTopSitesList(makeRows(8), 1, 8));
    expect(container.querySelector(".add-button-hidden")).toBeInTheDocument();
    expect(container.querySelector(".add-button-tile")).not.toBeInTheDocument();
  });
});

describe("<TopSiteList> arrow-key navigation", () => {
  // The flat focus order onKeyDown walks: each tile's link plus either
  // add-button variant (both carry .add-button), in DOM order.
  function focusTargetsFor(sites) {
    const { container } = renderList(sites);
    return [...container.querySelectorAll("a, .add-button")];
  }

  it("moves focus to the next tile on ArrowRight", () => {
    const targets = focusTargetsFor(buildTopSitesList(makeRows(3), 1, 8));
    act(() => targets[0].focus());
    fireEvent.keyDown(targets[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(targets[1]);
  });

  it("moves focus to the previous tile on ArrowLeft", () => {
    const targets = focusTargetsFor(buildTopSitesList(makeRows(3), 1, 8));
    act(() => targets[1].focus());
    fireEvent.keyDown(targets[1], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(targets[0]);
  });

  it("steps onto the in-grid add button from the last tile", () => {
    // 2 tiles + a free slot: the add button renders in-grid as the last target.
    const targets = focusTargetsFor(buildTopSitesList(makeRows(2), 1, 8));
    const addButton = targets.at(-1);
    expect(addButton).toHaveClass("add-button");

    act(() => targets[1].focus());
    fireEvent.keyDown(targets[1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(addButton);
  });

  it("steps onto the full-row overlay add button and back", () => {
    // Full row: the add button renders as the nested overlay, still the last
    // target — reached and left the same way as the in-grid variant.
    const targets = focusTargetsFor(buildTopSitesList(makeRows(8), 1, 8));
    const overlay = targets.at(-1);
    const lastTile = targets.at(-2);
    expect(overlay).toHaveClass("add-button");

    act(() => lastTile.focus());
    fireEvent.keyDown(lastTile, { key: "ArrowRight" });
    expect(document.activeElement).toBe(overlay);

    fireEvent.keyDown(overlay, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(lastTile);
  });

  it("wraps from the last focus target to the first and back", () => {
    const targets = focusTargetsFor(buildTopSitesList(makeRows(3), 1, 8));
    const [first] = targets;
    const last = targets.at(-1);

    act(() => last.focus());
    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(last);
  });
});

describe("TopSiteLink #_allowDrop with grouped pins", () => {
  const topsiteDrag = { dataTransfer: { types: ["text/topsite-index"] } };
  const makeLink = link => new TopSiteLink({ groupedPinsEnabled: true, link });

  it("allows dropping on a pinned tile", () => {
    expect(makeLink({ isPinned: true })._allowDrop(topsiteDrag)).toBe(true);
  });

  it("rejects dropping on a frecent (non-pinned) tile", () => {
    expect(makeLink({ isPinned: false })._allowDrop(topsiteDrag)).toBe(false);
  });

  it("stays rejected on a frecent tile even with a stale dragged flag", () => {
    // Regression: `dragged` is only reset on the next mousedown, so a cancelled
    // drag used to leave it true here and wrongly mark this slot droppable.
    const link = makeLink({ isPinned: false });
    link.dragged = true;
    expect(link._allowDrop(topsiteDrag)).toBe(false);
  });
});
