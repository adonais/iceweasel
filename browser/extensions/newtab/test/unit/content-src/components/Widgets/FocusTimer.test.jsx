import React from "react";
import { combineReducers, createStore } from "redux";
import { Provider } from "react-redux";
import { mount } from "enzyme";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { FocusTimer } from "content-src/components/Widgets/FocusTimer/FocusTimer";

const PREF_WIDGETS_SYSTEM_NOTIFICATIONS_ENABLED =
  "widgets.focusTimer.showSystemNotifications";

const mockState = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      [PREF_WIDGETS_SYSTEM_NOTIFICATIONS_ENABLED]: true,
    },
  },
  TimerWidget: {
    timerType: "focus",
    focus: {
      duration: 1500,
      initialDuration: 1500,
      startTime: null,
      isRunning: null,
    },
    break: {
      duration: 300,
      initialDuration: 300,
      startTime: null,
      isRunning: null,
    },
  },
};

function WrapWithProvider({ children, state = INITIAL_STATE }) {
  let store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

describe("<FocusTimer>", () => {
  let wrapper;
  let sandbox;
  let dispatch;
  let clock; // for use with the sinon fake timers api
  let handleUserInteraction;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    dispatch = sandbox.stub();
    clock = sandbox.useFakeTimers();
    handleUserInteraction = sandbox.stub();

    wrapper = mount(
      <WrapWithProvider state={mockState}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
  });

  afterEach(() => {
    // restore real timers after each test to avoid leaking sinon's fakeTimers()
    sandbox.restore();
    wrapper?.unmount();
  });

  it("should render timer widget", () => {
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".focus-timer").exists());
  });

  it("should show default minutes for Focus timer (25 minutes)", () => {
    const minutes = wrapper.find(".timer-set-minutes").text();
    const seconds = wrapper.find(".timer-set-seconds").text();
    assert.equal(minutes, "25");
    assert.equal(seconds, "00");
  });

  it("should show default minutes for Break timer (5 minutes)", () => {
    const breakState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        timerType: "break", // setting timer type to break
      },
    };

    wrapper = mount(
      <WrapWithProvider state={breakState}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    const minutes = wrapper.find(".timer-set-minutes").text();
    const seconds = wrapper.find(".timer-set-seconds").text();

    assert.equal(minutes, "05");
    assert.equal(seconds, "00");
  });

  it("should start timer and show progress bar when pressing play", () => {
    wrapper
      .find("moz-button[data-l10n-id='newtab-widget-timer-play']")
      .props()
      .onClick();
    wrapper.update();
    assert.ok(wrapper.find(".progress-circle-wrapper.visible").exists());
    assert.equal(dispatch.getCall(0).args[0].type, at.WIDGETS_TIMER_PLAY);
  });

  it("should pause the timer when pressing pause", () => {
    const now = Math.floor(Date.now() / 1000);
    const runningState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        focus: {
          ...mockState.TimerWidget.focus,
          isRunning: true,
          startTime: now,
        },
      },
    };

    wrapper = mount(
      <WrapWithProvider state={runningState}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    const pauseBtn = wrapper.find(
      "moz-button[data-l10n-id='newtab-widget-timer-pause']"
    );
    assert.ok(pauseBtn.exists(), "Pause button should be rendered");
    pauseBtn.props().onClick();
    assert.equal(dispatch.getCall(0).args[0].type, at.WIDGETS_TIMER_PAUSE);
  });

  it("should reset timer and hide progress bar when pressing reset", () => {
    const resetBtn = wrapper.find(
      "moz-button[data-l10n-id='newtab-widget-timer-reset']"
    );
    assert.ok(resetBtn.exists(), "Reset buttons should be rendered");
    resetBtn.props().onClick();
    assert.equal(dispatch.getCall(0).args[0].type, at.WIDGETS_TIMER_RESET);

    const initialUserDuration = 12 * 60;

    const resetState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        focus: {
          duration: initialUserDuration,
          initialDuration: initialUserDuration,
          startTime: null,
          isRunning: false,
        },
      },
    };

    wrapper = mount(
      <WrapWithProvider state={resetState}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    assert.equal(wrapper.find(".progress-circle-wrapper.visible").length, 0);

    const minutes = wrapper.find(".timer-set-minutes").text();
    const seconds = wrapper.find(".timer-set-seconds").text();
    assert.equal(minutes, "12");
    assert.equal(seconds, "00");
  });

  it("should dispatch pause and set type and when clicking the break timer", () => {
    const breakBtn = wrapper.find(
      "moz-button[data-l10n-id='newtab-widget-timer-mode-break']"
    );
    assert.ok(breakBtn.exists(), "break button should be rendered");
    breakBtn.props().onClick();

    const types = dispatch
      .getCalls()
      .map(call => call.args[0].type)
      .filter(Boolean);

    assert.ok(types.includes(at.WIDGETS_TIMER_PAUSE));
    assert.ok(types.includes(at.WIDGETS_TIMER_SET_TYPE));

    const findTypeToggled = dispatch
      .getCalls()
      .map(call => call.args[0])
      .find(action => action.type === at.WIDGETS_TIMER_SET_TYPE);

    assert.equal(
      findTypeToggled.data.timerType,
      "break",
      "timer should switch to break mode"
    );
  });

  it("should dispatch set type when clicking the focus timer", () => {
    const focusBtn = wrapper.find(
      "moz-button[data-l10n-id='newtab-widget-timer-mode-focus']"
    );
    assert.ok(focusBtn.exists(), "focus button should be rendered");
    focusBtn.props().onClick();

    const types = dispatch
      .getCalls()
      .map(call => call.args[0].type)
      .filter(Boolean);

    assert.ok(types.includes(at.WIDGETS_TIMER_PAUSE));
    assert.ok(types.includes(at.WIDGETS_TIMER_SET_TYPE));

    const findTypeToggled = dispatch
      .getCalls()
      .map(call => call.args[0])
      .find(action => action.type === at.WIDGETS_TIMER_SET_TYPE);

    assert.equal(
      findTypeToggled.data.timerType,
      "focus",
      "focus should switch to break mode"
    );
  });

  it("should toggle from focus to break timer automatically on end", () => {
    const now = Math.floor(Date.now() / 1000);

    const endState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        focus: {
          ...mockState.TimerWidget.break,
          isRunning: true,
          startTime: now - 300,
        },
      },
    };

    wrapper = mount(
      <WrapWithProvider state={endState}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    // Let interval fire and start the timer_end logic
    clock.tick(1000);

    // Allowing time for the chained timeouts for animation
    clock.tick(3000);
    wrapper.update();

    const types = dispatch
      .getCalls()
      .map(call => call.args[0].type)
      .filter(Boolean);

    assert.ok(types.includes(at.WIDGETS_TIMER_END));
    assert.ok(types.includes(at.WIDGETS_TIMER_SET_TYPE));

    const findTypeToggled = dispatch
      .getCalls()
      .map(call => call.args[0])
      .find(action => action.type === at.WIDGETS_TIMER_SET_TYPE);

    assert.equal(
      findTypeToggled.data.timerType,
      "break",
      "timer should switch to break mode"
    );
  });

  it("should toggle from break to focus timer automatically on end", () => {
    const now = Math.floor(Date.now() / 1000);

    const endState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        timerType: "break",
        break: {
          ...mockState.TimerWidget.break,
          isRunning: true,
          startTime: now - 300,
        },
      },
    };

    wrapper = mount(
      <WrapWithProvider state={endState}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    // Let interval fire and start the timer_end logic
    clock.tick(1000);

    // Allowing time for the chained timeouts for animation
    clock.tick(3000);
    wrapper.update();

    const types = dispatch.getCalls().map(call => call.args[0].type);

    assert.ok(types.includes(at.WIDGETS_TIMER_END));
    assert.ok(types.includes(at.WIDGETS_TIMER_SET_TYPE));

    const findTypeToggled = dispatch
      .getCalls()
      .map(call => call.args[0])
      .find(action => action.type === at.WIDGETS_TIMER_SET_TYPE);

    assert.equal(
      findTypeToggled.data.timerType,
      "focus",
      "timer should switch to focus mode"
    );
  });

  it("should pause when time input is focused", () => {
    const activeState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        timerType: "focus",
        focus: {
          ...mockState.TimerWidget.focus,
          isRunning: true,
        },
      },
    };

    const activeWrapper = mount(
      <WrapWithProvider state={activeState}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    const minutesSpan = activeWrapper.find(".timer-set-minutes").at(0);
    assert.ok(minutesSpan.exists());

    minutesSpan.simulate("focus");
    assert.equal(dispatch.getCall(0).args[0].type, at.WIDGETS_TIMER_PAUSE);
  });

  it("should reset to user's initial duration after timer ends", () => {
    const now = Math.floor(Date.now() / 1000);

    // mock up a user's initial duration (12 minutes)
    const initialUserDuration = 12 * 60;

    const endState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        timerType: "focus",
        focus: {
          duration: initialUserDuration,
          initialDuration: initialUserDuration,
          startTime: now - initialUserDuration,
          isRunning: true,
        },
      },
    };

    wrapper = mount(
      <WrapWithProvider state={endState}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    // Let interval fire and start the timer_end logic
    clock.tick(1000);

    // Allowing time for the chained timeouts for animation
    clock.tick(3000);
    wrapper.update();

    const endCall = dispatch
      .getCalls()
      .map(call => call.args[0])
      .find(action => action.type === at.WIDGETS_TIMER_END);

    assert.ok(
      endCall,
      "WIDGETS_TIMER_END should be dispatched when timer runs out"
    );
    assert.equal(
      endCall.data.duration,
      initialUserDuration,
      "timer should restore to user's initial input"
    );

    assert.equal(
      endCall.data.initialDuration,
      initialUserDuration,
      "initialDuration should also be restored to user's initial input"
    );
  });

  describe("context menu", () => {
    it("should render default context menu", () => {
      assert.ok(wrapper.find(".focus-timer-context-menu-button").exists());
      assert.ok(wrapper.find("#focus-timer-context-menu").exists());

      // "Turn notifications off" option
      assert.ok(
        wrapper
          .find(
            "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications']"
          )
          .exists()
      );

      assert.ok(
        wrapper
          .find("panel-item[data-l10n-id='newtab-widget-timer-menu-hide']")
          .exists()
      );

      assert.ok(
        wrapper
          .find(
            "panel-item[data-l10n-id='newtab-widget-timer-menu-learn-more']"
          )
          .exists()
      );

      // Make sure "Turn notifications on" is not there
      assert.isFalse(
        wrapper.contains(
          "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications-on']"
        )
      );
    });

    it("should render context menu with 'turn notifications on' if notifications are disabled", () => {
      const noNotificationsState = {
        ...mockState,
        Prefs: {
          ...INITIAL_STATE.Prefs,
          values: {
            ...INITIAL_STATE.Prefs.values,
            [PREF_WIDGETS_SYSTEM_NOTIFICATIONS_ENABLED]: false,
          },
        },
      };

      wrapper = mount(
        <WrapWithProvider state={noNotificationsState}>
          <FocusTimer
            dispatch={dispatch}
            handleUserInteraction={handleUserInteraction}
          />
        </WrapWithProvider>
      );

      // "Turn notifications on" option
      assert.ok(
        wrapper
          .find(
            "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications-on']"
          )
          .exists()
      );

      // Make sure "Turn notifications off" is not there
      assert.isFalse(
        wrapper.contains(
          "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications']"
        )
      );
    });

    it("should turn off notifications when the 'Turn off notifications' option is clicked", () => {
      const menuItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications']"
      );
      menuItem.props().onClick();

      assert.ok(dispatch.calledOnce);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.SET_PREF);
    });

    it("should hide Focus Timer when 'Hide timer' option is clicked", () => {
      const menuItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-widget-timer-menu-hide']"
      );
      menuItem.props().onClick();

      assert.ok(dispatch.calledOnce);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.SET_PREF);
    });

    it("should dispatch OPEN_LINK when the Learn More option is clicked", () => {
      const menuItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-widget-timer-menu-learn-more']"
      );
      menuItem.props().onClick();

      assert.ok(dispatch.calledOnce);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.OPEN_LINK);
    });
  });
});
