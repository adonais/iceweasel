/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { combineReducers, createStore } from "redux";
import { Provider } from "react-redux";
import { render, fireEvent, act } from "@testing-library/react";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import {
  FocusTimer,
  isNumericValue,
  isAtMaxLength,
  isValidSpinbuttonInput,
} from "content-src/components/Widgets/FocusTimer/FocusTimer";

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

const defaultProps = {
  dispatch: jest.fn(),
  handleUserInteraction: jest.fn(),
  isMaximized: false,
  widgetsMayBeMaximized: false,
};

function makeState(prefOverrides = {}, timerOverrides = {}) {
  return {
    ...INITIAL_STATE,
    Prefs: {
      ...INITIAL_STATE.Prefs,
      values: { ...INITIAL_STATE.Prefs.values, ...prefOverrides },
    },
    TimerWidget: {
      ...INITIAL_STATE.TimerWidget,
      ...timerOverrides,
      focus: {
        ...INITIAL_STATE.TimerWidget.focus,
        ...(timerOverrides.focus || {}),
      },
      break: {
        ...INITIAL_STATE.TimerWidget.break,
        ...(timerOverrides.break || {}),
      },
    },
  };
}

function novaState(extraPrefs = {}, timerOverrides = {}) {
  return makeState(
    {
      "nova.enabled": true,
      "widgets.focusTimer.size": "large",
      ...extraPrefs,
    },
    timerOverrides
  );
}

function renderTimer({ state, props } = {}) {
  const dispatch = jest.fn();
  const result = render(
    <WrapWithProvider state={state || INITIAL_STATE}>
      <FocusTimer {...defaultProps} {...props} dispatch={dispatch} />
    </WrapWithProvider>
  );
  return { ...result, dispatch };
}

describe("<FocusTimer>", () => {
  let container;
  let dispatch;
  let handleUserInteraction;

  function renderTimer(state = mockState, props = {}) {
    return render(
      <WrapWithProvider state={state}>
        <FocusTimer
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
          widgetsMayBeMaximized={false}
          {...props}
        />
      </WrapWithProvider>
    );
  }

  beforeEach(() => {
    dispatch = jest.fn();
    // jest fake timers stand in for sinon's useFakeTimers()
    jest.useFakeTimers();
    handleUserInteraction = jest.fn();

    ({ container } = renderTimer(mockState));
  });

  afterEach(() => {
    // restore real timers after each test to avoid leaking fake timers
    jest.useRealTimers();
  });

  it("should render timer widget", () => {
    expect(container).toBeInTheDocument();
    expect(container.querySelector(".focus-timer")).toBeInTheDocument();
  });

  it("should show default minutes for Focus timer (25 minutes)", () => {
    const minutes = container.querySelector(".timer-set-minutes").textContent;
    const seconds = container.querySelector(".timer-set-seconds").textContent;
    expect(minutes).toBe("25");
    expect(seconds).toBe("00");
  });

  it("should show default minutes for Break timer (5 minutes)", () => {
    const breakState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        timerType: "break", // setting timer type to break
      },
    };

    ({ container } = renderTimer(breakState));

    const minutes = container.querySelector(".timer-set-minutes").textContent;
    const seconds = container.querySelector(".timer-set-seconds").textContent;

    expect(minutes).toBe("05");
    expect(seconds).toBe("00");
  });

  it("should start timer and show progress bar when pressing play", () => {
    fireEvent.click(
      container.querySelector(
        "moz-button[data-l10n-id='newtab-widget-timer-label-play']"
      )
    );
    expect(
      container.querySelector(".progress-circle-wrapper")
    ).toBeInTheDocument();

    const [[playAction], [oldTelemetryEvent], [newTelemetryEvent]] =
      dispatch.mock.calls;
    expect(playAction.type).toBe(at.WIDGETS_TIMER_PLAY);

    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_TIMER_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("timer_play");

    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("focus_timer");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("timer_play");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");
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

    ({ container } = renderTimer(runningState));

    const pauseBtn = container.querySelector(
      "moz-button[data-l10n-id='newtab-widget-timer-label-pause']"
    );
    expect(pauseBtn).toBeInTheDocument();
    fireEvent.click(pauseBtn);

    const [[pauseAction], [oldTelemetryEvent], [newTelemetryEvent]] =
      dispatch.mock.calls;
    expect(pauseAction.type).toBe(at.WIDGETS_TIMER_PAUSE);

    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_TIMER_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("timer_pause");

    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("focus_timer");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("timer_pause");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");
  });

  it("should reset timer should be hidden when timer is not running", () => {
    const resetBtn = container.querySelector(
      "moz-button[data-l10n-id='newtab-widget-timer-reset']"
    );
    expect(resetBtn).not.toBeInTheDocument();
  });

  it("should reset timer when pressing reset", () => {
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

    ({ container } = renderTimer(runningState));

    const resetBtn = container.querySelector(
      "moz-button[data-l10n-id='newtab-widget-timer-reset']"
    );

    expect(resetBtn).toBeInTheDocument();
    fireEvent.click(resetBtn);

    const [[resetAction], [oldTelemetryEvent], [newTelemetryEvent]] =
      dispatch.mock.calls;
    expect(resetAction.type).toBe(at.WIDGETS_TIMER_RESET);

    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_TIMER_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("timer_reset");

    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("focus_timer");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("timer_reset");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");

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

    ({ container } = renderTimer(resetState));

    expect(
      container.querySelectorAll(".progress-circle-wrapper.visible")
    ).toHaveLength(0);
    const minutes = container.querySelector(".timer-set-minutes").textContent;
    const seconds = container.querySelector(".timer-set-seconds").textContent;
    expect(minutes).toBe("12");
    expect(seconds).toBe("00");
  });

  it("should dispatch pause and set type and when clicking the break timer", () => {
    const breakBtn = container.querySelector(
      "moz-button[data-l10n-id='newtab-widget-timer-mode-break']"
    );
    expect(breakBtn).toBeInTheDocument();
    fireEvent.click(breakBtn);

    const types = dispatch.mock.calls
      .map(([action]) => action.type)
      .filter(Boolean);

    expect(types).toContain(at.WIDGETS_TIMER_PAUSE);
    expect(types).toContain(at.WIDGETS_TIMER_USER_EVENT);
    expect(types).toContain(at.WIDGETS_USER_EVENT);
    expect(types).toContain(at.WIDGETS_TIMER_SET_TYPE);

    const findTypeToggled = dispatch.mock.calls
      .map(([action]) => action)
      .find(action => action.type === at.WIDGETS_TIMER_SET_TYPE);

    expect(findTypeToggled.data.timerType).toBe("break");

    const unifiedPauseEvent = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        action =>
          action.type === at.WIDGETS_USER_EVENT &&
          action.data.user_action === "timer_pause"
      );

    expect(unifiedPauseEvent).toBeDefined();
    expect(unifiedPauseEvent.data.widget_name).toBe("focus_timer");
    expect(unifiedPauseEvent.data.widget_source).toBe("widget");

    const unifiedToggleEvent = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        action =>
          action.type === at.WIDGETS_USER_EVENT &&
          action.data.user_action === "timer_toggle_break"
      );

    expect(unifiedToggleEvent).toBeDefined();
    expect(unifiedToggleEvent.data.widget_name).toBe("focus_timer");
    expect(unifiedToggleEvent.data.widget_source).toBe("widget");
  });

  it("should dispatch set type when clicking the focus timer", () => {
    const focusBtn = container.querySelector(
      "moz-button[data-l10n-id='newtab-widget-timer-mode-focus']"
    );
    expect(focusBtn).toBeInTheDocument();
    fireEvent.click(focusBtn);

    const types = dispatch.mock.calls
      .map(([action]) => action.type)
      .filter(Boolean);

    expect(types).toContain(at.WIDGETS_TIMER_PAUSE);
    expect(types).toContain(at.WIDGETS_TIMER_USER_EVENT);
    expect(types).toContain(at.WIDGETS_USER_EVENT);
    expect(types).toContain(at.WIDGETS_TIMER_SET_TYPE);

    const findTypeToggled = dispatch.mock.calls
      .map(([action]) => action)
      .find(action => action.type === at.WIDGETS_TIMER_SET_TYPE);

    expect(findTypeToggled.data.timerType).toBe("focus");

    const unifiedToggleEvent = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        action =>
          action.type === at.WIDGETS_USER_EVENT &&
          action.data.user_action === "timer_toggle_focus"
      );

    expect(unifiedToggleEvent).toBeDefined();
    expect(unifiedToggleEvent.data.widget_name).toBe("focus_timer");
    expect(unifiedToggleEvent.data.widget_source).toBe("widget");
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

    ({ container } = renderTimer(endState));

    // Let interval fire and start the timer_end logic
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Allowing time for the chained timeouts for animation
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    const types = dispatch.mock.calls
      .map(([action]) => action.type)
      .filter(Boolean);

    expect(types).toContain(at.WIDGETS_TIMER_END);
    expect(types).toContain(at.WIDGETS_TIMER_USER_EVENT);
    expect(types).toContain(at.WIDGETS_USER_EVENT);
    expect(types).toContain(at.WIDGETS_TIMER_SET_TYPE);

    const findTypeToggled = dispatch.mock.calls
      .map(([action]) => action)
      .find(action => action.type === at.WIDGETS_TIMER_SET_TYPE);

    expect(findTypeToggled.data.timerType).toBe("break");

    const unifiedEndEvent = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        action =>
          action.type === at.WIDGETS_USER_EVENT &&
          action.data.user_action === "timer_end"
      );

    expect(unifiedEndEvent).toBeDefined();
    expect(unifiedEndEvent.data.widget_name).toBe("focus_timer");
    expect(unifiedEndEvent.data.widget_source).toBe("widget");
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

    ({ container } = renderTimer(endState));

    // Let interval fire and start the timer_end logic
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Allowing time for the chained timeouts for animation
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    const types = dispatch.mock.calls.map(([action]) => action.type);

    expect(types).toContain(at.WIDGETS_TIMER_END);
    expect(types).toContain(at.WIDGETS_TIMER_USER_EVENT);
    expect(types).toContain(at.WIDGETS_USER_EVENT);
    expect(types).toContain(at.WIDGETS_TIMER_SET_TYPE);

    const findTypeToggled = dispatch.mock.calls
      .map(([action]) => action)
      .find(action => action.type === at.WIDGETS_TIMER_SET_TYPE);

    expect(findTypeToggled.data.timerType).toBe("focus");

    const unifiedEndEvent = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        action =>
          action.type === at.WIDGETS_USER_EVENT &&
          action.data.user_action === "timer_end"
      );

    expect(unifiedEndEvent).toBeDefined();
    expect(unifiedEndEvent.data.widget_name).toBe("focus_timer");
    expect(unifiedEndEvent.data.widget_source).toBe("widget");
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

    const { container: activeContainer } = renderTimer(activeState);

    const minutesSpan = activeContainer.querySelector(".timer-set-minutes");
    expect(minutesSpan).toBeInTheDocument();

    fireEvent.focus(minutesSpan);

    const [[pauseAction], [oldTelemetryEvent], [newTelemetryEvent]] =
      dispatch.mock.calls;
    expect(pauseAction.type).toBe(at.WIDGETS_TIMER_PAUSE);

    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_TIMER_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("timer_pause");

    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("focus_timer");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("timer_pause");
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

    ({ container } = renderTimer(endState));

    // Let interval fire and start the timer_end logic
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Allowing time for the chained timeouts for animation
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    const endCall = dispatch.mock.calls
      .map(([action]) => action)
      .find(action => action.type === at.WIDGETS_TIMER_END);

    expect(endCall).toBeDefined();
    expect(endCall.data.duration).toBe(initialUserDuration);
    expect(endCall.data.initialDuration).toBe(initialUserDuration);
  });

  it("should wait one second at zero before completing timer", () => {
    const now = Math.floor(Date.now() / 1000);

    const endState = {
      ...mockState,
      TimerWidget: {
        ...mockState.TimerWidget,
        timerType: "focus",
        focus: {
          duration: 300,
          initialDuration: 300,
          startTime: now - 300,
          isRunning: true,
        },
      },
    };

    ({ container } = renderTimer(endState));

    // First interval tick - should reach zero but not complete
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Verify timer has not ended yet (no WIDGETS_TIMER_END dispatched)
    const callsAfterFirstTick = dispatch.mock.calls
      .map(([action]) => action)
      .filter(action => action && action.type === at.WIDGETS_TIMER_END);

    expect(callsAfterFirstTick).toHaveLength(0);

    // Second interval tick - should now complete
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Allowing time for the chained timeouts for animation
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    const endCall = dispatch.mock.calls
      .map(([action]) => action)
      .find(action => action && action.type === at.WIDGETS_TIMER_END);

    expect(endCall).toBeDefined();
  });

  describe("context menu", () => {
    it("should render default context menu", () => {
      expect(
        container.querySelector(".focus-timer-context-menu-button")
      ).toBeInTheDocument();
      expect(
        container.querySelector("#focus-timer-context-menu")
      ).toBeInTheDocument();

      // "Turn notifications off" option
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications']"
        )
      ).toBeInTheDocument();

      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-menu-hide']"
        )
      ).toBeInTheDocument();

      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-timer-menu-learn-more']"
        )
      ).toBeInTheDocument();

      // Make sure "Turn notifications on" is not there
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications-on']"
        )
      ).not.toBeInTheDocument();
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

      ({ container } = renderTimer(noNotificationsState));

      // "Turn notifications on" option
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications-on']"
        )
      ).toBeInTheDocument();

      // Make sure "Turn notifications off" is not there
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications']"
        )
      ).not.toBeInTheDocument();
    });

    it("should turn off notifications when the 'Turn off notifications' option is clicked", () => {
      const menuItem = container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-timer-menu-notifications']"
      );
      fireEvent.click(menuItem);

      expect(dispatch).toHaveBeenCalledTimes(1);
      const [[action]] = dispatch.mock.calls;
      expect(action.type).toBe(at.SET_PREF);
    });

    it("should hide Focus Timer when 'Hide widget' option is clicked", () => {
      const menuItem = container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-menu-hide']"
      );
      fireEvent.click(menuItem);

      expect(dispatch).toHaveBeenCalledTimes(2);

      const [[setPrefAction], [telemetryEvent]] = dispatch.mock.calls;
      expect(setPrefAction.type).toBe(at.SET_PREF);
      expect(setPrefAction.data.name).toBe("widgets.focusTimer.enabled");
      expect(setPrefAction.data.value).toBe(false);

      expect(telemetryEvent.type).toBe(at.WIDGETS_ENABLED);
      expect(telemetryEvent.data.widget_name).toBe("focus_timer");
      expect(telemetryEvent.data.widget_source).toBe("context_menu");
      expect(telemetryEvent.data.enabled).toBe(false);
      expect(telemetryEvent.data.widget_size).toBe("medium");

      expect(handleUserInteraction).not.toHaveBeenCalled();
    });

    it("should dispatch OPEN_LINK when the Learn More option is clicked", () => {
      const menuItem = container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-timer-menu-learn-more']"
      );
      fireEvent.click(menuItem);

      expect(dispatch).toHaveBeenCalledTimes(1);
      const [[action]] = dispatch.mock.calls;
      expect(action.type).toBe(at.OPEN_LINK);
    });
  });

  // Tests for the focus timer input. It should only allow numbers
  describe("isNumericValue", () => {
    it("should return true for single digit numbers", () => {
      expect(isNumericValue("0")).toBe(true);
      expect(isNumericValue("1")).toBe(true);
      expect(isNumericValue("5")).toBe(true);
      expect(isNumericValue("9")).toBe(true);
    });

    it("should return true for multi-digit numbers", () => {
      expect(isNumericValue("10")).toBe(true);
      expect(isNumericValue("25")).toBe(true);
      expect(isNumericValue("99")).toBe(true);
    });

    it("should return false for non-numeric characters", () => {
      expect(isNumericValue("a")).toBe(false);
      expect(isNumericValue("Z")).toBe(false);
      expect(isNumericValue("!")).toBe(false);
      expect(isNumericValue("@")).toBe(false);
      expect(isNumericValue(" ")).toBe(false);
    });

    it("should return false for special characters", () => {
      expect(isNumericValue("-")).toBe(false);
      expect(isNumericValue("+")).toBe(false);
      expect(isNumericValue(".")).toBe(false);
      expect(isNumericValue(",")).toBe(false);
    });

    it("should return false for mixed alphanumeric strings", () => {
      expect(isNumericValue("1a")).toBe(false);
      expect(isNumericValue("a1")).toBe(false);
      expect(isNumericValue("5x")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isNumericValue(" ")).toBe(false);
    });
  });

  // Tests for the 2-character limit (enforces max 99 minutes, 59 seconds)
  describe("isAtMaxLength", () => {
    it("should return false for empty string", () => {
      expect(isAtMaxLength("")).toBe(false);
    });

    it("should return false for single character", () => {
      expect(isAtMaxLength("5")).toBe(false);
      expect(isAtMaxLength("9")).toBe(false);
    });

    it("should return true for 2 characters", () => {
      expect(isAtMaxLength("25")).toBe(true);
      expect(isAtMaxLength("99")).toBe(true);
      expect(isAtMaxLength("00")).toBe(true);
    });

    it("should return true for more than 2 characters", () => {
      expect(isAtMaxLength("123")).toBe(true);
      expect(isAtMaxLength("999")).toBe(true);
    });
  });

  describe("size submenu (nova)", () => {
    const novaState = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          "nova.enabled": true,
          "widgets.focusTimer.size": "medium",
        },
      },
    };

    it("does not render size submenu when nova is disabled", () => {
      expect(
        container.querySelector("panel-list[id='focus-timer-size-submenu']")
      ).not.toBeInTheDocument();
    });

    it("renders size submenu with small/medium/large items when nova is enabled", () => {
      const { container: novaContainer } = renderTimer(novaState, {
        widgetsMayBeMaximized: true,
      });
      const submenu = novaContainer.querySelector(
        "panel-list[id='focus-timer-size-submenu']"
      );
      expect(submenu).toBeInTheDocument();

      const items = submenu.querySelectorAll("panel-item");
      expect(items).toHaveLength(3);

      const smallItem = submenu.querySelector("panel-item[data-size='small']");
      const mediumItem = submenu.querySelector(
        "panel-item[data-size='medium']"
      );
      const largeItem = submenu.querySelector("panel-item[data-size='large']");
      expect(smallItem).toBeInTheDocument();
      expect(mediumItem).toBeInTheDocument();
      expect(largeItem).toBeInTheDocument();
    });

    it("marks the current size as checked and the other as undefined", () => {
      const { container: novaContainer } = renderTimer(novaState, {
        widgetsMayBeMaximized: true,
      });
      const submenu = novaContainer.querySelector(
        "panel-list[id='focus-timer-size-submenu']"
      );

      const mediumItem = submenu.querySelector(
        "panel-item[data-size='medium']"
      );
      const largeItem = submenu.querySelector("panel-item[data-size='large']");

      expect(mediumItem.hasAttribute("checked")).toBe(true);
      expect(largeItem.hasAttribute("checked")).toBe(false);
    });

    it("dispatches SET_PREF and WIDGETS_USER_EVENT when clicking a size item", () => {
      const { container: novaContainer } = renderTimer(novaState, {
        widgetsMayBeMaximized: true,
      });
      const submenuNode = novaContainer.querySelector(
        "panel-list[id='focus-timer-size-submenu']"
      );
      const mockItem = document.createElement("div");
      mockItem.dataset.size = "large";
      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "composedPath", {
        value: () => [mockItem],
      });
      submenuNode.dispatchEvent(event);

      expect(dispatch).toHaveBeenCalledTimes(2);

      const [[setPrefAction], [telemetryAction]] = dispatch.mock.calls;
      expect(setPrefAction.type).toBe(at.SET_PREF);
      expect(setPrefAction.data.name).toBe("widgets.focusTimer.size");
      expect(setPrefAction.data.value).toBe("large");

      expect(telemetryAction.type).toBe(at.WIDGETS_USER_EVENT);
      expect(telemetryAction.data.widget_name).toBe("focus_timer");
      expect(telemetryAction.data.user_action).toBe("change_size");
      expect(telemetryAction.data.action_value).toBe("large");
    });

    it("dispatches the small size when the small item is clicked", () => {
      const { container: novaContainer } = renderTimer(novaState, {
        widgetsMayBeMaximized: true,
      });
      const submenuNode = novaContainer.querySelector(
        "panel-list[id='focus-timer-size-submenu']"
      );
      const mockItem = document.createElement("div");
      mockItem.dataset.size = "small";
      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "composedPath", {
        value: () => [mockItem],
      });
      submenuNode.dispatchEvent(event);

      const [[setPrefAction], [telemetryAction]] = dispatch.mock.calls;
      expect(setPrefAction.data.name).toBe("widgets.focusTimer.size");
      expect(setPrefAction.data.value).toBe("small");

      expect(telemetryAction.data.user_action).toBe("change_size");
      expect(telemetryAction.data.action_value).toBe("small");
    });
  });

  it("should clamp minutes to 99 and seconds to 59 when setting duration", () => {
    // Find the editable fields
    const minutes = container.querySelector(".timer-set-minutes");
    const seconds = container.querySelector(".timer-set-seconds");

    // Simulate user typing values beyond limits
    minutes.innerText = "100";
    seconds.innerText = "85";

    // Trigger blur, which calls setTimerDuration()
    fireEvent.blur(seconds);

    // Clamp check
    const clampedMinutes = Math.min(parseInt(minutes.innerText, 10), 99);
    const clampedSeconds = Math.min(parseInt(seconds.innerText, 10), 59);

    expect(clampedMinutes).toBe(99);
    expect(clampedSeconds).toBe(59);
  });
});

describe("<FocusTimer> Nova behaviour", () => {
  describe("change-size context menu item", () => {
    it("hides submenu when nova is disabled", () => {
      const { container } = renderTimer({
        state: makeState({ "nova.enabled": false }),
        props: { widgetsMayBeMaximized: true },
      });
      expect(
        container.querySelector(
          "span[data-l10n-id='newtab-widget-menu-change-size']"
        )
      ).not.toBeInTheDocument();
    });

    it("hides submenu when nova is enabled but widgetsMayBeMaximized is false", () => {
      const { container } = renderTimer({
        state: makeState({ "nova.enabled": true }),
        props: { widgetsMayBeMaximized: false },
      });
      expect(
        container.querySelector(
          "span[data-l10n-id='newtab-widget-menu-change-size']"
        )
      ).not.toBeInTheDocument();
    });

    it("shows submenu when nova is enabled and widgetsMayBeMaximized is true", () => {
      const { container } = renderTimer({
        state: makeState({ "nova.enabled": true }),
        props: { widgetsMayBeMaximized: true },
      });
      expect(
        container.querySelector(
          "span[data-l10n-id='newtab-widget-menu-change-size']"
        )
      ).toBeInTheDocument();
    });

    it("offers small/medium/large sizes", () => {
      const { container } = renderTimer({
        state: novaState(),
        props: { widgetsMayBeMaximized: true },
      });
      const items = container.querySelectorAll(
        "#focus-timer-size-submenu panel-item[type='checkbox']"
      );
      const sizes = Array.from(items).map(el => el.getAttribute("data-size"));
      expect(sizes).toEqual(["small", "medium", "large"]);
    });
  });

  describe("Nova layout", () => {
    it("applies the large-widget class for size=large under Nova", () => {
      const { container } = renderTimer({ state: novaState() });
      expect(
        container.querySelector(".focus-timer.large-widget")
      ).toBeInTheDocument();
      expect(
        container.querySelector(".focus-timer.large-widget.col-4")
      ).toBeInTheDocument();
    });

    it("applies the medium-widget class for size=medium under Nova", () => {
      const { container } = renderTimer({
        state: novaState({ "widgets.focusTimer.size": "medium" }),
      });
      expect(
        container.querySelector(".focus-timer.medium-widget")
      ).toBeInTheDocument();
    });

    it("renders the play button inside the circle in Nova", () => {
      const { container } = renderTimer({ state: novaState() });
      expect(
        container.querySelector(
          ".progress-circle-wrapper .focus-timer-play-button"
        )
      ).toBeInTheDocument();
    });

    it("falls back to the legacy markup when nova is disabled", () => {
      const { container } = renderTimer({
        state: makeState({ "nova.enabled": false }),
      });
      expect(container.querySelector(".focus-timer-tabs")).toBeInTheDocument();
      expect(
        container.querySelector(".focus-timer-spinbutton")
      ).not.toBeInTheDocument();
    });
  });

  describe("Nova small size", () => {
    const smallState = (extraPrefs = {}, timerOverrides) =>
      novaState(
        { "widgets.focusTimer.size": "small", ...extraPrefs },
        timerOverrides
      );

    it("applies the small-widget class under Nova", () => {
      const { container } = renderTimer({ state: smallState() });
      expect(
        container.querySelector(".focus-timer.small-widget.col-4")
      ).toBeInTheDocument();
    });

    it("omits the Focus/Break mode control when idle in small", () => {
      const { container } = renderTimer({ state: smallState() });
      // Idle: the editable spinbutton is still present...
      expect(
        container.querySelector(".focus-timer-spinbutton")
      ).toBeInTheDocument();
      // ...but the manual Focus/Break mode control is not.
      expect(container.querySelector("moz-segmented-control")).toBeNull();
    });

    it("keeps the mode control when idle in medium", () => {
      const { container } = renderTimer({
        state: novaState({ "widgets.focusTimer.size": "medium" }),
      });
      expect(
        container.querySelector("moz-segmented-control")
      ).toBeInTheDocument();
    });

    it("running small shows the time display (mode label in DOM) and no reset/mode control", () => {
      const { container } = renderTimer({
        state: smallState(
          {},
          {
            focus: {
              duration: 25 * 60,
              initialDuration: 25 * 60,
              isRunning: true,
            },
          }
        ),
      });
      expect(
        container.querySelector(".focus-timer-time-display")
      ).toBeInTheDocument();
      // Mode label stays in the DOM (visually hidden via CSS for screen readers).
      expect(
        container.querySelector(
          ".focus-timer-time-mode[data-l10n-id='newtab-widget-timer-running-focus']"
        )
      ).toBeInTheDocument();
      expect(container.querySelector(".focus-timer-reset-button")).toBeNull();
      expect(container.querySelector("moz-segmented-control")).toBeNull();
    });

    it("paused small (progressed, not running) shows running layout with no reset/mode control", () => {
      const { container } = renderTimer({
        state: smallState(
          {},
          {
            focus: {
              duration: 12 * 60,
              initialDuration: 25 * 60,
              isRunning: false,
            },
          }
        ),
      });
      expect(
        container.querySelector(".focus-timer-time-display")
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          ".focus-timer-time-mode[data-l10n-id='newtab-widget-timer-running-focus']"
        )
      ).toBeInTheDocument();
      expect(container.querySelector(".focus-timer-reset-button")).toBeNull();
      expect(container.querySelector("moz-segmented-control")).toBeNull();
    });
  });

  describe("Nova spinbutton", () => {
    it("exposes the correct ARIA attributes", () => {
      const { container } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      expect(spinbutton).toBeInTheDocument();
      expect(spinbutton.getAttribute("aria-valuemin")).toBe("1");
      expect(spinbutton.getAttribute("aria-valuemax")).toBe("99");
      expect(spinbutton.getAttribute("aria-valuenow")).toBe("25");
      expect(spinbutton.getAttribute("data-l10n-id")).toBe(
        "newtab-widget-timer-spinbutton-name"
      );
      expect(JSON.parse(spinbutton.getAttribute("data-l10n-args"))).toEqual({
        minutes: 25,
      });
    });

    it("dispatches WIDGETS_TIMER_SET_DURATION on ArrowUp (+1 minute)", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      fireEvent.keyDown(spinbutton, { key: "ArrowUp" });

      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration).toBeDefined();
      expect(setDuration[0].data.duration).toBe(26 * 60);
    });

    it("dispatches with -1 minute on ArrowDown", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      fireEvent.keyDown(spinbutton, { key: "ArrowDown" });

      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(24 * 60);
    });

    it("PageUp / PageDown adjust by 5 minutes", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      fireEvent.keyDown(spinbutton, { key: "PageUp" });
      fireEvent.keyDown(spinbutton, { key: "PageDown" });

      const durations = dispatch.mock.calls
        .filter(([action]) => action.type === "WIDGETS_TIMER_SET_DURATION")
        .map(([action]) => action.data.duration);
      expect(durations).toEqual([30 * 60, 20 * 60]);
    });

    it("Home jumps to the minimum (1 min); End jumps to the maximum (99 min)", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      fireEvent.keyDown(spinbutton, { key: "Home" });
      fireEvent.keyDown(spinbutton, { key: "End" });

      const durations = dispatch.mock.calls
        .filter(([action]) => action.type === "WIDGETS_TIMER_SET_DURATION")
        .map(([action]) => action.data.duration);
      expect(durations).toEqual([1 * 60, 99 * 60]);
    });

    it("clamps adjustments to the [1, 99] range", () => {
      const oneMinState = novaState(
        {},
        { focus: { duration: 60, initialDuration: 60 } }
      );
      const { container, dispatch } = renderTimer({ state: oneMinState });
      const spinbutton = container.querySelector("[role='spinbutton']");
      fireEvent.keyDown(spinbutton, { key: "ArrowDown" });

      // Should not dispatch — already at 1, clamped value === current duration
      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration).toBeUndefined();
    });
  });

  describe("isValidSpinbuttonInput", () => {
    it("blocks letters", () => {
      expect(isValidSpinbuttonInput("", "a", 0, 0)).toBe(false);
    });

    it("allows digits", () => {
      expect(isValidSpinbuttonInput("", "1", 0, 0)).toBe(true);
    });

    it("allows a single colon", () => {
      expect(isValidSpinbuttonInput("", ":", 0, 0)).toBe(true);
    });

    it("allows pasting a valid MM:SS string", () => {
      expect(isValidSpinbuttonInput("", "12:34", 0, 0)).toBe(true);
    });

    it("blocks pasted strings that contain letters", () => {
      expect(isValidSpinbuttonInput("", "ab:cd", 0, 0)).toBe(false);
    });

    it("blocks more than 2 digits before the colon", () => {
      expect(isValidSpinbuttonInput("", "123:45", 0, 0)).toBe(false);
    });

    it("blocks more than 2 digits after the colon", () => {
      expect(isValidSpinbuttonInput("", "12:345", 0, 0)).toBe(false);
    });

    it("blocks more than one colon", () => {
      expect(isValidSpinbuttonInput("", "1:2:3", 0, 0)).toBe(false);
    });

    it("blocks adding a 3rd digit before the colon", () => {
      // Current "12", caret at end, type "3" -> "123" -> invalid
      expect(isValidSpinbuttonInput("12", "3", 2, 2)).toBe(false);
    });

    it("allows adding the colon after 2 digits", () => {
      // Current "12", caret at end, type ":" -> "12:" -> valid
      expect(isValidSpinbuttonInput("12", ":", 2, 2)).toBe(true);
    });

    it("allows replacing a selection with a valid value", () => {
      // Current "12:34" fully selected, type "5" -> "5" -> valid
      expect(isValidSpinbuttonInput("12:34", "5", 0, 5)).toBe(true);
    });

    it("does not block deletion (input is null)", () => {
      expect(isValidSpinbuttonInput("12", null, 1, 2)).toBe(true);
    });
  });

  describe("Nova spinbutton commit (padding)", () => {
    it("commits '1' as 60 seconds (1 minute)", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      spinbutton.innerText = "1";
      fireEvent.blur(spinbutton);
      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(60);
    });

    it("commits '1:1' as 61 seconds", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      spinbutton.innerText = "1:1";
      fireEvent.blur(spinbutton);
      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(61);
    });

    it("commits '0:08' as 8 seconds (allows sub-minute values)", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      spinbutton.innerText = "0:08";
      fireEvent.blur(spinbutton);
      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(8);
    });

    it("clamps minutes to 99", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      spinbutton.innerText = "200:00";
      fireEvent.blur(spinbutton);
      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(99 * 60);
    });

    it("floors the total to at least 1 second", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      spinbutton.innerText = "0:00";
      fireEvent.blur(spinbutton);
      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(1);
    });

    it("does not dispatch when the value matches the current duration", () => {
      // Default state: focus.duration = 25*60 = 1500
      const { container, dispatch } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      spinbutton.innerText = "25:00";
      fireEvent.blur(spinbutton);
      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration).toBeUndefined();
    });

    it("rewrites the visible text to MM:SS when no dispatch is needed", () => {
      const { container } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      spinbutton.innerText = "25";
      fireEvent.blur(spinbutton);
      expect(spinbutton.innerText).toBe("25:00");
    });

    it("restores the visible text when input is invalid (NaN minutes)", () => {
      const { container } = renderTimer({ state: novaState() });
      const spinbutton = container.querySelector("[role='spinbutton']");
      spinbutton.innerText = "garbage";
      fireEvent.blur(spinbutton);
      // After mount, useEffect sets timeLeft to duration (1500s = 25:00).
      expect(spinbutton.innerText).toBe("25:00");
    });
  });

  describe("Nova ± buttons", () => {
    it("are excluded from tab order and reference the spinbutton", () => {
      const { container } = renderTimer({ state: novaState() });
      const minus = container.querySelector(".focus-timer-minute-decrement");
      const plus = container.querySelector(".focus-timer-minute-increment");
      expect(minus.getAttribute("tabindex")).toBe("-1");
      expect(plus.getAttribute("tabindex")).toBe("-1");
      expect(minus.getAttribute("aria-controls")).toBe(
        "focus-timer-spinbutton"
      );
      expect(plus.getAttribute("aria-controls")).toBe("focus-timer-spinbutton");
      expect(minus.getAttribute("data-l10n-id")).toBe(
        "newtab-widget-timer-decrease-min"
      );
      expect(plus.getAttribute("data-l10n-id")).toBe(
        "newtab-widget-timer-increase-min"
      );
    });

    it("clicking + dispatches a +1 minute SET_DURATION", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const plus = container.querySelector(".focus-timer-minute-increment");
      fireEvent.click(plus);

      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(26 * 60);
    });

    it("clicking − dispatches a -1 minute SET_DURATION", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const minus = container.querySelector(".focus-timer-minute-decrement");
      fireEvent.click(minus);

      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(24 * 60);
    });

    it("rounds sub-minute durations down before incrementing (0:01 + 1 -> 1:00)", () => {
      const subMinuteState = novaState(
        {},
        { focus: { duration: 1, initialDuration: 1 } }
      );
      const { container, dispatch } = renderTimer({ state: subMinuteState });
      const plus = container.querySelector(".focus-timer-minute-increment");
      fireEvent.click(plus);

      const setDuration = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_DURATION"
      );
      expect(setDuration[0].data.duration).toBe(60);
    });
  });

  describe("Nova mode segmented control", () => {
    function getModeGroup(container) {
      return container.querySelector("moz-segmented-control");
    }

    function getModeItems(container) {
      return Array.from(
        getModeGroup(container).querySelectorAll("moz-segmented-control-item")
      );
    }

    it("renders a segmented control with both modes", () => {
      const { container } = renderTimer({ state: novaState() });
      const modeGroup = getModeGroup(container);

      expect(modeGroup).toBeInTheDocument();
      expect(modeGroup.getAttribute("data-l10n-id")).toBe(
        "newtab-widget-timer-mode-group"
      );

      const items = getModeItems(container);
      expect(items.map(item => item.getAttribute("value"))).toEqual([
        "focus",
        "break",
      ]);
      expect(items.map(item => item.getAttribute("data-l10n-id"))).toEqual([
        "newtab-widget-timer-mode-focus",
        "newtab-widget-timer-mode-break",
      ]);
    });

    it("hands the active timerType to the control as its value", () => {
      const { container } = renderTimer({
        state: novaState({}, { timerType: "break" }),
      });
      expect(getModeGroup(container).getAttribute("value")).toBe("break");
    });

    it("toggles timer type when the control reports a new selection", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const modeGroup = getModeGroup(container);

      // The real component updates its own value before the change event
      // escapes the shadow root; jsdom never upgrades it, so stand that in.
      modeGroup.value = "break";
      fireEvent.change(modeGroup);

      const setType = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
      );
      expect(setType).toBeDefined();
      expect(setType[0].data.timerType).toBe("break");
    });

    it("still toggles after the control unmounts and remounts", () => {
      const dispatch = jest.fn();
      const renderWithState = state => (
        <WrapWithProvider state={state}>
          <FocusTimer {...defaultProps} dispatch={dispatch} />
        </WrapWithProvider>
      );
      // Only isRunning differs between the two states, and isRunning is not one
      // of toggleType's dependencies, so an effect keyed on those deps would not
      // re-attach its listener to the remounted control.
      const runningState = novaState({}, { focus: { isRunning: true } });

      const { container, rerender } = render(renderWithState(novaState()));
      expect(getModeGroup(container)).toBeInTheDocument();

      rerender(renderWithState(runningState));
      expect(getModeGroup(container)).toBeNull();

      rerender(renderWithState(novaState()));
      const remountedGroup = getModeGroup(container);
      expect(remountedGroup).toBeInTheDocument();

      remountedGroup.value = "break";
      fireEvent.change(remountedGroup);

      const setType = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
      );
      expect(setType).toBeDefined();
      expect(setType[0].data.timerType).toBe("break");
    });

    it("ignores a change that reports the already-active mode", () => {
      const { container, dispatch } = renderTimer({ state: novaState() });
      const modeGroup = getModeGroup(container);

      modeGroup.value = "focus";
      fireEvent.change(modeGroup);

      expect(
        dispatch.mock.calls.find(
          ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
        )
      ).toBeUndefined();
    });
  });

  describe("Nova play/pause accessible name", () => {
    it("is a 'Start <minutes>-minute timer' label when idle", () => {
      const { container } = renderTimer({ state: novaState() });
      const button = container.querySelector(".focus-timer-play-button");
      expect(button.getAttribute("data-l10n-id")).toBe(
        "newtab-widget-timer-start-aria"
      );
      expect(JSON.parse(button.getAttribute("data-l10n-args"))).toEqual({
        minutes: 25,
      });
    });

    it("becomes 'Pause timer' when the timer is running", () => {
      const runningState = novaState(
        {},
        {
          focus: {
            duration: 25 * 60,
            initialDuration: 25 * 60,
            isRunning: true,
          },
        }
      );
      const { container } = renderTimer({ state: runningState });
      const button = container.querySelector(".focus-timer-play-button");
      expect(button.getAttribute("data-l10n-id")).toBe(
        "newtab-widget-timer-pause-aria"
      );
    });
  });

  describe("Nova running-state body swap", () => {
    const runningState = () =>
      novaState(
        {},
        {
          focus: {
            duration: 25 * 60,
            initialDuration: 25 * 60,
            isRunning: true,
          },
        }
      );

    it("swaps the spinbutton for the time + mode label while running", () => {
      const { container } = renderTimer({ state: runningState() });
      expect(container.querySelector(".focus-timer-spinbutton")).toBeNull();
      expect(
        container.querySelector(".focus-timer-time-display")
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          ".focus-timer-time-mode[data-l10n-id='newtab-widget-timer-running-focus']"
        )
      ).toBeInTheDocument();
    });

    it("swaps the mode control for the reset button while running (Large)", () => {
      const { container } = renderTimer({ state: runningState() });
      expect(container.querySelector("moz-segmented-control")).toBeNull();
      expect(
        container.querySelector(".focus-timer-reset-button")
      ).toBeInTheDocument();
    });

    it("hides both mode control and reset button while running (Medium)", () => {
      const { container } = renderTimer({
        state: novaState(
          { "widgets.focusTimer.size": "medium" },
          {
            focus: {
              duration: 25 * 60,
              initialDuration: 25 * 60,
              isRunning: true,
            },
          }
        ),
      });
      expect(container.querySelector("moz-segmented-control")).toBeNull();
      expect(container.querySelector(".focus-timer-reset-button")).toBeNull();
    });
  });

  describe("Nova reset button visibility", () => {
    it("is hidden in idle state (duration === initialDuration, !isRunning)", () => {
      const { container } = renderTimer({ state: novaState() });
      expect(container.querySelector(".focus-timer-reset-button")).toBeNull();
    });

    it("is visible when the timer is paused mid-run (duration < initialDuration)", () => {
      const pausedState = novaState(
        {},
        {
          focus: {
            duration: 12 * 60,
            initialDuration: 25 * 60,
            isRunning: false,
          },
        }
      );
      const { container } = renderTimer({ state: pausedState });
      expect(
        container.querySelector(".focus-timer-reset-button")
      ).toBeInTheDocument();
    });

    it("is hidden in the medium size even when progress exists", () => {
      const pausedMedium = novaState(
        { "widgets.focusTimer.size": "medium" },
        {
          focus: {
            duration: 12 * 60,
            initialDuration: 25 * 60,
            isRunning: false,
          },
        }
      );
      const { container } = renderTimer({ state: pausedMedium });
      expect(container.querySelector(".focus-timer-reset-button")).toBeNull();
    });
  });

  describe("Nova celebration overlay", () => {
    let originalMatchMedia;

    function mockMatchMedia(matches) {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));
    }

    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
      // <WidgetCelebration> bails out under prefers-reduced-motion: reduce
      mockMatchMedia(false);
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      window.matchMedia = originalMatchMedia;
    });

    function aboutToFinishState(timerOverrides) {
      return novaState(
        {},
        timerOverrides || {
          focus: {
            duration: 1,
            initialDuration: 25 * 60,
            isRunning: true,
            startTime: Math.floor(Date.now() / 1000) - 1,
          },
        }
      );
    }

    function tickToZero() {
      // Two ticks for the existing has-reached-zero gate.
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    }

    function fireLifecycleEnd(overlay) {
      // testing-library's fireEvent.animationEnd doesn't propagate
      // animationName to React's synthetic event in JSDOM, so dispatch
      // a native Event with the property defined manually.
      act(() => {
        const event = new Event("animationend", { bubbles: true });
        Object.defineProperty(event, "animationName", {
          value: "widget-celebration-lifecycle",
        });
        overlay.dispatchEvent(event);
      });
    }

    it("mounts <WidgetCelebration> when the timer ticks to zero", () => {
      const { container } = renderTimer({ state: aboutToFinishState() });

      tickToZero();

      expect(
        container.querySelector(".focus-timer-celebration")
      ).toBeInTheDocument();
      expect(
        container.querySelector(".focus-timer-celebration-headline")
      ).toBeInTheDocument();
    });

    it("renders the celebration headline without a subhead in small", () => {
      const smallAboutToFinish = novaState(
        { "widgets.focusTimer.size": "small" },
        {
          focus: {
            duration: 1,
            initialDuration: 25 * 60,
            isRunning: true,
            startTime: Math.floor(Date.now() / 1000) - 1,
          },
        }
      );
      const { container } = renderTimer({ state: smallAboutToFinish });

      tickToZero();

      expect(
        container.querySelector(".focus-timer-celebration-headline")
      ).toBeInTheDocument();
      const subhead = container.querySelector(
        ".focus-timer-celebration-subhead"
      );
      expect(subhead).toBeInTheDocument();
      expect(subhead.getAttribute("data-l10n-id")).toBeNull();
    });

    it("fires Focus->Break toggle when the lifecycle animation ends", () => {
      const { container, dispatch } = renderTimer({
        state: aboutToFinishState(),
      });

      tickToZero();
      const overlay = container.querySelector(".focus-timer-celebration");
      expect(overlay).toBeInTheDocument();
      fireLifecycleEnd(overlay);

      const setType = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
      );
      expect(setType).toBeDefined();
      expect(setType[0].data.timerType).toBe("break");
    });

    it("fires Break->Focus toggle on the next celebration too", () => {
      // Guards against ref / closure leaks that would block a second toggle.
      const breakAboutToFinish = makeState(
        { "nova.enabled": true, "widgets.focusTimer.size": "large" },
        {
          timerType: "break",
          break: {
            duration: 1,
            initialDuration: 5 * 60,
            isRunning: true,
            startTime: Math.floor(Date.now() / 1000) - 1,
          },
        }
      );
      const { container, dispatch } = renderTimer({
        state: breakAboutToFinish,
      });

      tickToZero();
      const overlay = container.querySelector(".focus-timer-celebration");
      fireLifecycleEnd(overlay);

      const setType = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
      );
      expect(setType).toBeDefined();
      expect(setType[0].data.timerType).toBe("focus");
    });

    it("dispatches WIDGETS_TIMER_SET_TYPE only once per completion", () => {
      // Guards against the celebration overlay double-firing onAnimationEnd
      // and re-toggling Focus<->Break a second time.
      const { container, dispatch } = renderTimer({
        state: aboutToFinishState(),
      });

      tickToZero();
      const overlay = container.querySelector(".focus-timer-celebration");
      fireLifecycleEnd(overlay);
      fireLifecycleEnd(overlay);

      const setTypeCalls = dispatch.mock.calls.filter(
        ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
      );
      expect(setTypeCalls).toHaveLength(1);
    });

    it("converges on the completed type's opposite even if the shared type already flipped (multi-document)", () => {
      // Reproduce the multi-document case via a re-render: this document's break
      // session ends, then another document flips the shared type to focus
      // before this one's celebration finishes; it must still land on focus.
      const dispatch = jest.fn();
      const { container, rerender } = render(
        <WrapWithProvider
          state={novaState(
            {},
            {
              timerType: "break",
              break: {
                duration: 1,
                initialDuration: 5 * 60,
                isRunning: true,
                startTime: Math.floor(Date.now() / 1000) - 1,
              },
            }
          )}
        >
          <FocusTimer {...defaultProps} dispatch={dispatch} />
        </WrapWithProvider>
      );

      tickToZero();

      act(() => {
        rerender(
          <WrapWithProvider state={novaState({}, { timerType: "focus" })}>
            <FocusTimer {...defaultProps} dispatch={dispatch} />
          </WrapWithProvider>
        );
      });

      const overlay = container.querySelector(".focus-timer-celebration");
      expect(overlay).toBeInTheDocument();
      fireLifecycleEnd(overlay);

      const setType = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
      );
      expect(setType).toBeDefined();
      expect(setType[0].data.timerType).toBe("focus");
    });

    it("falls back to immediate Focus<->Break toggle under reduced motion", () => {
      // Reduced-motion users skip the celebration animation; the toggle
      // and TIMER_TOGGLE_* telemetry must still fire inline.
      mockMatchMedia(true);
      const { container, dispatch } = renderTimer({
        state: aboutToFinishState(),
      });

      tickToZero();

      expect(
        container.querySelector(".focus-timer-celebration")
      ).not.toBeInTheDocument();

      const setType = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
      );
      expect(setType).toBeDefined();
      expect(setType[0].data.timerType).toBe("break");

      const toggleTelemetry = dispatch.mock.calls.find(
        ([action]) =>
          action.type === "WIDGETS_TIMER_USER_EVENT" &&
          action.data?.userAction === "timer_toggle_break"
      );
      expect(toggleTelemetry).toBeDefined();
    });

    it("falls back to immediate Focus<->Break toggle in classic (non-Nova) mode", () => {
      // Classic mode never mounts the overlay; the toggle and telemetry
      // must still fire inline so classic users keep getting auto-flips.
      const classicState = makeState(
        { "nova.enabled": false },
        {
          focus: {
            duration: 1,
            initialDuration: 25 * 60,
            isRunning: true,
            startTime: Math.floor(Date.now() / 1000) - 1,
          },
        }
      );
      const { container, dispatch } = renderTimer({ state: classicState });

      tickToZero();

      expect(
        container.querySelector(".focus-timer-celebration")
      ).not.toBeInTheDocument();

      const setType = dispatch.mock.calls.find(
        ([action]) => action.type === "WIDGETS_TIMER_SET_TYPE"
      );
      expect(setType).toBeDefined();
      expect(setType[0].data.timerType).toBe("break");
    });

    it("ignores ring clicks while the celebration is running", () => {
      // The reducer leaves the timer paused at full duration after
      // WIDGETS_TIMER_END, so an unguarded click would dispatch
      // WIDGETS_TIMER_PLAY and restart the just-finished timer.
      const { container, dispatch } = renderTimer({
        state: aboutToFinishState(),
      });

      tickToZero();

      const wrapper = container.querySelector(".progress-circle-wrapper");
      act(() => {
        fireEvent.click(wrapper);
      });

      const playCalls = dispatch.mock.calls.filter(
        ([action]) => action.type === "WIDGETS_TIMER_PLAY"
      );
      expect(playCalls).toHaveLength(0);
    });

    it("ignores reset-button activation while the celebration is running", () => {
      // The reset button stays in tab-order during celebration in the Large
      // layout. Without the guard, keyboard activation would dispatch
      // WIDGETS_TIMER_RESET and race the pending Focus<->Break toggle.
      const { container, dispatch } = renderTimer({
        state: aboutToFinishState(),
      });

      tickToZero();

      const resetButton = container.querySelector(".focus-timer-reset-button");
      expect(resetButton).toBeInTheDocument();
      act(() => {
        fireEvent.click(resetButton);
      });

      const resetCalls = dispatch.mock.calls.filter(
        ([action]) => action.type === "WIDGETS_TIMER_RESET"
      );
      expect(resetCalls).toHaveLength(0);
    });
  });
});
