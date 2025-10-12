import {
  _CardGrid as CardGrid,
  // eslint-disable-next-line no-shadow
  IntersectionObserver,
} from "content-src/components/DiscoveryStreamComponents/CardGrid/CardGrid";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { Provider } from "react-redux";
import { DSCard } from "content-src/components/DiscoveryStreamComponents/DSCard/DSCard";
import { TopicsWidget } from "content-src/components/DiscoveryStreamComponents/TopicsWidget/TopicsWidget";
import React from "react";
import { shallow, mount } from "enzyme";

// Wrap this around any component that uses useSelector,
// or any mount that uses a child that uses redux.
function WrapWithProvider({ children, state = INITIAL_STATE }) {
  let store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

describe("<CardGrid>", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = shallow(
      <CardGrid
        Prefs={INITIAL_STATE.Prefs}
        DiscoveryStream={INITIAL_STATE.DiscoveryStream}
      />
    );
  });

  it("should render an empty div", () => {
    assert.ok(wrapper.exists());
    assert.lengthOf(wrapper.children(), 0);
  });

  it("should render DSCards", () => {
    wrapper.setProps({ items: 2, data: { recommendations: [{}, {}] } });

    assert.lengthOf(wrapper.find(".ds-card-grid").children(), 2);
    assert.equal(wrapper.find(".ds-card-grid").children().at(0).type(), DSCard);
  });

  it("should add 4 card classname to card grid", () => {
    wrapper.setProps({
      fourCardLayout: true,
      data: { recommendations: [{}, {}] },
    });

    assert.ok(wrapper.find(".ds-card-grid-four-card-variant").exists());
  });

  it("should add no description classname to card grid", () => {
    wrapper.setProps({
      hideCardBackground: true,
      data: { recommendations: [{}, {}] },
    });

    assert.ok(wrapper.find(".ds-card-grid-hide-background").exists());
  });

  it("should add/hide description classname to card grid", () => {
    wrapper.setProps({
      data: { recommendations: [{}, {}] },
    });

    assert.ok(wrapper.find(".ds-card-grid-include-descriptions").exists());

    wrapper.setProps({
      hideDescriptions: true,
      data: { recommendations: [{}, {}] },
    });

    assert.ok(!wrapper.find(".ds-card-grid-include-descriptions").exists());
  });

  it("should create a widget card", () => {
    wrapper.setProps({
      widgets: {
        positions: [{ index: 1 }],
        data: [{ type: "TopicsWidget" }],
      },
      data: {
        recommendations: [{}, {}, {}],
      },
    });

    assert.ok(wrapper.find(TopicsWidget).exists());
  });

  it("should create a list feed", () => {
    const commonProps = {
      items: 12,
      data: {
        recommendations: [
          { feedName: "foo" },
          { feedName: "foo" },
          { feedName: "foo" },
          { feedName: "foo" },
          { feedName: "foo" },
          { feedName: "foo" },
        ],
      },
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "discoverystream.contextualContent.enabled": true,
          "discoverystream.contextualContent.selectedFeed": "foo",
        },
      },
      DiscoveryStream: INITIAL_STATE.DiscoveryStream,
    };

    wrapper = mount(
      <WrapWithProvider>
        <CardGrid {...commonProps} />
      </WrapWithProvider>
    );

    assert.ok(wrapper.find(".list-feed").exists());
  });

  it("should render AdBanner if enabled", () => {
    const commonProps = {
      ...INITIAL_STATE,
      items: 2,
      data: { recommendations: [{}, {}] },
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "newtabAdSize.leaderboard": true,
          "newtabAdSize.billboard": true,
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
                  format: "leaderboard",
                },
              ],
            },
          },
        },
      },
    };

    wrapper = mount(
      <WrapWithProvider>
        <CardGrid {...commonProps} />
      </WrapWithProvider>
    );

    assert.ok(wrapper.find(".ad-banner-wrapper").exists());
  });

  it("should render TrendingSearch if enabled", () => {
    const commonProps = {
      spocPositions: [{ index: 1 }, { index: 5 }, { index: 7 }],
      items: 12,
      data: {
        recommendations: [
          {},
          { format: "spoc" },
          {},
          {},
          {},
          {},
          {},
          {},
          {},
          {},
          {},
          {},
        ],
      },
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "trendingSearch.enabled": true,
          "system.trendingSearch.enabled": true,
          "trendingSearch.variant": "b",
          "trendingSearch.defaultSearchEngine": "Google",
        },
      },
      DiscoveryStream: INITIAL_STATE.DiscoveryStream,
    };

    wrapper = mount(
      <WrapWithProvider
        state={{
          ...INITIAL_STATE,
          Prefs: {
            ...INITIAL_STATE.Prefs,
            values: {
              ...INITIAL_STATE.Prefs.values,
              "trendingSearch.variant": "b",
            },
          },
          TrendingSearch: {
            suggestions: [
              {
                suggestion: "foo",
                searchUrl: "foo",
                lowerCaseSuggestion: "foo",
              },
              {
                suggestion: "bar",
                searchUrl: "bar",
                lowerCaseSuggestion: "foo",
              },
            ],
          },
        }}
      >
        <CardGrid {...commonProps} />
      </WrapWithProvider>
    );

    assert.ok(wrapper.find(".trending-searches-list-view").exists());
    const grid = wrapper.find(".ds-card-grid").first();
    // assert that the spoc has been placed in the correct position
    assert.equal(grid.childAt(1).prop("format"), "spoc");
    // confrim that the next child is the trending search widget
    assert.ok(grid.childAt(2).find(".trending-searches-list-view").exists());
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
  let wrapper;
  let fakeWindow;
  let intersectEntries;

  beforeEach(() => {
    intersectEntries = [{ isIntersecting: true }];
    fakeWindow = {
      IntersectionObserver: buildIntersectionObserver(intersectEntries),
    };
    wrapper = mount(<IntersectionObserver windowObj={fakeWindow} />);
  });

  it("should render an empty div", () => {
    assert.ok(wrapper.exists());
    assert.equal(wrapper.children().at(0).type(), "div");
  });

  it("should fire onIntersecting", () => {
    const onIntersecting = sinon.stub();
    wrapper = mount(
      <IntersectionObserver
        windowObj={fakeWindow}
        onIntersecting={onIntersecting}
      />
    );
    assert.calledOnce(onIntersecting);
  });
});
