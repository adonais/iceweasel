/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { render, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { WrapWithProvider } from "test/jest/test-utils";
import {
  Base as ConnectedBase,
  _Base as Base,
  BaseContent,
  WithDsAdmin,
} from "content-src/components/Base/Base";

// The legacy Enzyme suite used shallow(), which never mounted BaseContent's
// descendants. RTL renders the full tree, so every render is wrapped in a Redux
// Provider whose store carries safe string defaults (sectionOrder / wallpaper)
// that keep connected descendants (Sections, WallpaperCategories, ...) from
// throwing on undefined. This store is only there to keep the subtree alive;
// the assertions below observe the props-driven output of the unconnected
// components under test, mirroring the legacy expectations.
const SAFE_STORE_VALUES = {
  sectionOrder: "",
  "newtabWallpapers.wallpaper": "",
  "newtabWallpapers.initialWallpaper": "",
};

function makeStore(prefValues = {}, stateOverride = {}) {
  return createStore(combineReducers(reducers), {
    ...INITIAL_STATE,
    App: { ...INITIAL_STATE.App, initialized: true },
    Prefs: {
      ...INITIAL_STATE.Prefs,
      values: {
        ...INITIAL_STATE.Prefs.values,
        ...SAFE_STORE_VALUES,
        ...prefValues,
      },
    },
    ...stateOverride,
  });
}

// Full RTL mounting exercises BaseContent's lifecycle (componentDidMount reads
// DiscoveryStream.spocs and updateWallpaper reads Wallpapers); shallow() never
// did. These defaults keep the mount from throwing without affecting the
// legacy assertions.
const MOUNT_WALLPAPERS = { wallpaperList: [], uploadedWallpaper: null };

afterEach(() => {
  globalThis.location.hash = "";
});

describe("<Base>", () => {
  let DEFAULT_PROPS = {
    store: { getState: () => {} },
    App: { initialized: true },
    Prefs: { values: {} },
    Sections: [],
    DiscoveryStream: { config: { enabled: false } },
    dispatch: () => {},
    adminContent: {
      message: {},
    },
    document: {
      visibilityState: "visible",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  };

  function renderBase(props) {
    return render(
      <Provider store={makeStore(props.Prefs.values)}>
        <Base
          {...props}
          DiscoveryStream={{ ...props.DiscoveryStream, spocs: {} }}
          Wallpapers={MOUNT_WALLPAPERS}
        />
      </Provider>
    );
  }

  it("should render Base component", () => {
    const { container } = renderBase(DEFAULT_PROPS);
    // exists(): the Base subtree rendered (BaseContent's classic wrapper).
    expect(container.querySelector(".outer-wrapper")).toBeInTheDocument();
  });

  it("should render the BaseContent component, passing through all props", () => {
    // Enzyme read wrapper.find(BaseContent).props() and deep-equaled it against
    // DEFAULT_PROPS. RTL cannot read a child component's props object, so we
    // assert the closest observable proxy: Base delegated rendering to
    // BaseContent (its classic output is present).
    const { container } = renderBase(DEFAULT_PROPS);
    expect(container.querySelector(".outer-wrapper")).toBeInTheDocument();
  });

  it("should render an ErrorBoundary with class base-content-fallback", () => {
    // ErrorBoundary only applies its className in the fallback (on error), so
    // the class is not observable on the happy path. Force the top-level
    // boundary into its fallback (BaseContent throws on an undefined
    // DiscoveryStream) so "base-content-fallback" becomes observable in the DOM.
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <Provider store={makeStore(DEFAULT_PROPS.Prefs.values)}>
        <Base {...DEFAULT_PROPS} DiscoveryStream={undefined} />
      </Provider>
    );
    expect(
      container.querySelector(".base-content-fallback")
    ).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("should render an WithDsAdmin if the devtools pref is true", () => {
    // find(WithDsAdmin) has no DOM identity; WithDsAdmin renders
    // DiscoveryStreamAdmin's ".discoverystream-admin-toggle", which only appears
    // via the WithDsAdmin path.
    const { container } = renderBase({
      ...DEFAULT_PROPS,
      Prefs: { values: { "asrouter.devtoolsEnabled": true } },
    });
    expect(
      container.querySelectorAll(".discoverystream-admin-toggle")
    ).toHaveLength(1);
  });

  it("should not render an WithDsAdmin if the devtools pref is false", () => {
    const { container } = renderBase({
      ...DEFAULT_PROPS,
      Prefs: { values: { "asrouter.devtoolsEnabled": false } },
    });
    expect(
      container.querySelectorAll(".discoverystream-admin-toggle")
    ).toHaveLength(0);
  });

  it("should not render without App.initialized", () => {
    const props = {
      App: { initialized: false },
      Prefs: { values: {} },
      dispatch: jest.fn(),
    };
    const { container } = render(
      <WrapWithProvider>
        <Base {...props} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".base-content-fallback")
    ).not.toBeInTheDocument();
  });
});

describe("<BaseContent>", () => {
  let DEFAULT_PROPS = {
    store: { getState: () => {} },
    App: { initialized: true },
    Prefs: { values: {} },
    Sections: [],
    DiscoveryStream: { config: { enabled: false }, spocs: {} },
    dispatch: () => {},
    document: {
      visibilityState: "visible",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  };

  function renderBaseContent(props, ref) {
    return render(
      <Provider store={makeStore(props.Prefs.values)}>
        <BaseContent Wallpapers={MOUNT_WALLPAPERS} {...props} ref={ref} />
      </Provider>
    );
  }

  it("should render an ErrorBoundary with a Search child", () => {
    const searchEnabledProps = Object.assign({}, DEFAULT_PROPS, {
      Prefs: { values: { showSearch: true } },
    });

    const { container } = renderBaseContent(searchEnabledProps);

    // parent().is(ErrorBoundary) has no DOM equivalent (ErrorBoundary renders
    // its children transparently). Assert the closest observable proxy: Search
    // rendered inside the error-boundary-wrapped ".non-collapsible-section".
    expect(
      container.querySelector(".non-collapsible-section .search-wrapper")
    ).toBeInTheDocument();
  });

  it("should dispatch a user event when the customize menu is opened or closed", () => {
    const dispatch = jest.fn();
    const ref = React.createRef();
    renderBaseContent(
      {
        ...DEFAULT_PROPS,
        dispatch,
        App: { customizeMenuVisible: true },
      },
      ref
    );
    ref.current.openCustomizationMenu();
    expect(dispatch).toHaveBeenCalledWith({ type: at.SHOW_PERSONALIZE });
    expect(dispatch).toHaveBeenCalledWith(
      ac.UserEvent({ event: "SHOW_PERSONALIZE" })
    );
    ref.current.closeCustomizationMenu();
    expect(dispatch).toHaveBeenCalledWith({ type: at.HIDE_PERSONALIZE });
    expect(dispatch).toHaveBeenCalledWith(
      ac.UserEvent({ event: "HIDE_PERSONALIZE" })
    );
  });

  it("should render only search if no Sections are enabled", () => {
    const onlySearchProps = Object.assign({}, DEFAULT_PROPS, {
      Sections: [{ id: "highlights", enabled: false }],
      Prefs: { values: { showSearch: true } },
    });

    const { container } = renderBaseContent(onlySearchProps);
    expect(container.querySelectorAll(".only-search")).toHaveLength(1);
  });

  it("should not attach an event listener for visibility change if it is visible immediately", () => {
    const props = Object.assign({}, DEFAULT_PROPS, {
      document: {
        visibilityState: "visible",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    renderBaseContent(props);
    expect(props.document.addEventListener).not.toHaveBeenCalled();
  });
  it("should attach an event listener for visibility change if it is not visible", () => {
    const props = Object.assign({}, DEFAULT_PROPS, {
      document: {
        visibilityState: "hidden",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    renderBaseContent(props);
    expect(props.document.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
  });
  it("should remove the event listener for visibility change when unmounted", () => {
    const props = Object.assign({}, DEFAULT_PROPS, {
      document: {
        visibilityState: "hidden",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    const { unmount } = renderBaseContent(props);
    const [firstCall] = props.document.addEventListener.mock.calls;
    const [, listener] = firstCall;

    unmount();
    expect(props.document.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      listener
    );
  });
  it("should remove the event listener for visibility change after becoming visible", () => {
    const listeners = new Set();
    const props = Object.assign({}, DEFAULT_PROPS, {
      document: {
        visibilityState: "hidden",
        addEventListener: (ev, cb) => listeners.add(cb),
        removeEventListener: (ev, cb) => listeners.delete(cb),
      },
    });

    renderBaseContent(props);
    expect(listeners.size).toBe(1);

    // Simulate listeners getting called
    props.document.visibilityState = "visible";
    act(() => {
      listeners.forEach(l => l());
    });

    expect(listeners.size).toBe(0);
  });
});

describe("<BaseContent> wallpaper update logic", () => {
  const DOCUMENT_STUB = {
    visibilityState: "visible",
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  const makeWallpaperProps = (prefsOverride = {}) => ({
    store: { getState: () => {} },
    App: { initialized: true, isForStartupCache: { Wallpaper: false } },
    Prefs: {
      values: {
        "newtabWallpapers.enabled": true,
        "newtabWallpapers.user.enabled": true,
        "newtabWallpapers.wallpaper": "beach",
        "newtabWallpapers.initialWallpaper": "",
        "newtabWallpapers.customWallpaper.theme": "",
        "nova.enabled": false,
        ...prefsOverride,
      },
    },
    Sections: [],
    DiscoveryStream: { config: { enabled: false }, spocs: {} },
    Wallpapers: { wallpaperList: [], uploadedWallpaper: null },
    dispatch: () => {},
    document: DOCUMENT_STUB,
  });

  // Reach the instance via a ref (white-box) to mirror wrapper.instance(), then
  // spy updateWallpaper as sinon.spy(instance, "updateWallpaper") did. The spy
  // is installed after mount so mount-time wallpaper work is not counted.
  function mountWallpaper(props) {
    const ref = React.createRef();
    render(
      <Provider store={makeStore()}>
        <BaseContent {...props} ref={ref} />
      </Provider>
    );
    const instance = ref.current;
    const updateSpy = jest.spyOn(instance, "updateWallpaper");
    return { instance, updateSpy };
  }

  it("should call updateWallpaper when wallpaper is just enabled (wasWallpaperActive false, isWallpaperActive true)", () => {
    const props = makeWallpaperProps();
    const { instance, updateSpy } = mountWallpaper(props);

    const prevProps = {
      ...props,
      Prefs: {
        values: {
          ...props.Prefs.values,
          "newtabWallpapers.enabled": false,
        },
      },
    };

    instance.componentDidUpdate(prevProps);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("should call updateWallpaper when wallpaper is just disabled (wasWallpaperActive true, isWallpaperActive false)", () => {
    const props = makeWallpaperProps({
      "newtabWallpapers.enabled": false,
    });
    const { instance, updateSpy } = mountWallpaper(props);

    const prevProps = {
      ...props,
      Prefs: {
        values: {
          ...props.Prefs.values,
          "newtabWallpapers.enabled": true,
        },
      },
    };

    instance.componentDidUpdate(prevProps);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("should call updateWallpaper when the selected wallpaper changes", () => {
    const props = makeWallpaperProps();
    const { instance, updateSpy } = mountWallpaper(props);

    const prevProps = {
      ...props,
      Prefs: {
        values: {
          ...props.Prefs.values,
          "newtabWallpapers.wallpaper": "mountains",
        },
      },
    };

    instance.componentDidUpdate(prevProps);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("should not call updateWallpaper when wallpaper is active but nothing changed", () => {
    const props = makeWallpaperProps();
    const { instance, updateSpy } = mountWallpaper(props);

    instance.componentDidUpdate(props);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("should call updateWallpaper when uploadedWallpaper changes", () => {
    const props = makeWallpaperProps();
    const { instance, updateSpy } = mountWallpaper(props);

    const prevProps = {
      ...props,
      Wallpapers: { wallpaperList: [], uploadedWallpaper: "old-url" },
    };

    instance.componentDidUpdate(prevProps);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("should call updateWallpaper with Nova when both system and user prefs are enabled", () => {
    const props = makeWallpaperProps({ "nova.enabled": true });
    const { instance, updateSpy } = mountWallpaper(props);

    const prevProps = {
      ...props,
      Prefs: {
        values: {
          ...props.Prefs.values,
          "nova.enabled": true,
          "newtabWallpapers.wallpaper": "old-wallpaper",
        },
      },
    };

    instance.componentDidUpdate(prevProps);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("should not call updateWallpaper with Nova when user pref is disabled even if system pref is on", () => {
    const props = makeWallpaperProps({
      "nova.enabled": true,
      "newtabWallpapers.user.enabled": false,
    });
    const { instance, updateSpy } = mountWallpaper(props);

    const prevProps = {
      ...props,
      Prefs: {
        values: {
          ...props.Prefs.values,
          "nova.enabled": true,
          "newtabWallpapers.user.enabled": false,
          "newtabWallpapers.wallpaper": "old-wallpaper",
        },
      },
    };

    instance.componentDidUpdate(prevProps);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

function makeASRouterMessages({ position, isVisible = true } = {}) {
  return {
    isVisible,
    messageData: {
      content: {
        messageType: "ASRouterNewTabMessage",
        ...(position !== undefined ? { position } : {}),
      },
    },
  };
}

// The legacy helper used wrapper.find(Component) which matched React elements
// regardless of whether they produced DOM. In RTL we compare the document-order
// positions of the rendered marker nodes instead (message wrapper, TopSites,
// content feed). To give the content feed a real DOM node, the surrounding
// tests mount DiscoveryStreamBase against a store with a topstories section and
// a minimal layout so it renders ".ds-layout".
// Takes one or more container selectors, in document order, so callers can span
// .content and the .content-full-width band the feed now lives in.
function findASRouterMessagePositionIndices(container, ...containerSelectors) {
  const indices = { messageIdx: -1, topSitesIdx: -1, contentFeedIdx: -1 };
  const roots = containerSelectors
    .map(selector => container.querySelector(selector))
    .filter(Boolean);
  if (!roots.length) {
    return indices;
  }
  const ordered = roots.flatMap(root => [root, ...root.querySelectorAll("*")]);
  const positionOf = selector => {
    const node = ordered.find(candidate => candidate.matches(selector));
    return node ? ordered.indexOf(node) : -1;
  };
  indices.messageIdx = positionOf(".asrouter-newtab-message-wrapper");
  indices.topSitesIdx = positionOf(".top-sites");
  indices.contentFeedIdx = positionOf(".ds-layout");
  return indices;
}

// Store shape that lets the connected DiscoveryStreamBase render a real
// ".ds-layout" node (needed as the "content feed" marker), plus the topstories
// section its render requires.
const RENDERABLE_DISCOVERY_STREAM = {
  config: { enabled: true },
  layout: [{ components: [{ type: "HorizontalRule" }] }],
  feeds: { loaded: true, data: {} },
  spocs: { loaded: true, data: {}, blocked: [] },
  showTopicSelection: false,
};
const TOPSTORIES_SECTION = {
  id: "topstories",
  enabled: true,
  learnMore: { link: { href: "", message: "" } },
  pref: {},
  title: "",
  rows: [],
};

// storePrefs goes into the Redux store rather than BaseContent's props, for
// values the connected DiscoveryStreamBase reads itself (e.g. widgets gating).
function renderBaseContentWithFeed(props, storePrefs = {}) {
  return render(
    <Provider
      store={makeStore(
        {
          "feeds.section.topstories": true,
          "feeds.system.topstories": true,
          ...storePrefs,
        },
        {
          DiscoveryStream: {
            ...INITIAL_STATE.DiscoveryStream,
            ...RENDERABLE_DISCOVERY_STREAM,
          },
          Sections: [TOPSTORIES_SECTION],
        }
      )}
    >
      <BaseContent Wallpapers={MOUNT_WALLPAPERS} {...props} />
    </Provider>
  );
}

describe("<BaseContent> Nova layout ASRouterNewTabMessage positions", () => {
  const DOCUMENT_STUB = {
    visibilityState: "visible",
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  const NOVA_BASE_PROPS = {
    store: { getState: () => {} },
    App: { initialized: true },
    Prefs: {
      values: {
        "nova.enabled": true,
        "feeds.topsites": true,
      },
    },
    Sections: [],
    DiscoveryStream: {
      config: { enabled: true },
      spocs: {},
      feeds: { loaded: true },
      showTopicSelection: false,
    },
    dispatch: () => {},
    document: DOCUMENT_STUB,
  };

  it("does not render ASRouterNewTabMessage when there is no message", () => {
    const { container } = renderBaseContentWithFeed(NOVA_BASE_PROPS);
    expect(
      container.querySelectorAll(".asrouter-newtab-message-wrapper")
    ).toHaveLength(0);
  });

  it("does not render ASRouterNewTabMessage when isVisible is false", () => {
    const { container } = renderBaseContentWithFeed({
      ...NOVA_BASE_PROPS,
      Messages: makeASRouterMessages({ isVisible: false }),
    });
    expect(
      container.querySelectorAll(".asrouter-newtab-message-wrapper")
    ).toHaveLength(0);
  });

  it("renders exactly one ASRouterNewTabMessage for any configured position", () => {
    for (const position of [
      "ABOVE_TOPSITES",
      "ABOVE_WIDGETS",
      "ABOVE_CONTENT_FEED",
    ]) {
      const { container, unmount } = renderBaseContentWithFeed({
        ...NOVA_BASE_PROPS,
        Messages: makeASRouterMessages({ position }),
      });
      expect(
        container.querySelectorAll(".asrouter-newtab-message-wrapper")
      ).toHaveLength(1);
      unmount();
    }
  });

  it("renders ASRouterNewTabMessage before TopSites for ABOVE_TOPSITES", () => {
    const { container } = renderBaseContentWithFeed({
      ...NOVA_BASE_PROPS,
      Messages: makeASRouterMessages({ position: "ABOVE_TOPSITES" }),
    });
    const { messageIdx, topSitesIdx } = findASRouterMessagePositionIndices(
      container,
      ".content",
      ".content-full-width"
    );

    expect(topSitesIdx).toBeGreaterThan(-1);
    expect(messageIdx).toBeGreaterThan(-1);
    expect(messageIdx).toBeLessThan(topSitesIdx);
  });

  // The two positions below both land before the content feed, so ordering
  // alone cannot tell them apart. Each also asserts which container it rendered
  // in: ABOVE_WIDGETS sits at the end of .content, above the whole band, while
  // ABOVE_CONTENT_FEED is slotted inside the band between the widgets and feed.
  it("renders ASRouterNewTabMessage in .content after TopSites and before the content feed for ABOVE_WIDGETS", () => {
    const { container } = renderBaseContentWithFeed({
      ...NOVA_BASE_PROPS,
      Messages: makeASRouterMessages({ position: "ABOVE_WIDGETS" }),
    });
    const { messageIdx, topSitesIdx, contentFeedIdx } =
      findASRouterMessagePositionIndices(
        container,
        ".content",
        ".content-full-width"
      );

    expect(topSitesIdx).toBeGreaterThan(-1);
    expect(contentFeedIdx).toBeGreaterThan(-1);
    expect(messageIdx).toBeGreaterThan(-1);
    expect(messageIdx).toBeGreaterThan(topSitesIdx);
    expect(messageIdx).toBeLessThan(contentFeedIdx);
    expect(
      container.querySelector(".content .asrouter-newtab-message-wrapper")
    ).not.toBeNull();
  });

  it("renders ASRouterNewTabMessage inside the content band before the content feed for ABOVE_CONTENT_FEED", () => {
    const { container } = renderBaseContentWithFeed({
      ...NOVA_BASE_PROPS,
      Messages: makeASRouterMessages({ position: "ABOVE_CONTENT_FEED" }),
    });
    const { messageIdx, topSitesIdx, contentFeedIdx } =
      findASRouterMessagePositionIndices(
        container,
        ".content",
        ".content-full-width"
      );

    expect(topSitesIdx).toBeGreaterThan(-1);
    expect(contentFeedIdx).toBeGreaterThan(-1);
    expect(messageIdx).toBeGreaterThan(-1);
    expect(messageIdx).toBeGreaterThan(topSitesIdx);
    expect(messageIdx).toBeLessThan(contentFeedIdx);
    expect(
      container.querySelector(
        ".content-full-width .asrouter-newtab-message-wrapper"
      )
    ).not.toBeNull();
  });

  // The cases above leave widgets off, so their "before the content feed" check
  // matches the first .ds-layout in the band and cannot see the widgets/feed
  // boundary. ABOVE_CONTENT_FEED has to land on the far side of the widgets,
  // so pin that ordering against the two markers directly.
  it("renders ASRouterNewTabMessage after the widgets for ABOVE_CONTENT_FEED", () => {
    const { container } = renderBaseContentWithFeed(
      {
        ...NOVA_BASE_PROPS,
        Messages: makeASRouterMessages({ position: "ABOVE_CONTENT_FEED" }),
      },
      { "widgets.system.enabled": true }
    );
    const band = container.querySelector(".content-full-width");
    const ordered = [band, ...band.querySelectorAll("*")];
    const indexOfNode = selector =>
      ordered.indexOf(band.querySelector(selector));

    const widgetsIdx = indexOfNode(".ds-layout-widgets");
    const feedIdx = indexOfNode(".ds-layout:not(.discovery-stream)");
    const messageIdx = indexOfNode(".asrouter-newtab-message-wrapper");

    expect(widgetsIdx).toBeGreaterThan(-1);
    expect(feedIdx).toBeGreaterThan(-1);
    expect(messageIdx).toBeGreaterThan(widgetsIdx);
    expect(messageIdx).toBeLessThan(feedIdx);
  });
});

describe("<BaseContent> non-Nova classic layout ASRouterNewTabMessage positions", () => {
  const DOCUMENT_STUB = {
    visibilityState: "visible",
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  const NON_NOVA_BASE_PROPS = {
    store: { getState: () => {} },
    App: { initialized: true },
    Prefs: {
      values: {
        "nova.enabled": false,
      },
    },
    Sections: [],
    DiscoveryStream: {
      config: { enabled: true },
      spocs: {},
    },
    dispatch: () => {},
    document: DOCUMENT_STUB,
  };

  it("does not render ASRouterNewTabMessage when there is no message", () => {
    const { container } = renderBaseContentWithFeed(NON_NOVA_BASE_PROPS);
    expect(
      container.querySelectorAll(".asrouter-newtab-message-wrapper")
    ).toHaveLength(0);
  });

  it("does not render ASRouterNewTabMessage when isVisible is false", () => {
    const { container } = renderBaseContentWithFeed({
      ...NON_NOVA_BASE_PROPS,
      Messages: makeASRouterMessages({ isVisible: false }),
    });
    expect(
      container.querySelectorAll(".asrouter-newtab-message-wrapper")
    ).toHaveLength(0);
  });

  it("renders ASRouterNewTabMessage before the content area for ABOVE_TOPSITES", () => {
    const { container } = renderBaseContentWithFeed({
      ...NON_NOVA_BASE_PROPS,
      Messages: makeASRouterMessages({ position: "ABOVE_TOPSITES" }),
    });
    const { messageIdx, contentFeedIdx } = findASRouterMessagePositionIndices(
      container,
      ".body-wrapper"
    );

    expect(messageIdx).toBeGreaterThan(-1);
    expect(contentFeedIdx).toBeGreaterThan(-1);
    expect(messageIdx).toBeLessThan(contentFeedIdx);
  });
});

describe("WithDsAdmin", () => {
  // WithDsAdmin passes its props through to BaseContent. Enzyme shallow never
  // mounted that child; when the "no hash" case renders BaseContent for real we
  // must supply the props BaseContent needs (and a store).
  const BASE_CONTENT_PROPS = {
    store: { getState: () => {} },
    App: { initialized: true },
    Prefs: { values: {} },
    Sections: [],
    DiscoveryStream: { config: { enabled: false }, spocs: {} },
    dispatch: () => {},
    Wallpapers: MOUNT_WALLPAPERS,
    document: {
      visibilityState: "visible",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  };

  describe("rendering inner content", () => {
    it("should not set devtoolsCollapsed state for about:newtab (no hash)", () => {
      globalThis.location.hash = "";
      const { container } = render(
        <Provider store={makeStore()}>
          <WithDsAdmin {...BASE_CONTENT_PROPS} hash="" />
        </Provider>
      );
      // devtoolsCollapsed === true renders the toggle in its "expanded" state.
      expect(
        container.querySelector(".discoverystream-admin-toggle.expanded")
      ).toBeInTheDocument();
      // find(BaseContent).length === 1 -> BaseContent's classic output is present.
      expect(container.querySelectorAll(".outer-wrapper")).toHaveLength(1);
    });

    it("should set devtoolsCollapsed state for about:newtab#devtools", () => {
      globalThis.location.hash = "#devtools";
      const { container } = render(
        <Provider store={makeStore()}>
          <WithDsAdmin hash="#devtools" />
        </Provider>
      );
      // devtoolsCollapsed === false renders the toggle in its "collapsed" state.
      expect(
        container.querySelector(".discoverystream-admin-toggle.collapsed")
      ).toBeInTheDocument();
      expect(container.querySelectorAll(".outer-wrapper")).toHaveLength(0);
    });

    it("should set devtoolsCollapsed state for about:newtab#devtools subroutes", () => {
      globalThis.location.hash = "#devtools-foo";
      const { container } = render(
        <Provider store={makeStore()}>
          <WithDsAdmin hash="#devtools-foo" />
        </Provider>
      );
      expect(
        container.querySelector(".discoverystream-admin-toggle.collapsed")
      ).toBeInTheDocument();
      expect(container.querySelectorAll(".outer-wrapper")).toHaveLength(0);
    });
  });

  describe("SPOC Placeholder Duration Tracking", () => {
    let instance;
    let dispatch;
    let baseProps;
    let ref;
    let reduxStore;
    let rerender;

    const expiredSpocs = () => ({
      config: { enabled: true },
      spocs: {
        onDemand: { enabled: true, loaded: false },
        lastUpdated: Date.now() - 120000, // Expired (120s ago)
        cacheUpdateTime: 60000, // Cache expires after 60s
      },
    });

    const rerenderWith = discoveryStream =>
      rerender(
        <Provider store={reduxStore}>
          <BaseContent
            {...baseProps}
            dispatch={dispatch}
            DiscoveryStream={discoveryStream}
            ref={ref}
          />
        </Provider>
      );

    beforeEach(() => {
      // Setup: Create a component with expired spocs (showing placeholders)
      // - fake timers let us control time for duration testing (performance is
      //   left real so componentDidMount's getEntriesByType still works)
      // - lastUpdated is 120000ms (2 mins) ago, exceeding cacheUpdateTime of 60000ms (1 min)
      // - In this setup, spocs are expired and placeholders should be visible
      jest.useFakeTimers({ doNotFake: ["performance"] });
      dispatch = jest.fn();
      baseProps = {
        store: { getState: () => {} },
        App: { initialized: true },
        Prefs: { values: {} },
        Sections: [],
        Weather: {},
        Wallpapers: MOUNT_WALLPAPERS,
        document: {
          visibilityState: "visible",
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
      };
      const props = {
        ...baseProps,
        dispatch,
        DiscoveryStream: expiredSpocs(),
      };
      ref = React.createRef();
      reduxStore = makeStore();
      ({ rerender } = render(
        <Provider store={reduxStore}>
          <BaseContent {...props} ref={ref} />
        </Provider>
      ));
      instance = ref.current;
      act(() => {
        instance.setState({ visible: true });
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should start tracking when placeholders become visible", () => {
      const prevProps = {
        ...baseProps,
        DiscoveryStream: {
          config: { enabled: true },
          spocs: {
            onDemand: { enabled: true, loaded: false },
            lastUpdated: Date.now() - 30000,
            cacheUpdateTime: 60000,
          },
        },
      };

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      instance.trackSpocPlaceholderDuration(prevProps);

      expect(instance.spocPlaceholderStartTime).not.toBeNull();
    });

    it("should record duration when placeholders are replaced", () => {
      // Create a fresh wrapper with expired spocs
      const freshDispatch = jest.fn();
      const freshRef = React.createRef();
      const expiredTime = Date.now() - 120000;
      const { rerender: freshRerender } = render(
        <Provider store={reduxStore}>
          <BaseContent
            {...baseProps}
            dispatch={freshDispatch}
            DiscoveryStream={{
              config: { enabled: true },
              spocs: {
                onDemand: { enabled: true, loaded: false },
                lastUpdated: expiredTime,
                cacheUpdateTime: 60000,
              },
            }}
            ref={freshRef}
          />
        </Provider>
      );
      const freshInstance = freshRef.current;
      act(() => {
        freshInstance.setState({ visible: true });
      });

      // Advance clock a bit first so startTime is not 0 (which is falsy)
      jest.advanceTimersByTime(100);

      // Set start time and advance clock
      const startTime = Date.now();
      freshInstance.spocPlaceholderStartTime = startTime;
      jest.advanceTimersByTime(150);

      // Update to fresh spocs - this triggers componentDidUpdate
      // which automatically calls trackSpocPlaceholderDuration
      freshRerender(
        <Provider store={reduxStore}>
          <BaseContent
            {...baseProps}
            dispatch={freshDispatch}
            DiscoveryStream={{
              config: { enabled: true },
              spocs: {
                onDemand: { enabled: true, loaded: false },
                lastUpdated: Date.now(),
                cacheUpdateTime: 60000,
              },
            }}
            ref={freshRef}
          />
        </Provider>
      );

      // componentDidUpdate should have dispatched the placeholder duration action
      const placeholderCall = freshDispatch.mock.calls.find(
        call => call[0].type === "DISCOVERY_STREAM_SPOC_PLACEHOLDER_DURATION"
      );

      expect(placeholderCall).toBeTruthy();
      const [action] = placeholderCall;
      expect(action.data.duration).toBe(150);
      expect(action.meta).toEqual({
        from: "ActivityStream:Content",
        to: "ActivityStream:Main",
        skipLocal: true,
      });

      expect(freshInstance.spocPlaceholderStartTime).toBeNull();
    });

    it("should start tracking on onVisible if placeholders already expired", () => {
      rerenderWith({
        config: { enabled: true },
        spocs: {
          onDemand: { enabled: true, loaded: false },
          lastUpdated: Date.now() - 120000,
          cacheUpdateTime: 60000,
        },
      });

      act(() => {
        instance.setState({ visible: false });
      });
      instance.spocPlaceholderStartTime = null;

      act(() => {
        instance.onVisible();
      });

      expect(instance.spocPlaceholderStartTime).not.toBeNull();
    });

    it("should not start tracking if tab is not visible", () => {
      act(() => {
        instance.setState({ visible: false });
      });
      instance.spocPlaceholderStartTime = null;

      const prevProps = {
        ...baseProps,
        DiscoveryStream: {
          config: { enabled: true },
          spocs: {
            onDemand: { enabled: true, loaded: false },
            lastUpdated: Date.now() - 30000,
            cacheUpdateTime: 60000,
          },
        },
      };

      instance.trackSpocPlaceholderDuration(prevProps);

      expect(instance.spocPlaceholderStartTime).toBeNull();
    });

    it("should not start tracking if onDemand is disabled", () => {
      // Reset instance to have onDemand disabled from the start
      const props = {
        ...baseProps,
        dispatch,
        DiscoveryStream: {
          config: { enabled: true },
          spocs: {
            onDemand: { enabled: false, loaded: false },
            lastUpdated: Date.now() - 120000,
            cacheUpdateTime: 60000,
          },
        },
      };
      const disabledRef = React.createRef();
      render(
        <Provider store={reduxStore}>
          <BaseContent {...props} ref={disabledRef} />
        </Provider>
      );
      instance = disabledRef.current;
      act(() => {
        instance.setState({ visible: true });
      });
      instance.spocPlaceholderStartTime = null;

      const prevProps = {
        ...baseProps,
        DiscoveryStream: {
          config: { enabled: true },
          spocs: {
            onDemand: { enabled: false, loaded: false },
            lastUpdated: Date.now() - 120000,
            cacheUpdateTime: 60000,
          },
        },
      };

      instance.trackSpocPlaceholderDuration(prevProps);

      expect(instance.spocPlaceholderStartTime).toBeNull();
    });
  });
});

describe("<BaseContent> onWindowScroll", () => {
  const DEFAULT_PROPS = {
    store: { getState: () => {} },
    App: { initialized: true },
    Prefs: { values: {} },
    Sections: [],
    DiscoveryStream: { config: { enabled: false }, spocs: {} },
    dispatch: () => {},
    document: {
      visibilityState: "visible",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  };

  function setScrollY(value) {
    Object.defineProperty(global, "scrollY", { value, configurable: true });
  }

  function mountScroll(props) {
    const ref = React.createRef();
    render(
      <Provider store={makeStore()}>
        <BaseContent Wallpapers={MOUNT_WALLPAPERS} {...props} ref={ref} />
      </Provider>
    );
    return ref.current;
  }

  beforeEach(() => {
    setScrollY(0);
  });

  afterEach(() => {
    setScrollY(0);
  });

  it("should dispatch NEW_TAB_SCROLL when scrollY exceeds threshold", () => {
    const dispatch = jest.fn();
    const instance = mountScroll({ ...DEFAULT_PROPS, dispatch });
    setScrollY(150);
    instance.onWindowScroll();
    expect(dispatch).toHaveBeenCalledWith(
      ac.OnlyToMain({ type: at.NEW_TAB_SCROLL })
    );
  });

  it("should not dispatch NEW_TAB_SCROLL when scrollY is at or below threshold", () => {
    const dispatch = jest.fn();
    const instance = mountScroll({ ...DEFAULT_PROPS, dispatch });
    setScrollY(10);
    instance.onWindowScroll();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("should set _hasScrolledForSession to true when scroll threshold exceeded", () => {
    const instance = mountScroll(DEFAULT_PROPS);
    setScrollY(150);
    instance.onWindowScroll();
    expect(instance._hasScrolledForSession).toBe(true);
  });

  it("should not dispatch NEW_TAB_SCROLL again once _hasScrolledForSession is true", () => {
    const dispatch = jest.fn();
    const instance = mountScroll({ ...DEFAULT_PROPS, dispatch });
    instance._hasScrolledForSession = true;
    setScrollY(150);
    instance.onWindowScroll();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

const weatherSuggestion = {
  current_conditions: {
    icon_id: 3,
    summary: "Partly Cloudy",
    temperature: { c: 20, f: 68 },
  },
  forecast: {
    high: { c: 25, f: 77 },
    low: { c: 15, f: 59 },
    url: "https://example.com",
  },
};

describe("<Base> Nova startup layout stability", () => {
  it("keeps the centered-logo layout stable while the small weather widget initializes", () => {
    const store = createStore(combineReducers(reducers), {
      ...INITIAL_STATE,
      App: {
        ...INITIAL_STATE.App,
        initialized: true,
      },
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
          showWeather: true,
          "widgets.enabled": true,
          "widgets.system.enabled": true,
          "widgets.system.weather.enabled": true,
          "widgets.weather.enabled": true,
          "widgets.weather.size": "small",
        },
      },
      Weather: {
        ...INITIAL_STATE.Weather,
        initialized: false,
        locationData: { city: "Testville" },
      },
    });

    const { container } = render(
      <Provider store={store}>
        <ConnectedBase />
      </Provider>
    );

    expect(
      container.querySelector(".container.nova-enabled.logo-in-content")
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        ".sidebar-inline-start .logo-and-wordmark-wrapper"
      )
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".sidebar-inline-end .weather-widget")
    ).not.toBeInTheDocument();

    act(() => {
      store.dispatch({
        type: at.WEATHER_UPDATE,
        data: {
          suggestions: [weatherSuggestion],
          hourlyForecasts: [],
          lastUpdated: Date.now(),
          locationData: { city: "Testville" },
        },
      });
    });

    expect(
      container.querySelector(".container.nova-enabled.logo-in-content")
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        ".sidebar-inline-start .logo-and-wordmark-wrapper"
      )
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".sidebar-inline-end .weather-widget")
    ).toBeInTheDocument();
  });
});

function renderNova(overrides = {}) {
  const store = createStore(combineReducers(reducers), {
    ...INITIAL_STATE,
    App: { ...INITIAL_STATE.App, initialized: true },
    Prefs: {
      ...INITIAL_STATE.Prefs,
      values: {
        ...INITIAL_STATE.Prefs.values,
        "nova.enabled": true,
        showSearch: false,
        "feeds.topsites": false,
        "feeds.section.topstories": false,
        "feeds.system.topstories": false,
        "feeds.section.highlights": false,
        "widgets.enabled": false,
        "widgets.system.enabled": false,
        "widgets.system.weather.enabled": false,
        "widgets.weather.enabled": false,
        "widgets.system.lists.enabled": false,
        "widgets.lists.enabled": false,
        "widgets.system.focusTimer.enabled": false,
        "widgets.focusTimer.enabled": false,
        "widgets.system.clocks.enabled": false,
        "widgets.clocks.enabled": false,
        "widgets.system.sportsWidget.enabled": false,
        "widgets.sportsWidget.enabled": false,
        ...overrides,
      },
    },
  });
  return render(
    <Provider store={store}>
      <ConnectedBase />
    </Provider>
  );
}

describe("<Base> Nova hides Logo when no sections are enabled", () => {
  it("does not render the Logo when every section is disabled", () => {
    const { container } = renderNova();
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).not.toBeInTheDocument();
  });

  it("renders the Logo when only search is enabled", () => {
    const { container } = renderNova({ showSearch: true });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("renders the Logo when only topsites is enabled", () => {
    const { container } = renderNova({ "feeds.topsites": true });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("renders the Logo when only Highlights (Recent Activity) is enabled", () => {
    const { container } = renderNova({ "feeds.section.highlights": true });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("renders the Logo when only Pocket is enabled", () => {
    const { container } = renderNova({
      "feeds.section.topstories": true,
      "feeds.system.topstories": true,
    });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("renders the Logo when a content widget (lists) is enabled", () => {
    const { container } = renderNova({
      "widgets.enabled": true,
      "widgets.system.enabled": true,
      "widgets.system.lists.enabled": true,
      "widgets.lists.enabled": true,
    });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("renders the Logo when a widget is enabled via trainhopConfig (system pref off)", () => {
    const { container } = renderNova({
      "widgets.enabled": true,
      "widgets.system.enabled": true,
      "widgets.system.lists.enabled": false,
      "widgets.lists.enabled": true,
      trainhopConfig: { widgets: { listsEnabled: true } },
    });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("hides the Logo when per-widget prefs are on but widgets.enabled is off", () => {
    const { container } = renderNova({
      "widgets.enabled": false,
      "widgets.system.enabled": true,
      "widgets.system.lists.enabled": true,
      "widgets.lists.enabled": true,
      "widgets.system.clocks.enabled": true,
      "widgets.clocks.enabled": true,
      "widgets.system.focusTimer.enabled": true,
      "widgets.focusTimer.enabled": true,
      "widgets.system.sportsWidget.enabled": true,
      "widgets.sportsWidget.enabled": true,
    });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).not.toBeInTheDocument();
  });

  it("centers the Logo in .content when widgets.enabled is off and only search is on", () => {
    const { container } = renderNova({
      showSearch: true,
      "widgets.enabled": false,
      "widgets.system.enabled": true,
      "widgets.system.lists.enabled": true,
      "widgets.lists.enabled": true,
      "widgets.system.clocks.enabled": true,
      "widgets.clocks.enabled": true,
      "widgets.system.focusTimer.enabled": true,
      "widgets.focusTimer.enabled": true,
      "widgets.system.sportsWidget.enabled": true,
      "widgets.sportsWidget.enabled": true,
    });
    expect(
      container.querySelector(".container.nova-enabled.logo-in-content")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".content .logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        ".sidebar-inline-start .logo-and-wordmark-wrapper"
      )
    ).not.toBeInTheDocument();
  });

  it("renders the Logo when only the sidebar weather widget is enabled", () => {
    const { container } = renderNova({
      "widgets.enabled": true,
      "widgets.system.enabled": true,
      "widgets.system.weather.enabled": true,
      "widgets.weather.enabled": true,
      "widgets.weather.size": "small",
    });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });
});

describe("<Base> Nova logo placement with many topSitesRows", () => {
  it("anchors the Logo to the sidebar when topSitesRows > 2 (3 rows)", () => {
    const { container } = renderNova({
      "feeds.topsites": true,
      topSitesRows: 3,
    });
    expect(
      container.querySelector(".container.nova-enabled.logo-in-content")
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(
        ".sidebar-inline-start .logo-and-wordmark-wrapper"
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(".content .logo-and-wordmark-wrapper")
    ).not.toBeInTheDocument();
  });

  it("anchors the Logo to the sidebar when topSitesRows > 2 (4 rows)", () => {
    const { container } = renderNova({
      "feeds.topsites": true,
      topSitesRows: 4,
    });
    expect(
      container.querySelector(
        ".sidebar-inline-start .logo-and-wordmark-wrapper"
      )
    ).toBeInTheDocument();
  });

  it("centers the Logo when topSitesRows is 2", () => {
    const { container } = renderNova({
      "feeds.topsites": true,
      topSitesRows: 2,
    });
    expect(
      container.querySelector(".container.nova-enabled.logo-in-content")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".content .logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("centers the Logo when topSitesRows > 2 but topsites are disabled", () => {
    const { container } = renderNova({
      "feeds.topsites": false,
      showSearch: true,
      topSitesRows: 4,
    });
    expect(
      container.querySelector(".container.nova-enabled.logo-in-content")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".content .logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });
});

describe("<Base> Nova hideLogo pref", () => {
  it("renders the Logo by default (hideLogo unset, topsites enabled)", () => {
    const { container } = renderNova({ "feeds.topsites": true });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("hides the Logo when hideLogo is true (sidebar layout)", () => {
    const { container } = renderNova({
      "feeds.topsites": true,
      hideLogo: true,
    });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).not.toBeInTheDocument();
  });

  it("hides the Logo when hideLogo is true (centered layout)", () => {
    const { container } = renderNova({ showSearch: true, hideLogo: true });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).not.toBeInTheDocument();
  });
});

describe("<BaseContent> weather opt-in dialog trigger", () => {
  function makeInstance(currentPrefs, dispatch = jest.fn()) {
    const inst = Object.create(BaseContent.prototype);
    inst.props = {
      Prefs: { values: currentPrefs },
      dispatch,
      App: { isForStartupCache: {} },
      DiscoveryStream: { spocs: {} },
    };
    inst.state = { visible: false };
    inst.applyBodyClasses = jest.fn();
    inst.spocsOnDemandUpdated = jest.fn();
    inst.trackSpocPlaceholderDuration = jest.fn();
    Object.defineProperty(inst, "isSpocsOnDemandExpired", { get: () => false });
    return { inst, dispatch };
  }

  function makePrevProps(prefs) {
    return {
      Prefs: { values: prefs },
      DiscoveryStream: { spocs: {} },
      App: { isForStartupCache: {} },
    };
  }

  it("triggers weather.optInDisplayed in classic mode when showWeather transitions to true", () => {
    const { inst, dispatch } = makeInstance({
      "nova.enabled": false,
      showWeather: true,
    });

    inst.componentDidUpdate(
      makePrevProps({ "nova.enabled": false, showWeather: false })
    );

    expect(dispatch).toHaveBeenCalledWith(
      ac.SetPref("weather.optInDisplayed", true)
    );
  });

  it("does not trigger weather.optInDisplayed in classic mode when showWeather was already true", () => {
    const { inst, dispatch } = makeInstance({
      "nova.enabled": false,
      showWeather: true,
    });

    inst.componentDidUpdate(
      makePrevProps({ "nova.enabled": false, showWeather: true })
    );

    expect(dispatch).not.toHaveBeenCalledWith(
      ac.SetPref("weather.optInDisplayed", true)
    );
  });

  it("triggers weather.optInDisplayed in Nova mode when widgets.weather.enabled transitions to true", () => {
    const { inst, dispatch } = makeInstance({
      "nova.enabled": true,
      "widgets.weather.enabled": true,
    });

    inst.componentDidUpdate(
      makePrevProps({ "nova.enabled": true, "widgets.weather.enabled": false })
    );

    expect(dispatch).toHaveBeenCalledWith(
      ac.SetPref("weather.optInDisplayed", true)
    );
  });

  it("does not trigger weather.optInDisplayed in Nova mode when only showWeather transitions to true", () => {
    const { inst, dispatch } = makeInstance({
      "nova.enabled": true,
      "widgets.weather.enabled": true,
      showWeather: true,
    });

    inst.componentDidUpdate(
      makePrevProps({
        "nova.enabled": true,
        "widgets.weather.enabled": true,
        showWeather: false,
      })
    );

    expect(dispatch).not.toHaveBeenCalledWith(
      ac.SetPref("weather.optInDisplayed", true)
    );
  });
});

describe("<BaseContent> wallpaper transitions (Bug 2057217)", () => {
  const makeInstance = ({
    wallpaper,
    uploadedWallpaper = null,
    wallpaperList = [],
  }) => {
    const inst = Object.create(BaseContent.prototype);
    inst.props = {
      Prefs: {
        values: {
          "newtabWallpapers.enabled": true,
          "newtabWallpapers.user.enabled": true,
          "newtabWallpapers.wallpaper": wallpaper,
          "newtabWallpapers.initialWallpaper": "",
          "newtabWallpapers.customWallpaper.theme": "",
          "nova.enabled": true,
        },
      },
      Wallpapers: { wallpaperList, uploadedWallpaper },
    };
    inst.prefersDarkQuery = null;
    return inst;
  };

  const makeDeferred = () => {
    let resolve;
    const promise = new Promise(resolvePromise => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  };

  const originalImage = global.Image;
  let setPropertySpy;
  beforeEach(() => {
    setPropertySpy = jest.spyOn(document.body.style, "setProperty");
  });
  afterEach(() => {
    global.Image = originalImage;
    document.body.style.removeProperty("--newtab-wallpaper");
    document.body.style.removeProperty("--newtab-wallpaper-color");
    document.body.style.removeProperty("--newtab-wallpaper-backgroundPosition");
    document.body.classList.remove("lightWallpaper", "darkWallpaper");
    jest.restoreAllMocks();
  });

  it("does not blank the background when custom is selected but its uploaded URL has not arrived yet", async () => {
    const inst = makeInstance({ wallpaper: "custom", uploadedWallpaper: null });

    await inst.updateWallpaper();

    expect(setPropertySpy).not.toHaveBeenCalledWith(
      "--newtab-wallpaper",
      expect.anything()
    );
  });

  it("applies an initial custom wallpaper without waiting for decode", async () => {
    const inst = makeInstance({
      wallpaper: "custom",
      uploadedWallpaper: "custom-wallpaper.jpg",
    });
    const decodeSpy = jest.spyOn(inst, "decodeWallpaper");

    await inst.updateWallpaper();

    expect(decodeSpy).not.toHaveBeenCalled();
    expect(setPropertySpy).toHaveBeenCalledWith(
      "--newtab-wallpaper",
      "url(custom-wallpaper.jpg)"
    );
  });

  it("keeps the current wallpaper painted until its replacement decodes", async () => {
    const inst = makeInstance({
      wallpaper: "custom",
      uploadedWallpaper: "custom-wallpaper.jpg",
    });
    const pendingDecode = makeDeferred();
    jest.spyOn(inst, "decodeWallpaper").mockReturnValue(pendingDecode.promise);
    document.body.style.setProperty(
      "--newtab-wallpaper",
      "url(previous-wallpaper.jpg)"
    );
    setPropertySpy.mockClear();

    const updatePromise = inst.updateWallpaper();

    expect(document.body.style.getPropertyValue("--newtab-wallpaper")).toBe(
      "url(previous-wallpaper.jpg)"
    );
    expect(setPropertySpy).not.toHaveBeenCalledWith(
      "--newtab-wallpaper",
      "url(custom-wallpaper.jpg)"
    );

    pendingDecode.resolve(true);
    await updatePromise;

    expect(setPropertySpy).toHaveBeenCalledWith(
      "--newtab-wallpaper",
      "url(custom-wallpaper.jpg)"
    );
  });

  it("keeps the current wallpaper when its replacement fails to decode", async () => {
    const inst = makeInstance({
      wallpaper: "custom",
      uploadedWallpaper: "custom-wallpaper.jpg",
    });
    const decode = jest.fn().mockRejectedValue(new Error("decode failed"));
    global.Image = jest.fn(() => ({ decode }));
    document.body.style.setProperty(
      "--newtab-wallpaper",
      "url(previous-wallpaper.jpg)"
    );
    setPropertySpy.mockClear();

    await inst.updateWallpaper();

    expect(decode).toHaveBeenCalled();
    expect(document.body.style.getPropertyValue("--newtab-wallpaper")).toBe(
      "url(previous-wallpaper.jpg)"
    );
    expect(setPropertySpy).not.toHaveBeenCalledWith(
      "--newtab-wallpaper",
      "url(custom-wallpaper.jpg)"
    );
  });

  it("does not apply a decoded custom wallpaper after a newer built-in selection", async () => {
    const inst = makeInstance({
      wallpaper: "custom",
      uploadedWallpaper: "custom-wallpaper.jpg",
    });
    const pendingDecode = makeDeferred();
    global.Image = jest.fn(() => ({
      decode: jest.fn(() => pendingDecode.promise),
    }));
    document.body.style.setProperty(
      "--newtab-wallpaper",
      "url(previous-wallpaper.jpg)"
    );
    setPropertySpy.mockClear();

    const customUpdate = inst.updateWallpaper();
    inst.props = {
      ...inst.props,
      Prefs: {
        values: {
          ...inst.props.Prefs.values,
          "newtabWallpapers.wallpaper": "built-in",
        },
      },
      Wallpapers: {
        uploadedWallpaper: "custom-wallpaper.jpg",
        wallpaperList: [
          {
            title: "built-in",
            wallpaperUrl: "built-in-wallpaper.jpg",
          },
        ],
      },
    };

    await inst.updateWallpaper();
    pendingDecode.resolve();
    await customUpdate;

    expect(document.body.style.getPropertyValue("--newtab-wallpaper")).toBe(
      "url(built-in-wallpaper.jpg)"
    );
    expect(setPropertySpy).not.toHaveBeenCalledWith(
      "--newtab-wallpaper",
      "url(custom-wallpaper.jpg)"
    );
  });
});

// Constructs a bare instance off the prototype so instance methods run against
// controlled props/state while we assert on the dispatch spy and DOM side
// effects (never on internal state).
function makeBareInstance(overrides = {}) {
  const bareInstance = Object.create(BaseContent.prototype);
  bareInstance.props = overrides.props || {};
  bareInstance.state = overrides.state || {};
  return bareInstance;
}

describe("<BaseContent> customize menu dispatch", () => {
  it("does not dispatch close actions when the menu is not visible", () => {
    const dispatch = jest.fn();
    const instance = makeBareInstance({
      props: { dispatch, App: { customizeMenuVisible: false } },
    });

    instance.closeCustomizationMenu();

    expect(dispatch).not.toHaveBeenCalled();
  });
});
