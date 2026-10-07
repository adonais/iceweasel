/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { Highlights } from "content-src/components/DiscoveryStreamComponents/Highlights/Highlights";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { WrapWithProvider } from "test/jest/test-utils";

describe("Discovery Stream <Highlights>", () => {
  let wrapper;

  afterEach(() => {
    wrapper.unmount();
  });

  it("should render nothing with no highlights data", () => {
    const store = createStore(combineReducers(reducers), { ...INITIAL_STATE });

    wrapper = render(
      <Provider store={store}>
        <Highlights />
      </Provider>
    );

    expect(wrapper.container).toBeEmptyDOMElement();
  });

  it("should render nothing when the highlights section is disabled", () => {
    const store = createStore(combineReducers(reducers), {
      ...INITIAL_STATE,
      Sections: [{ id: "highlights", enabled: false }],
    });

    wrapper = render(
      <Provider store={store}>
        <Highlights />
      </Provider>
    );

    expect(
      wrapper.container.querySelector(".ds-highlights")
    ).not.toBeInTheDocument();
    expect(wrapper.container).toBeEmptyDOMElement();
  });

  it("should render highlights", () => {
    const store = createStore(combineReducers(reducers), {
      ...INITIAL_STATE,
      Sections: [{ id: "highlights", enabled: true }],
    });

    wrapper = render(
      <Provider store={store}>
        <Highlights />
      </Provider>
    );

    expect(wrapper.container.querySelectorAll(".ds-highlights")).toHaveLength(
      1
    );
  });
});

describe("<Highlights>", () => {
  beforeEach(() => {
    Object.defineProperty(window.performance, "mark", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("should not render without an enabled highlights section", () => {
    const { container } = render(
      <WrapWithProvider>
        <Highlights />
      </WrapWithProvider>
    );
    expect(container.querySelector(".ds-highlights")).not.toBeInTheDocument();
  });

  it("should render when highlights section is enabled", () => {
    const state = {
      ...INITIAL_STATE,
      Sections: [{ id: "highlights", enabled: true, rows: [] }],
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <Highlights />
      </WrapWithProvider>
    );
    expect(container.querySelector(".ds-highlights")).toBeInTheDocument();
  });
});
