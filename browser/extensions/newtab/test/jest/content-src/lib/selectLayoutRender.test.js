/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { combineReducers, createStore } from "redux";
import { actionTypes as at } from "common/Actions.mjs";
import { reducers } from "common/Reducers.sys.mjs";
import { selectLayoutRender } from "content-src/lib/selectLayoutRender";
const FAKE_LAYOUT = [
  {
    width: 3,
    components: [
      { type: "foo", feed: { url: "foo.com" }, properties: { items: 2 } },
    ],
  },
];
const FAKE_FEEDS = {
  "foo.com": { data: { recommendations: [{ id: "foo" }, { id: "bar" }] } },
};

describe("selectLayoutRender", () => {
  let store;

  beforeEach(() => {
    store = createStore(combineReducers(reducers));
  });

  const SPONSORED_STORIES_PREFS = {
    showSponsored: true,
    "system.showSponsored": true,
  };

  it("should return an empty array given initial state", () => {
    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
      prefs: {},
      rollCache: [],
    });
    expect(layoutRender).toEqual([]);
  });

  it("should add .data property from feeds to each component in .layout", () => {
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: FAKE_LAYOUT },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: FAKE_FEEDS["foo.com"], url: "foo.com" },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    expect(layoutRender).toHaveLength(1);
    expect(layoutRender[0]).toHaveProperty("width", 3);
    expect(layoutRender[0].components[0]).toEqual({
      type: "foo",
      feed: { url: "foo.com" },
      properties: { items: 2 },
      data: {
        recommendations: [
          { id: "foo", pos: 0 },
          { id: "bar", pos: 1 },
        ],
        sections: [],
      },
    });
  });

  it("should return layout with placeholder data if feed doesn't have data", () => {
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: FAKE_LAYOUT },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    expect(layoutRender).toHaveLength(1);
    expect(layoutRender[0]).toHaveProperty("width", 3);
    expect(layoutRender[0].components[0].data.recommendations).toEqual([
      { placeholder: true },
      { placeholder: true },
    ]);
  });

  it("should return layout with empty spocs data if feed isn't defined but spocs is", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [{ type: "foo", spocs: { positions: [{ index: 2 }] } }],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    expect(layoutRender).toHaveLength(1);
    expect(layoutRender[0]).toHaveProperty("width", 3);
    expect(layoutRender[0].components[0].data.spocs).toEqual([]);
  });

  it("should return layout with spocs data if feed isn't defined but spocs is", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [{ type: "foo", spocs: { positions: [{ index: 0 }] } }],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });
    store.dispatch({
      type: at.DISCOVERY_STREAM_SPOCS_UPDATE,
      data: {
        lastUpdated: 0,
        spocs: {
          newtab_spocs: {
            items: [{ id: 1 }, { id: 2 }, { id: 3 }],
          },
        },
      },
    });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    expect(layoutRender).toHaveLength(1);
    expect(layoutRender[0]).toHaveProperty("width", 3);
    expect(layoutRender[0].components[0].data.spocs).toEqual([
      { id: 1, pos: 0 },
      { id: 2, pos: 1 },
      { id: 3, pos: 2 },
    ]);
  });

  it("should return layout with no spocs data if feed and spocs are unavailable", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [{ type: "foo", spocs: { positions: [{ index: 0 }] } }],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });
    store.dispatch({
      type: at.DISCOVERY_STREAM_SPOCS_UPDATE,
      data: {
        lastUpdated: 0,
        spocs: {
          spocs: {
            items: [],
          },
        },
      },
    });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    expect(layoutRender).toHaveLength(1);
    expect(layoutRender[0]).toHaveProperty("width", 3);
    expect(layoutRender[0].components[0].data.spocs.length).toBe(0);
  });

  it("should return feed data offset by layout set prop", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [
          { type: "foo", properties: { offset: 1 }, feed: { url: "foo.com" } },
        ],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: FAKE_FEEDS["foo.com"], url: "foo.com" },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    expect(layoutRender[0].components[0].data).toEqual({
      recommendations: [{ id: "bar" }],
      sections: [],
    });
  });

  it("should return spoc result when there are more positions than spocs", () => {
    const fakeSpocConfig = {
      positions: [{ index: 0 }, { index: 1 }, { index: 2 }],
    };
    const fakeLayout = [
      {
        width: 3,
        components: [
          { type: "foo", feed: { url: "foo.com" }, spocs: fakeSpocConfig },
        ],
      },
    ];
    const fakeSpocsData = {
      lastUpdated: 0,
      spocs: {
        newtab_spocs: { items: [{ id: "fooSpoc" }, { id: "barSpoc" }] },
      },
    };

    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: FAKE_FEEDS["foo.com"], url: "foo.com" },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });
    store.dispatch({
      type: at.DISCOVERY_STREAM_SPOCS_UPDATE,
      data: fakeSpocsData,
    });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
      prefs: SPONSORED_STORIES_PREFS,
    });

    expect(layoutRender).toHaveLength(1);
    expect(layoutRender[0].components[0].data.recommendations[0]).toEqual({
      id: "fooSpoc",
      is_ad_eligible_position: true,
    });
    expect(layoutRender[0].components[0].data.recommendations[1]).toEqual({
      id: "barSpoc",
      is_ad_eligible_position: true,
    });
    expect(layoutRender[0].components[0].data.recommendations[2]).toEqual({
      id: "foo",
      is_ad_eligible_position: true,
    });
    expect(layoutRender[0].components[0].data.recommendations[3]).toEqual({
      id: "bar",
    });
  });

  it("should return a layout with feeds of items length with positions", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [
          { type: "foo", properties: { items: 3 }, feed: { url: "foo.com" } },
        ],
      },
    ];
    const fakeRecommendations = [
      { name: "item1" },
      { name: "item2" },
      { name: "item3" },
      { name: "item4" },
    ];
    const fakeFeeds = {
      "foo.com": { data: { recommendations: fakeRecommendations } },
    };
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: fakeFeeds["foo.com"], url: "foo.com" },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    const { recommendations } = layoutRender[0].components[0].data;
    expect(recommendations.length).toBe(4);
    expect(recommendations[0].pos).toBe(0);
    expect(recommendations[1].pos).toBe(1);
    expect(recommendations[2].pos).toBe(2);
    expect(recommendations[3].pos).toBe(undefined);
  });

  it("should render everything if everything is ready", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [
          { type: "foo1" },
          { type: "foo2", properties: { items: 3 }, feed: { url: "foo2.com" } },
          { type: "foo3", properties: { items: 3 }, feed: { url: "foo3.com" } },
          { type: "foo4", properties: { items: 3 }, feed: { url: "foo4.com" } },
          { type: "foo5" },
        ],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: { data: { recommendations: [] } }, url: "foo2.com" },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: { data: { recommendations: [] } }, url: "foo3.com" },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: { data: { recommendations: [] } }, url: "foo4.com" },
    });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    expect(layoutRender[0].components[0].type).toBe("foo1");
    expect(layoutRender[0].components[1].type).toBe("foo2");
    expect(layoutRender[0].components[2].type).toBe("foo3");
    expect(layoutRender[0].components[3].type).toBe("foo4");
    expect(layoutRender[0].components[4].type).toBe("foo5");
  });

  it("should stop rendering feeds if we hit a not ready spoc", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [
          { type: "foo1" },
          { type: "foo2", properties: { items: 3 }, feed: { url: "foo2.com" } },
          {
            type: "foo3",
            properties: { items: 3 },
            feed: { url: "foo3.com" },
            spocs: { positions: [{ index: 0 }] },
          },
          { type: "foo4", properties: { items: 3 }, feed: { url: "foo4.com" } },
          { type: "foo5" },
        ],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: { data: { recommendations: [] } }, url: "foo2.com" },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: { data: { recommendations: [] } }, url: "foo3.com" },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: { data: { recommendations: [] } }, url: "foo4.com" },
    });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
    });

    expect(layoutRender[0].components[0].type).toBe("foo1");
    expect(layoutRender[0].components[1].type).toBe("foo2");
    expect(layoutRender[0].components[2].data.recommendations).toEqual([
      { placeholder: true },
      { placeholder: true },
      { placeholder: true },
    ]);
  });

  it("should not flag ad-eligible positions when sponsored stories are off", () => {
    const fakeSpocConfig = { positions: [{ index: 0 }] };
    const fakeLayout = [
      {
        width: 3,
        components: [
          { type: "foo", feed: { url: "foo.com" }, spocs: fakeSpocConfig },
        ],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: {
        feed: { data: { recommendations: [{ name: "rec" }] } },
        url: "foo.com",
      },
    });
    store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });
    store.dispatch({
      type: at.DISCOVERY_STREAM_SPOCS_UPDATE,
      data: { lastUpdated: 0, spocs: { newtab_spocs: { items: [] } } },
    });

    for (const prefs of [
      { showSponsored: false, "system.showSponsored": true },
      { showSponsored: true, "system.showSponsored": false },
    ]) {
      const { layoutRender } = selectLayoutRender({
        state: store.getState().DiscoveryStream,
        prefs,
      });
      expect(
        layoutRender[0].components[0].data.recommendations[0]
          .is_ad_eligible_position
      ).toBeUndefined();
    }
  });

  it("should not render a spoc if there are no available spocs", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [
          { type: "foo1" },
          { type: "foo2", properties: { items: 3 }, feed: { url: "foo2.com" } },
          {
            type: "foo3",
            properties: { items: 3 },
            feed: { url: "foo3.com" },
            spocs: { positions: [{ index: 0 }] },
          },
          { type: "foo4", properties: { items: 3 }, feed: { url: "foo4.com" } },
          { type: "foo5" },
        ],
      },
    ];
    const fakeSpocsData = { lastUpdated: 0, spocs: { spocs: [] } };
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: { data: { recommendations: [] } }, url: "foo2.com" },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: {
        feed: { data: { recommendations: [{ name: "rec" }] } },
        url: "foo3.com",
      },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: { feed: { data: { recommendations: [] } }, url: "foo4.com" },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_SPOCS_UPDATE,
      data: fakeSpocsData,
    });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
      prefs: SPONSORED_STORIES_PREFS,
    });

    expect(layoutRender[0].components[2].data.recommendations[0]).toEqual({
      name: "rec",
      pos: 0,
      is_ad_eligible_position: true,
    });
  });

  it("should not render a row if no components exist after filter in that row", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [{ type: "TopSites" }],
      },
      {
        width: 3,
        components: [{ type: "Message" }],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
      prefs: { "feeds.topsites": true },
    });

    expect(layoutRender[0].components[0].type).toBe("TopSites");
    expect(layoutRender[1]).toBe(undefined);
  });

  it("should not render a component if filtered", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [{ type: "Message" }, { type: "TopSites" }],
      },
    ];
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });

    const { layoutRender } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
      prefs: { "feeds.topsites": true },
    });

    expect(layoutRender[0].components[0].type).toBe("TopSites");
    expect(layoutRender[0].components[1]).toBe(undefined);
  });

  it("should skip rendering a spoc in position if that spoc is blocked for that session", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [
          {
            type: "foo1",
            properties: { items: 3 },
            feed: { url: "foo1.com" },
            spocs: { positions: [{ index: 0 }] },
          },
        ],
      },
    ];
    const fakeSpocsData = {
      lastUpdated: 0,
      spocs: {
        newtab_spocs: { items: [{ name: "spoc", url: "https://foo.com" }] },
      },
    };
    store.dispatch({
      type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
      data: { layout: fakeLayout },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_FEED_UPDATE,
      data: {
        feed: { data: { recommendations: [{ name: "rec" }] } },
        url: "foo1.com",
      },
    });
    store.dispatch({
      type: at.DISCOVERY_STREAM_SPOCS_UPDATE,
      data: fakeSpocsData,
    });

    const { layoutRender: layout1 } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
      prefs: SPONSORED_STORIES_PREFS,
    });

    store.dispatch({
      type: at.DISCOVERY_STREAM_SPOC_BLOCKED,
      data: { url: "https://foo.com" },
    });

    const { layoutRender: layout2 } = selectLayoutRender({
      state: store.getState().DiscoveryStream,
      prefs: SPONSORED_STORIES_PREFS,
    });

    expect(layout1[0].components[0].data.recommendations[0]).toEqual({
      name: "spoc",
      url: "https://foo.com",
      pos: 0,
      is_ad_eligible_position: true,
    });
    expect(layout2[0].components[0].data.recommendations[0]).toEqual({
      name: "rec",
      pos: 0,
      is_ad_eligible_position: true,
    });
  });

  it("should include Widgets when widgets.system.enabled is true", () => {
    const { layoutRender } = selectLayoutRender({
      prefs: {
        "widgets.system.enabled": true,
        "feeds.section.topstories": false,
        "feeds.system.topstories": false,
      },
      state: {
        layout: [
          {
            width: 12,
            components: [{ type: "Widgets" }],
          },
        ],
      },
    });

    expect(layoutRender).toHaveLength(1);
    expect(layoutRender[0].components).toHaveLength(1);
    expect(layoutRender[0].components[0]).toHaveProperty("type", "Widgets");
  });

  it("should include Widgets when (Nimbus) widgetsConfig.enabled is true", () => {
    const { layoutRender } = selectLayoutRender({
      prefs: {
        widgetsConfig: { enabled: true },
        "feeds.section.topstories": false,
        "feeds.system.topstories": false,
      },
      state: {
        layout: [
          {
            width: 12,
            components: [{ type: "Widgets" }],
          },
        ],
      },
    });

    expect(layoutRender).toHaveLength(1);
    expect(layoutRender[0].components).toHaveLength(1);
    expect(layoutRender[0].components[0]).toHaveProperty("type", "Widgets");
  });

  it("should filter out Widgets when both widget prefs are false", () => {
    const { layoutRender } = selectLayoutRender({
      prefs: {
        "widgets.system.enabled": false,
        widgetsConfig: { enabled: false },
        "feeds.section.topstories": false,
        "feeds.system.topstories": false,
      },
      state: {
        layout: [
          {
            width: 12,
            components: [{ type: "Widgets" }],
          },
        ],
      },
    });

    expect(layoutRender).toHaveLength(0);
  });

  describe("spoc injection based on allowAds", () => {
    const fakeLayout = [
      {
        width: 3,
        components: [{ type: "CardGrid", feed: { url: "foo.com" } }],
      },
    ];
    const fakeSectionLayout = {
      responsiveLayouts: [
        {
          columnCount: 1,
          tiles: [
            { position: 0, hasAd: true },
            { position: 1, hasAd: false },
          ],
        },
      ],
    };
    const fakeRecommendations = [
      { id: "rec1", section: "section-1", pos: 0 },
      { id: "rec2", section: "section-1", pos: 1 },
    ];
    const fakeSpocs = {
      lastUpdated: 0,
      spocs: {
        newtab_spocs: { items: [{ id: "spoc1", url: "https://spoc.com" }] },
      },
    };
    const fakePrefs = {
      "discoverystream.sections.enabled": true,
      "feeds.section.topstories": true,
      "feeds.system.topstories": true,
    };

    function setupStore(allowAds) {
      store.dispatch({
        type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
        data: { layout: fakeLayout },
      });
      store.dispatch({
        type: at.DISCOVERY_STREAM_FEED_UPDATE,
        data: {
          feed: {
            data: {
              recommendations: fakeRecommendations,
              sections: [
                {
                  sectionKey: "section-1",
                  allowAds,
                  receivedRank: 0,
                  layout: fakeSectionLayout,
                },
              ],
            },
          },
          url: "foo.com",
        },
      });
      store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });
      store.dispatch({
        type: at.DISCOVERY_STREAM_SPOCS_UPDATE,
        data: fakeSpocs,
      });
    }

    it("should not add spoc positions for sections with allowAds: false", () => {
      setupStore(false);

      const { layoutRender } = selectLayoutRender({
        state: store.getState().DiscoveryStream,
        prefs: fakePrefs,
      });

      const [renderedSection] = layoutRender[0].components[0].data.sections;
      expect(
        renderedSection.data.filter(item => item.id === "spoc1")
      ).toHaveLength(0);
    });

    it("should add spoc positions for sections with allowAds: true", () => {
      setupStore(true);

      const { layoutRender } = selectLayoutRender({
        state: store.getState().DiscoveryStream,
        prefs: fakePrefs,
      });

      const [renderedSection] = layoutRender[0].components[0].data.sections;
      expect(renderedSection.data.some(item => item.id === "spoc1")).toBe(true);
    });

    it("should add spoc positions for sections with allowAds: undefined", () => {
      setupStore(undefined);

      const { layoutRender } = selectLayoutRender({
        state: store.getState().DiscoveryStream,
        prefs: fakePrefs,
      });

      const [renderedSection] = layoutRender[0].components[0].data.sections;
      expect(renderedSection.data.some(item => item.id === "spoc1")).toBe(true);
    });
  });

  // @experiment(remove) { bug 2069496 }
  describe("widgets row ad", () => {
    // Everything isWidgetsAdActive gates on besides the variant itself.
    const WIDGETS_AD_PREFS = {
      ...SPONSORED_STORIES_PREFS,
      "nova.enabled": true,
      "pageLayouts.variant": "widgets-ad-large",
      "widgets.system.enabled": true,
      "widgets.enabled": true,
      "widgets.system.lists.enabled": true,
      "widgets.lists.enabled": true,
    };

    const renderWithSpocs = (prefs, items) => {
      const fakeLayout = [
        {
          width: 3,
          components: [
            {
              type: "foo",
              feed: { url: "foo.com" },
              spocs: { positions: [{ index: 0 }, { index: 1 }] },
            },
          ],
        },
      ];
      store.dispatch({
        type: at.DISCOVERY_STREAM_LAYOUT_UPDATE,
        data: { layout: fakeLayout },
      });
      store.dispatch({
        type: at.DISCOVERY_STREAM_FEED_UPDATE,
        data: { feed: FAKE_FEEDS["foo.com"], url: "foo.com" },
      });
      store.dispatch({ type: at.DISCOVERY_STREAM_FEEDS_UPDATE });
      store.dispatch({
        type: at.DISCOVERY_STREAM_SPOCS_UPDATE,
        data: { lastUpdated: 0, spocs: { newtab_spocs: { items } } },
      });
      const { layoutRender } = selectLayoutRender({
        state: store.getState().DiscoveryStream,
        prefs,
      });
      return layoutRender[0].components[0].data.recommendations.map(
        rec => rec.id
      );
    };

    const items = [
      { id: "rowAd", url: "https://example.com/a" },
      { id: "second", url: "https://example.com/b" },
      { id: "third", url: "https://example.com/c" },
    ];

    it("fills story positions from the top of the set outside the variant", () => {
      const ids = renderWithSpocs(SPONSORED_STORIES_PREFS, items);
      expect(ids[0]).toBe("rowAd");
      expect(ids[1]).toBe("second");
    });

    // The row takes the first ad, so the story positions shift up one.
    it("skips the ad the row took and shifts the rest forward", () => {
      const ids = renderWithSpocs(WIDGETS_AD_PREFS, items);
      expect(ids).not.toContain("rowAd");
      expect(ids[0]).toBe("second");
      expect(ids[1]).toBe("third");
    });

    it("removes it exactly once when two ads share a url", () => {
      const dupes = [
        { id: "rowAd", url: "https://example.com/a" },
        { id: "dupe", url: "https://example.com/a" },
        { id: "third", url: "https://example.com/c" },
      ];
      const ids = renderWithSpocs(WIDGETS_AD_PREFS, dupes);
      expect(ids).toContain("dupe");
      expect(ids[0]).toBe("dupe");
    });
  });
});
