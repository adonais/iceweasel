import React from "react";
import { mount } from "enzyme";
import { Provider } from "react-redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { combineReducers, createStore } from "redux";
import {
  Widgets,
  resetTimerToDefaults,
} from "content-src/components/Widgets/Widgets";
import { Lists } from "content-src/components/Widgets/Lists/Lists";
import { actionTypes as at } from "common/Actions.mjs";
import { FocusTimer } from "content-src/components/Widgets/FocusTimer/FocusTimer";

const PREF_WIDGETS_LISTS_ENABLED = "widgets.lists.enabled";
const PREF_WIDGETS_SYSTEM_LISTS_ENABLED = "widgets.system.lists.enabled";
const PREF_WIDGETS_TIMER_ENABLED = "widgets.focusTimer.enabled";
const PREF_WIDGETS_SYSTEM_TIMER_ENABLED = "widgets.system.focusTimer.enabled";

function WrapWithProvider({ children, state = INITIAL_STATE }) {
  const store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

describe("<Widgets>", () => {
  it("should render and show <Lists> if list prefs are enabled", () => {
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          [PREF_WIDGETS_LISTS_ENABLED]: true,
          [PREF_WIDGETS_SYSTEM_LISTS_ENABLED]: true,
        },
      },
    };
    const wrapper = mount(
      <WrapWithProvider state={state}>
        <Widgets />
      </WrapWithProvider>
    );
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".widgets-container").exists());
    assert.ok(wrapper.find(Lists).exists());
  });

  it("should render and show <FocusTimer> if timer prefs are enabled", () => {
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          [PREF_WIDGETS_TIMER_ENABLED]: true,
          [PREF_WIDGETS_SYSTEM_TIMER_ENABLED]: true,
        },
      },
    };
    const wrapper = mount(
      <WrapWithProvider state={state}>
        <Widgets />
      </WrapWithProvider>
    );
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".widgets-container").exists());
    assert.ok(wrapper.find(FocusTimer).exists());
  });

  it("should not render FocusTimer when timer pref is disabled", () => {
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          [PREF_WIDGETS_TIMER_ENABLED]: false,
          [PREF_WIDGETS_SYSTEM_TIMER_ENABLED]: true,
        },
      },
    };
    const wrapper = mount(
      <WrapWithProvider state={state}>
        <Widgets />
      </WrapWithProvider>
    );
    assert.ok(!wrapper.find(FocusTimer).exists());
  });

  describe("resetTimerToDefaults", () => {
    it("should dispatch WIDGETS_TIMER_RESET with focus timer defaults", () => {
      const dispatch = sinon.spy();
      const timerType = "focus";

      resetTimerToDefaults(dispatch, timerType);

      const resetCall = dispatch
        .getCalls()
        .find(call => call.args[0]?.type === at.WIDGETS_TIMER_RESET);
      const setTypeCall = dispatch
        .getCalls()
        .find(call => call.args[0]?.type === at.WIDGETS_TIMER_SET_TYPE);

      assert.ok(resetCall, "should dispatch WIDGETS_TIMER_RESET");
      assert.ok(setTypeCall, "should dispatch WIDGETS_TIMER_SET_TYPE");
      assert.equal(
        resetCall.args[0].data.duration,
        1500,
        "should reset focus to 25 minutes"
      );
      assert.equal(resetCall.args[0].data.initialDuration, 1500);
      assert.equal(resetCall.args[0].data.timerType, "focus");
      assert.equal(setTypeCall.args[0].data.timerType, "focus");
    });

    it("should dispatch WIDGETS_TIMER_RESET with break timer defaults", () => {
      const dispatch = sinon.spy();
      const timerType = "break";

      resetTimerToDefaults(dispatch, timerType);

      const resetCall = dispatch
        .getCalls()
        .find(call => call.args[0]?.type === at.WIDGETS_TIMER_RESET);

      assert.ok(resetCall, "should dispatch WIDGETS_TIMER_RESET");
      assert.equal(
        resetCall.args[0].data.duration,
        300,
        "should reset break to 5 minutes"
      );
      assert.equal(resetCall.args[0].data.initialDuration, 300);
      assert.equal(resetCall.args[0].data.timerType, "break");
    });
  });
});
