import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { MIN_RICH_FAVICON_SIZE } from "content-src/components/TopSites/TopSitesConstants";
import {
  TOP_SITES_DEFAULT_ROWS,
  TOP_SITES_MAX_SITES_PER_ROW,
} from "common/Reducers.sys.mjs";
import { _TopSites as TopSites } from "content-src/components/TopSites/TopSites";
import React from "react";

const perfSvc = {
  mark() {},
  getMostRecentAbsMarkStartByName() {},
};

// Fresh props per test so mutating TopSites.rows (mirroring the legacy
// sandbox.stub(DEFAULT_PROPS.TopSites, "rows").value(rows)) stays isolated.
function getDefaultProps() {
  return {
    Prefs: { values: { featureConfig: {} } },
    TopSites: { initialized: true, rows: [] },
    App: {
      isForStartupCache: false,
    },
    TopSitesRows: TOP_SITES_DEFAULT_ROWS,
    TopSitesMaxSitesPerRow: TOP_SITES_MAX_SITES_PER_ROW,
    topSiteIconType: () => "no_image",
    dispatch: jest.fn(),
    perfSvc,
  };
}

// The legacy test shallow-rendered the unconnected _TopSites; RTL does a full
// mount, so its connected children need a redux Provider. A ref exposes the
// instance for the white-box #_dispatchTopSitesStats assertions.
function renderTopSites(props, ref) {
  return render(
    <WrapWithProvider>
      <TopSites {...props} ref={ref} />
    </WrapWithProvider>
  );
}

describe("<TopSites>", () => {
  beforeEach(() => {
    // jsdom does not implement matchMedia; default to the narrow layout.
    globalThis.matchMedia = () => ({ matches: false });
    // ComponentPerfTimer marks perf timestamps once it is actually mounted.
    Object.defineProperty(window.performance, "mark", {
      configurable: true,
      writable: true,
      value: () => {},
    });
  });

  it("should render a TopSites element", () => {
    const { container } = renderTopSites(getDefaultProps());
    expect(container.querySelector(".top-sites")).toBeInTheDocument();
  });
  describe("#_dispatchTopSitesStats", () => {
    let props;
    let ref;
    let instance;
    let dispatchStatsSpy;

    beforeEach(() => {
      props = getDefaultProps();
      ref = React.createRef();
      renderTopSites(props, ref);
      instance = ref.current;
      dispatchStatsSpy = jest.spyOn(instance, "_dispatchTopSitesStats");
      // The full mount already ran componentDidMount (one dispatch); clear it so
      // each test only observes what it triggers, matching the legacy
      // disableLifecycleMethods setup.
      props.dispatch.mockClear();
    });
    afterEach(() => {
      dispatchStatsSpy.mockRestore();
    });
    it("should call _dispatchTopSitesStats on componentDidMount", () => {
      instance.componentDidMount();

      expect(dispatchStatsSpy).toHaveBeenCalledTimes(1);
    });
    it("should call _dispatchTopSitesStats on componentDidUpdate", () => {
      instance.componentDidUpdate();

      expect(dispatchStatsSpy).toHaveBeenCalledTimes(1);
    });
    it("should dispatch SAVE_SESSION_PERF_DATA", () => {
      instance._dispatchTopSitesStats();

      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 0,
              tippytop: 0,
              rich_icon: 0,
              no_image: 0,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
    it("should correctly count TopSite images - just screenshot", () => {
      const rows = [{ screenshot: true }];
      props.TopSites.rows = rows;
      instance._dispatchTopSitesStats();

      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 1,
              tippytop: 0,
              rich_icon: 0,
              no_image: 0,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
    it("should correctly count TopSite images - custom_screenshot", () => {
      const rows = [{ customScreenshotURL: true }];
      props.TopSites.rows = rows;
      instance._dispatchTopSitesStats();

      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 1,
              screenshot: 0,
              tippytop: 0,
              rich_icon: 0,
              no_image: 0,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
    it("should correctly count TopSite images - rich_icon", () => {
      const rows = [{ faviconSize: MIN_RICH_FAVICON_SIZE }];
      props.TopSites.rows = rows;
      instance._dispatchTopSitesStats();

      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 0,
              tippytop: 0,
              rich_icon: 1,
              no_image: 0,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
    it("should correctly count TopSite images - tippytop", () => {
      const rows = [
        { tippyTopIcon: "foo" },
        { faviconRef: "tippytop" },
        { faviconRef: "foobar" },
      ];
      props.TopSites.rows = rows;
      instance._dispatchTopSitesStats();

      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 0,
              tippytop: 2,
              rich_icon: 0,
              no_image: 1,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
    it("should correctly count TopSite images - no image", () => {
      const rows = [{}];
      props.TopSites.rows = rows;
      instance._dispatchTopSitesStats();

      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 0,
              tippytop: 0,
              rich_icon: 0,
              no_image: 1,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
    it("should correctly count pinned Top Sites", () => {
      const rows = [
        { isPinned: true },
        { isPinned: false },
        { isPinned: true },
      ];
      props.TopSites.rows = rows;
      instance._dispatchTopSitesStats();

      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 0,
              tippytop: 0,
              rich_icon: 0,
              no_image: 3,
            },
            topsites_pinned: 2,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
    it("should correctly count search shortcut Top Sites", () => {
      const rows = [{ searchTopSite: true }, { searchTopSite: true }];
      props.TopSites.rows = rows;
      instance._dispatchTopSitesStats();

      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 0,
              tippytop: 0,
              rich_icon: 0,
              no_image: 2,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 2,
          },
        })
      );
    });
    it("should only count visible top sites on wide layout", () => {
      globalThis.matchMedia = () => ({ matches: true });
      const rows = [
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
        {},
        {},
        {},
        {},
        {},
        {},
      ];
      props.TopSites.rows = rows;

      instance._dispatchTopSitesStats();
      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 0,
              tippytop: 0,
              rich_icon: 0,
              no_image: 8,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
    it("should only count visible top sites on normal layout", () => {
      globalThis.matchMedia = () => ({ matches: false });
      const rows = [
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
        {},
        {},
        {},
        {},
        {},
        {},
      ];
      props.TopSites.rows = rows;
      instance._dispatchTopSitesStats();
      expect(props.dispatch).toHaveBeenCalledTimes(1);
      expect(props.dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            topsites_icon_stats: {
              custom_screenshot: 0,
              screenshot: 0,
              tippytop: 0,
              rich_icon: 0,
              no_image: 6,
            },
            topsites_pinned: 0,
            topsites_search_shortcuts: 0,
          },
        })
      );
    });
  });
});
