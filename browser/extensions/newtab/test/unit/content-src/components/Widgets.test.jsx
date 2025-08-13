import React from "react";
import { mount } from "enzyme";
import { Provider } from "react-redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { combineReducers, createStore } from "redux";
import { Widgets } from "content-src/components/Widgets/Widgets";
import { Lists } from "content-src/components/Widgets/Lists/Lists";
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
  it("should render", () => {
    const wrapper = mount(
      <WrapWithProvider>
        <Widgets />
      </WrapWithProvider>
    );
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".widgets-container").exists());
  });

  it("should render <Lists> if list prefs are enabled", () => {
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
    assert.ok(wrapper.find(Lists).exists());
  });

  it("should render <FocusTimer> if timer prefs are enabled", () => {
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
    assert.ok(wrapper.find(FocusTimer).exists());
  });
});
