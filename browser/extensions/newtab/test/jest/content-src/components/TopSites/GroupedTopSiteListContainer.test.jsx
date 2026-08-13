/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore, combineReducers } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { GroupedTopSiteListContainer } from "content-src/components/TopSites/GroupedTopSiteListContainer";

const SPONSORED = {
  url: "https://sponsored.example/",
  label: "Sponsored",
  hostname: "sponsored.example",
  sponsored_position: 1,
  sponsored_impression_url: "https://ad-partner.example/impression",
};
const FRECENT = {
  url: "https://frecent.example/",
  label: "Frecent",
  hostname: "frecent.example",
};

function props(rows) {
  return {
    TopSites: { rows },
    TopSitesRows: 1,
    topSitesMaxSitesPerRow: 8,
    topSiteIconType: () => "no_image",
    dispatch: jest.fn(),
    colors: "",
    visibleTopSites: [],
  };
}

describe("<GroupedTopSiteListContainer>", () => {
  // Regression for Bug 2051628: adding the first pin (or removing the only pin)
  // flips `hasPins`. The container used to render a different component *type* on
  // each side of that boundary, so React remounted the whole TopSiteList subtree
  // — including sponsored tiles, which re-fired their (billable) ad impression on
  // remount. A single stable container must keep the subtree mounted across the
  // flip. We assert the sponsored tile's DOM node keeps its identity: same node
  // === React reused the instance === no remount === no duplicate impression.
  it("keeps the sponsored tile mounted when the first pin is added", () => {
    const store = createStore(combineReducers(reducers), INITIAL_STATE);

    const { container, rerender } = render(
      <Provider store={store}>
        <GroupedTopSiteListContainer {...props([SPONSORED, FRECENT])} />
      </Provider>
    );

    const sponsoredBefore = container.querySelector(
      `a[href="${SPONSORED.url}"]`
    );
    expect(sponsoredBefore).toBeInTheDocument();

    // Pin the frecent tile -> hasPins goes false -> true.
    rerender(
      <Provider store={store}>
        <GroupedTopSiteListContainer
          {...props([SPONSORED, { ...FRECENT, isPinned: true }])}
        />
      </Provider>
    );

    const sponsoredAfter = container.querySelector(
      `a[href="${SPONSORED.url}"]`
    );
    expect(sponsoredAfter).toBe(sponsoredBefore);
  });

  it("keeps the sponsored tile mounted when the only pin is removed", () => {
    const store = createStore(combineReducers(reducers), INITIAL_STATE);

    const { container, rerender } = render(
      <Provider store={store}>
        <GroupedTopSiteListContainer
          {...props([SPONSORED, { ...FRECENT, isPinned: true }])}
        />
      </Provider>
    );

    const sponsoredBefore = container.querySelector(
      `a[href="${SPONSORED.url}"]`
    );
    expect(sponsoredBefore).toBeInTheDocument();

    // Unpin -> hasPins goes true -> false.
    rerender(
      <Provider store={store}>
        <GroupedTopSiteListContainer {...props([SPONSORED, FRECENT])} />
      </Provider>
    );

    const sponsoredAfter = container.querySelector(
      `a[href="${SPONSORED.url}"]`
    );
    expect(sponsoredAfter).toBe(sponsoredBefore);
  });
});
