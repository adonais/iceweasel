/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, fireEvent, render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import {
  CollapseToggle,
  DiscoveryStreamAdminInner,
  DiscoveryStreamAdminUI,
  ToggleStoryButton,
} from "content-src/components/DiscoveryStreamAdmin/DiscoveryStreamAdmin";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { WIDGET_REGISTRY } from "common/WidgetsRegistry.mjs";
import React from "react";

const CONTEXTUAL_PREFS = {
  "discoverystream.contextualContent.selectedFeed": "foo",
  "discoverystream.contextualContent.feeds": "foo, bar",
};

const getDebugFeatures = ({
  artsCurrent = 0,
  artsOverride = undefined,
  sportsCurrent = 0,
  sportsOverride = undefined,
} = {}) => ({
  arts: {
    numValues: 4,
    currentValue: artsCurrent,
    ...(artsOverride !== undefined ? { overrideValue: artsOverride } : {}),
  },
  sports: {
    numValues: 4,
    currentValue: sportsCurrent,
    ...(sportsOverride !== undefined ? { overrideValue: sportsOverride } : {}),
  },
});

const getInferredState = debugFeatures => ({
  inferredInterests: {},
  coarseInferredInterests: {},
  coarsePrivateInferredInterests: {},
  debugFeatures,
});

const getDiscoveryStreamState = () => ({
  config: { enabled: true },
  layout: [],
  spocs: { frequency_caps: [] },
  feeds: { data: {} },
  blocks: {},
  impressions: { feed: {} },
});

function renderUI({
  otherPrefs = CONTEXTUAL_PREFS,
  discoveryStream = getDiscoveryStreamState(),
  weather = { suggestions: [] },
  inferred = getInferredState(null),
} = {}) {
  const dispatch = jest.fn();
  const ref = React.createRef();
  const utils = render(
    <DiscoveryStreamAdminUI
      ref={ref}
      dispatch={dispatch}
      otherPrefs={otherPrefs}
      state={{
        DiscoveryStream: discoveryStream,
        Weather: weather,
        InferredPersonalization: inferred,
      }}
    />
  );
  return { ...utils, dispatch, instance: ref.current };
}

// Return the moz-button whose visible label matches `text`.
function buttonByText(container, text) {
  return [...container.querySelectorAll("moz-button")].find(
    node => node.textContent.trim() === text
  );
}

// Return the action of `type` dispatched to the store.
function dispatchedAction(dispatch, type) {
  return dispatch.mock.calls
    .map(([action]) => action)
    .find(a => a.type === type);
}

// Simulate moz-toggle flipping its `pressed` property and firing `toggle`.
function fireToggle(element, pressed) {
  Object.defineProperty(element, "pressed", {
    value: pressed,
    configurable: true,
  });
  fireEvent(element, new CustomEvent("toggle", { bubbles: true }));
}

describe("<CollapseToggle>", () => {
  it("should render a plain button toggle by default", () => {
    const { container } = render(
      <WrapWithProvider>
        <CollapseToggle devtoolsCollapsed={true} dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector("button.discoverystream-admin-toggle")
    ).toBeInTheDocument();
  });

  it("should render a moz-button toggle when Nova is enabled", () => {
    const { container } = render(
      <CollapseToggle
        devtoolsCollapsed={true}
        dispatch={jest.fn()}
        Prefs={{ values: { "nova.enabled": true } }}
      />
    );
    expect(
      container.querySelector("moz-button.discoverystream-admin-toggle")
    ).toBeInTheDocument();
    expect(
      container.querySelector("button.discoverystream-admin-toggle")
    ).not.toBeInTheDocument();
  });
});

describe("<DiscoveryStreamAdminInner>", () => {
  const innerProps = () => ({
    location: { routes: [""] },
    Prefs: { values: CONTEXTUAL_PREFS },
    DiscoveryStream: getDiscoveryStreamState(),
    Weather: { suggestions: [] },
    InferredPersonalization: getInferredState(null),
    dispatch: jest.fn(),
  });

  it("should render", () => {
    const { container } = render(
      <DiscoveryStreamAdminInner collapsed={false} {...innerProps()} />
    );
    expect(
      container.querySelector(".discoverystream-admin")
    ).toBeInTheDocument();
  });

  it("should set a .collapsed class on the outer div when collapsed", () => {
    const { container } = render(
      <DiscoveryStreamAdminInner collapsed={true} {...innerProps()} />
    );
    expect(container.querySelector(".discoverystream-admin")).toHaveClass(
      "collapsed"
    );
  });

  it("should set an .expanded class on the outer div when not collapsed", () => {
    const { container } = render(
      <DiscoveryStreamAdminInner collapsed={false} {...innerProps()} />
    );
    const admin = container.querySelector(".discoverystream-admin");
    expect(admin).toHaveClass("expanded");
    expect(admin).not.toHaveClass("collapsed");
  });

  it("should render the Discovery Stream Admin heading", () => {
    const { getByText } = render(
      <DiscoveryStreamAdminInner collapsed={false} {...innerProps()} />
    );
    expect(getByText("Discovery Stream Admin")).toBeInTheDocument();
  });

  it("should dismiss the panel from the close button", () => {
    globalThis.location.hash = "#devtools";
    const { container } = render(
      <DiscoveryStreamAdminInner collapsed={false} {...innerProps()} />
    );
    fireEvent.click(
      container.querySelector("moz-button.discoverystream-admin-close")
    );
    expect(globalThis.location.hash).toBe("");
  });

  it("should dismiss the panel when Escape is pressed", () => {
    globalThis.location.hash = "#devtools";
    render(<DiscoveryStreamAdminInner collapsed={false} {...innerProps()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(globalThis.location.hash).toBe("");
  });

  it("should not dismiss when Escape is pressed inside an input", () => {
    globalThis.location.hash = "#devtools";
    const { container } = render(
      <DiscoveryStreamAdminInner collapsed={false} {...innerProps()} />
    );
    fireEvent.keyDown(container.querySelector("input"), { key: "Escape" });
    expect(globalThis.location.hash).toBe("#devtools");
  });
});

describe("<DiscoveryStreamAdminUI>", () => {
  it("should render the Layout section", () => {
    const { getByText } = renderUI();
    expect(getByText("Layout")).toBeInTheDocument();
  });

  it("should render an expanded spoc as JSON", () => {
    const discoveryStream = getDiscoveryStreamState();
    discoveryStream.spocs = {
      frequency_caps: [],
      data: { newtab_spocs: { items: [{ id: 12345 }] } },
    };
    const { container, instance } = renderUI({ discoveryStream });
    act(() => instance.onStoryToggle({ id: 12345 }));
    const pre = container.querySelector(".message-summary pre");
    expect(pre.textContent).toBe('{\n  "id": 12345\n}');
  });

  it("should fire refreshCache with DISCOVERY_STREAM_DEV_REFRESH_CACHE", () => {
    const { container, dispatch } = renderUI();
    fireEvent.click(buttonByText(container, "Refresh Cache"));
    expect(dispatch).toHaveBeenCalledWith(
      ac.OnlyToMain({ type: at.DISCOVERY_STREAM_DEV_REFRESH_CACHE })
    );
  });

  it("should fire expireCache with DISCOVERY_STREAM_DEV_EXPIRE_CACHE", () => {
    const { container, dispatch } = renderUI();
    fireEvent.click(buttonByText(container, "Expire Cache"));
    expect(dispatch).toHaveBeenCalledWith(
      ac.OnlyToMain({ type: at.DISCOVERY_STREAM_DEV_EXPIRE_CACHE })
    );
  });

  it("should fire systemTick with DISCOVERY_STREAM_DEV_SYSTEM_TICK", () => {
    const { container, dispatch } = renderUI();
    fireEvent.click(buttonByText(container, "Trigger System Tick"));
    expect(dispatch).toHaveBeenCalledWith(
      ac.OnlyToMain({ type: at.DISCOVERY_STREAM_DEV_SYSTEM_TICK })
    );
  });

  it("should fire idleDaily with DISCOVERY_STREAM_DEV_IDLE_DAILY", () => {
    const { container, dispatch } = renderUI();
    fireEvent.click(buttonByText(container, "Trigger Idle Daily"));
    expect(dispatch).toHaveBeenCalledWith(
      ac.OnlyToMain({ type: at.DISCOVERY_STREAM_DEV_IDLE_DAILY })
    );
  });

  it("should fire syncRemoteSettings with DISCOVERY_STREAM_DEV_SYNC_RS", () => {
    const { container, dispatch } = renderUI();
    fireEvent.click(buttonByText(container, "Sync Remote Settings"));
    expect(dispatch).toHaveBeenCalledWith(
      ac.OnlyToMain({ type: at.DISCOVERY_STREAM_DEV_SYNC_RS })
    );
  });

  describe("inferred personalization overrides controls", () => {
    const inferredPrefs = {
      ...CONTEXTUAL_PREFS,
      "discoverystream.sections.personalization.inferred.enabled": true,
    };

    const renderInferred = debugFeatures =>
      renderUI({
        otherPrefs: inferredPrefs,
        inferred: getInferredState(debugFeatures),
      });

    it('should render the "Recompute Interest Vector" button', () => {
      const { container } = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2 })
      );
      expect(buttonByText(container, "Recompute Interest Vector")).toBeTruthy();
    });

    it('should dispatch a refresh when "Recompute Interest Vector" is clicked', () => {
      const { container, dispatch } = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2 })
      );
      fireEvent.click(buttonByText(container, "Recompute Interest Vector"));
      expect(dispatch).toHaveBeenCalledWith(
        ac.OnlyToMain({ type: at.INFERRED_PERSONALIZATION_REFRESH })
      );
    });

    it('should render the "Refresh Story Cache" button', () => {
      const { container } = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2 })
      );
      expect(buttonByText(container, "Refresh Story Cache")).toBeTruthy();
    });

    it('should refreshCache when "Refresh Story Cache" is clicked', () => {
      const { container, dispatch } = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2 })
      );
      fireEvent.click(buttonByText(container, "Refresh Story Cache"));
      expect(dispatch).toHaveBeenCalledWith(
        ac.OnlyToMain({ type: at.DISCOVERY_STREAM_DEV_REFRESH_CACHE })
      );
    });

    it("should dispatch null overrides when toggle is turned off", () => {
      const { instance, dispatch } = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2 })
      );
      act(() =>
        instance.handleDebugOverridesToggle({ target: { pressed: false } })
      );
      expect(dispatch).toHaveBeenCalledWith(
        ac.OnlyToMain({
          type: at.INFERRED_PERSONALIZATION_DEBUG_OVERRIDES_SET,
          data: null,
        })
      );
    });

    it("should keep slider values in pendingOverrides while overrides are off", () => {
      const { instance } = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2 })
      );
      act(() =>
        instance.handleDebugOverridesToggle({ target: { pressed: false } })
      );
      expect(instance.state.pendingOverrides).toEqual({ arts: 2, sports: 0 });

      act(() => instance.handleDebugOverrideChange("arts", 3));
      expect(instance.state.pendingOverrides.arts).toBe(3);
    });

    it("should restore and send pending overrides when toggle is turned on", () => {
      const { instance, dispatch } = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2 })
      );
      act(() =>
        instance.setState({ pendingOverrides: { arts: 3, sports: 1 } })
      );
      act(() =>
        instance.handleDebugOverridesToggle({ target: { pressed: true } })
      );
      expect(dispatch).toHaveBeenCalledWith(
        ac.OnlyToMain({
          type: at.INFERRED_PERSONALIZATION_DEBUG_OVERRIDES_SET,
          data: { arts: 3, sports: 1 },
        })
      );
    });

    it("should reset pending overrides to 0 and send reset when enabled", () => {
      const { instance, dispatch } = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2 })
      );
      act(() =>
        instance.setState({ pendingOverrides: { arts: 3, sports: 1 } })
      );
      act(() => instance.handleResetAllOverrides());
      expect(instance.state.pendingOverrides).toEqual({ arts: 0, sports: 0 });
      expect(dispatch).toHaveBeenCalledWith(
        ac.OnlyToMain({
          type: at.INFERRED_PERSONALIZATION_DEBUG_OVERRIDES_SET,
          data: { arts: 0, sports: 0 },
        })
      );
    });

    it("should enable reset button only when at least one override is non-zero", () => {
      const disabled = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 0, sportsOverride: 0 })
      );
      expect(
        buttonByText(disabled.container, "Reset overrides").hasAttribute(
          "disabled"
        )
      ).toBe(true);

      const enabled = renderInferred(
        getDebugFeatures({ artsCurrent: 1, artsOverride: 2, sportsOverride: 0 })
      );
      expect(
        buttonByText(enabled.container, "Reset overrides").hasAttribute(
          "disabled"
        )
      ).toBe(false);
    });
  });

  describe("Widgets", () => {
    const renderWidgets = (otherPrefs = { "widgets.system.enabled": false }) =>
      renderUI({ otherPrefs });

    it("should flip widgets.system.enabled from the master toggle", () => {
      const { container, dispatch } = renderWidgets();
      fireToggle(container.querySelector("#widgets-system-enabled"), true);
      expect(dispatch).toHaveBeenCalledWith(
        ac.SetPref("widgets.system.enabled", true)
      );
    });

    it("should flip a widget's system pref from its toggle", () => {
      const { container, dispatch } = renderWidgets({
        "widgets.system.enabled": true,
      });
      fireToggle(
        container.querySelector('[id="widgets.system.lists.enabled"]'),
        true
      );
      expect(dispatch).toHaveBeenCalledWith(
        ac.SetPref("widgets.system.lists.enabled", true)
      );
    });

    it("should disable per-widget toggles when the widget system is off", () => {
      const { container } = renderWidgets();
      expect(
        container
          .querySelector('[id="widgets.system.lists.enabled"]')
          .hasAttribute("disabled")
      ).toBe(true);
    });

    it("should enable the system and every widget from the Enable all button", () => {
      const { container, dispatch } = renderWidgets();
      fireEvent.click(buttonByText(container, "Enable all"));
      const action = dispatchedAction(dispatch, at.SET_MULTIPLE_PREFS);
      expect(action).toBeTruthy();
      expect(action.data.values["widgets.system.enabled"]).toBe(true);
      expect(action.data.values["widgets.system.lists.enabled"]).toBe(true);
    });

    it("should disable the system and every widget from the Disable all button", () => {
      const allEnabled = { "widgets.system.enabled": true };
      for (const widget of WIDGET_REGISTRY) {
        allEnabled[widget.systemEnabledPref] = true;
      }
      const { container, dispatch } = renderWidgets(allEnabled);
      fireEvent.click(buttonByText(container, "Disable all"));
      const action = dispatchedAction(dispatch, at.SET_MULTIPLE_PREFS);
      expect(action).toBeTruthy();
      expect(action.data.values["widgets.system.enabled"]).toBe(false);
      expect(action.data.values["widgets.system.lists.enabled"]).toBe(false);
    });

    // Names of prefs cleared via CLEAR_PREF actions.
    const clearedPrefs = dispatch =>
      dispatch.mock.calls
        .map(([action]) => action)
        .filter(a => a.type === at.CLEAR_PREF)
        .map(a => a.data.name);

    it("should clear every widget interaction pref from Reset interaction", () => {
      const { container, dispatch } = renderWidgets({
        "widgets.system.enabled": true,
        "widgets.lists.interaction": true,
        "widgets.crossword.interaction": true,
        "widgets.lists.enabled": true,
        "discoverystream.foo": true,
      });
      fireEvent.click(buttonByText(container, "Reset interaction"));
      expect(clearedPrefs(dispatch).sort()).toEqual([
        "widgets.crossword.interaction",
        "widgets.lists.interaction",
      ]);
    });

    it("should clear every widgets.* pref from Reset to defaults", () => {
      const { container, dispatch } = renderWidgets({
        "widgets.system.enabled": true,
        "widgets.lists.enabled": true,
        "widgets.lists.interaction": true,
        "discoverystream.foo": true,
      });
      fireEvent.click(buttonByText(container, "Reset to defaults"));
      const cleared = clearedPrefs(dispatch);
      expect(cleared.sort()).toEqual([
        "widgets.lists.enabled",
        "widgets.lists.interaction",
        "widgets.system.enabled",
      ]);
      expect(cleared).not.toContain("discoverystream.foo");
    });

    it("should flip a bespoke widget feature pref from its toggle", () => {
      const { container, dispatch } = renderWidgets({
        "widgets.system.enabled": true,
        "widgets.pictureOfTheDay.setAsWallpaper.enabled": false,
      });
      fireToggle(
        container.querySelector(
          '[id="widgets.pictureOfTheDay.setAsWallpaper.enabled"]'
        ),
        true
      );
      expect(dispatch).toHaveBeenCalledWith(
        ac.SetPref("widgets.pictureOfTheDay.setAsWallpaper.enabled", true)
      );
    });

    it("should flip the privacy VPN messages pref from its toggle", () => {
      const { container, dispatch } = renderWidgets({
        "widgets.system.enabled": true,
        "widgets.privacy.showVpnMessages": false,
      });
      fireToggle(
        container.querySelector('[id="widgets.privacy.showVpnMessages"]'),
        true
      );
      expect(dispatch).toHaveBeenCalledWith(
        ac.SetPref("widgets.privacy.showVpnMessages", true)
      );
    });
  });
});

describe("Train Hop section", () => {
  it("shows the installed version and raw trainhopConfig JSON", () => {
    const config = { widgets: { enabled: true } };
    const { container } = renderUI({
      otherPrefs: {
        ...CONTEXTUAL_PREFS,
        trainhopVersion: "156.0.0",
        trainhopConfig: config,
      },
    });
    expect(container.textContent).toContain("156.0.0");
    expect(container.querySelector("pre.trainhop-config").textContent).toBe(
      JSON.stringify(config, null, 2)
    );
  });

  it("shows an empty state instead of the config dump when config is empty", () => {
    const { container } = renderUI({
      otherPrefs: { ...CONTEXTUAL_PREFS, trainhopConfig: {} },
    });
    expect(container.querySelector("pre.trainhop-config")).toBeNull();
    expect(container.textContent).toContain("No train-hop config");
  });
});

describe("<ToggleStoryButton>", () => {
  it("should fire onClick with its story", () => {
    const onClick = jest.fn();
    const { container } = render(
      <ToggleStoryButton story="spoc" onClick={onClick} />
    );
    fireEvent.click(container.querySelector("moz-button"));
    expect(onClick).toHaveBeenCalledWith("spoc");
  });
});
