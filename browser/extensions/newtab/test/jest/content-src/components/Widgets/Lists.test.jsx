/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { WrapWithProvider } from "test/jest/test-utils";
import { actionTypes as at } from "common/Actions.mjs";
import { Lists } from "content-src/components/Widgets/Lists/Lists";

const mockState = {
  ...INITIAL_STATE,
  ListsWidget: {
    selected: "test-list",
    lists: {
      "test-list": {
        label: "test",
        tasks: [{ id: "1", value: "task", completed: false, isUrl: false }],
        completed: [],
      },
    },
  },
};

// jsdom's global crypto does not implement randomUUID, which the component uses
// to id new tasks/lists. Provide a deterministic-enough unique generator.
// jsdom's URL also lacks canParse, used to detect URL-shaped task values.
beforeEach(() => {
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: {
      randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}`,
    },
  });

  if (typeof URL.canParse !== "function") {
    URL.canParse = value => {
      try {
        // eslint-disable-next-line no-new
        new URL(value);
        return true;
      } catch {
        return false;
      }
    };
  }
});

// jsdom has no TransitionEvent, so fireEvent.transitionEnd cannot carry a
// propertyName. Build the native event manually so the handler's opacity check
// passes, and dispatch it through fireEvent so React state updates are wrapped
// in act().
function fireTransitionEnd(element, propertyName) {
  const transitionEvent = new Event("transitionend", { bubbles: true });
  Object.defineProperty(transitionEvent, "propertyName", {
    value: propertyName,
  });
  fireEvent(element, transitionEvent);
}

const defaultProps = {
  dispatch: jest.fn(),
  handleUserInteraction: jest.fn(),
  isMaximized: false,
  widgetsMayBeMaximized: false,
};

function makeState(prefOverrides = {}) {
  return {
    ...INITIAL_STATE,
    Prefs: {
      ...INITIAL_STATE.Prefs,
      values: { ...INITIAL_STATE.Prefs.values, ...prefOverrides },
    },
  };
}

describe("<Lists>", () => {
  let dispatch;
  let handleUserInteraction;

  beforeEach(() => {
    dispatch = jest.fn();
    handleUserInteraction = jest.fn();
  });

  function renderLists(state = mockState, props = {}) {
    return render(
      <WrapWithProvider state={state}>
        <Lists
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
          {...props}
        />
      </WrapWithProvider>
    );
  }

  it("should render", () => {
    const { container } = render(
      <WrapWithProvider>
        <Lists {...defaultProps} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".lists")).toBeInTheDocument();
  });

  it("should render the component and selected list", () => {
    const { container } = renderLists();
    const listsWidget = container.querySelector(".lists");

    expect(listsWidget).toBeInTheDocument();
    expect(listsWidget.classList.contains("medium-widget")).toBe(false);
    expect(listsWidget.classList.contains("large-widget")).toBe(true);
    expect(container.querySelectorAll("moz-select")).toHaveLength(0);
    expect(container.querySelectorAll(".lists-add-button")).toHaveLength(1);
    expect(container.querySelectorAll(".task-item")).toHaveLength(1);
  });

  it("uses the Checklist fallback title for an unnamed default list", () => {
    const state = {
      ...mockState,
      ListsWidget: {
        ...mockState.ListsWidget,
        lists: {
          "test-list": {
            ...mockState.ListsWidget.lists["test-list"],
            label: "",
          },
        },
      },
    };

    const { container } = renderLists(state);

    expect(
      container.querySelector(".lists-title").getAttribute("data-l10n-id")
    ).toBe("newtab-widget-lists-name-default");
  });

  it("adds explicit names to the icon-only menu buttons", () => {
    const { container } = renderLists();

    expect(
      container
        .querySelector("moz-button.lists-panel-button")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-widget-lists-menu-button");
    expect(
      container
        .querySelector(".task-item moz-button")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-menu-section-tooltip");
  });

  it("adds an explicit accessible name to the add-task input", () => {
    const { container } = renderLists();
    const input = container.querySelector("input.add-task-input");

    expect(input.getAttribute("data-l10n-id")).toBe(
      "newtab-widget-lists-input-add-an-item2"
    );
    expect(input.getAttribute("data-l10n-attrs")).toBe(
      "placeholder,aria-label"
    );
  });

  it("should update task input and add a new task on Enter key", () => {
    const { container } = renderLists();
    const input = container.querySelector("input.add-task-input");

    fireEvent.change(input, { target: { value: "nathan's cool task" } });
    // The component only saves when the add-task input is the active element.
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(dispatch).toHaveBeenCalled();
    const [[action]] = dispatch.mock.calls;
    expect(action.type).toBe(at.WIDGETS_LISTS_UPDATE);
    expect(
      action.data.lists["test-list"].tasks.some(
        task => task.value === "nathan's cool task"
      )
    ).toBe(true);
  });

  describe("task checkbox and label", () => {
    it("should toggle task completion", () => {
      const { container } = renderLists();
      const taskItem = container.querySelector(".task-item");
      const checkbox = container.querySelector("moz-checkbox");

      fireEvent.change(checkbox, { target: { checked: true } });
      // dispatch not called until the exit transition has ended
      expect(dispatch).toHaveBeenCalledTimes(0);
      fireTransitionEnd(taskItem, "opacity");

      expect(dispatch).toHaveBeenCalledTimes(3);
      const [[action], [oldTelemetryEvent], [newTelemetryEvent]] =
        dispatch.mock.calls;
      expect(action.type).toBe(at.WIDGETS_LISTS_UPDATE);
      expect(action.data.lists["test-list"].completed[0].completed).toBe(true);

      // Old telemetry event
      expect(oldTelemetryEvent.type).toBe(at.WIDGETS_LISTS_USER_EVENT);
      expect(oldTelemetryEvent.data.userAction).toBe("task_complete");

      // New unified telemetry event
      expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
      expect(newTelemetryEvent.data.widget_name).toBe("lists");
      expect(newTelemetryEvent.data.widget_source).toBe("widget");
      expect(newTelemetryEvent.data.user_action).toBe("task_complete");
      expect(newTelemetryEvent.data.widget_size).toBe("medium");
    });

    it("names the task checkbox after the task it belongs to", () => {
      // moz-checkbox keeps its input in the shadow DOM, so the task label cannot
      // name it through htmlFor -- the name has to be forwarded via aria-label.
      const { container } = renderLists();

      expect(
        container.querySelector("moz-checkbox").getAttribute("aria-label")
      ).toBe("task");
    });

    it("should un-complete a task when its completed label is clicked", () => {
      const { container } = renderLists({
        ...mockState,
        ListsWidget: {
          ...mockState.ListsWidget,
          lists: {
            "test-list": {
              label: "Checklist",
              tasks: [],
              completed: [
                { id: "done", value: "done", completed: true, isUrl: false },
              ],
            },
          },
        },
      });

      fireEvent.click(
        container.querySelector(".task-type-completed .task-label")
      );

      const [[action]] = dispatch.mock.calls;
      expect(action.type).toBe(at.WIDGETS_LISTS_UPDATE);
      expect(action.data.lists["test-list"].completed).toHaveLength(0);
      expect(action.data.lists["test-list"].tasks).toHaveLength(1);
      expect(action.data.lists["test-list"].tasks[0].completed).toBe(false);
    });

    it("should edit rather than complete a task when its label is clicked", () => {
      const { container } = renderLists();

      fireEvent.click(container.querySelector(".task-type-tasks .task-label"));

      expect(container.querySelectorAll("input.edit-task")).toHaveLength(1);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  it("should not dispatch an action when input is empty and Enter is pressed", () => {
    const { container } = renderLists();
    const input = container.querySelector("input.add-task-input");

    fireEvent.change(input, { target: { value: "" } });
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("should remove task when deleteTask is run from task item panel menu", () => {
    // confirm that there is a task available to delete
    expect(mockState.ListsWidget.lists["test-list"].tasks).toHaveLength(1);

    const { container } = renderLists();
    fireEvent.click(container.querySelector("panel-item.delete-item"));

    expect(dispatch).toHaveBeenCalledTimes(3);
    const [[action], [oldTelemetryEvent], [newTelemetryEvent]] =
      dispatch.mock.calls;
    expect(action.type).toBe(at.WIDGETS_LISTS_UPDATE);
    // Check that the task list is now empty
    expect(action.data.lists["test-list"].tasks).toHaveLength(0);

    // Old telemetry event
    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_LISTS_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("task_delete");

    // New unified telemetry event
    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("lists");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("task_delete");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");
  });

  it("should add a task with a valid URL and render it as a link", () => {
    const { container } = renderLists();
    const input = container.querySelector("input.add-task-input");
    const testUrl = "https://www.example.com";

    fireEvent.change(input, { target: { value: testUrl } });
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(dispatch).toHaveBeenCalledTimes(3);
    const [[action], [oldTelemetryEvent], [newTelemetryEvent]] =
      dispatch.mock.calls;
    expect(action.type).toBe(at.WIDGETS_LISTS_UPDATE);

    const newHyperlinkedTask = action.data.lists["test-list"].tasks.find(
      task => task.value === testUrl
    );
    expect(newHyperlinkedTask).toBeTruthy();
    expect(newHyperlinkedTask.isUrl).toBe(true);

    // Old telemetry event
    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_LISTS_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("task_create");

    // New unified telemetry event
    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("lists");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("task_create");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");
  });

  it("should dispatch list change when switcher selection changes", () => {
    const stateWithMultipleLists = {
      ...mockState,
      ListsWidget: {
        ...mockState.ListsWidget,
        lists: {
          "test-list": mockState.ListsWidget.lists["test-list"],
          "other-list": { label: "other", tasks: [], completed: [] },
        },
      },
    };

    const { container } = renderLists(stateWithMultipleLists);
    const switcherItems = container.querySelectorAll(
      "panel-list#lists-switcher-panel panel-item"
    );
    fireEvent.click(switcherItems[1]);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [[action]] = dispatch.mock.calls;
    expect(action.type).toBe(at.WIDGETS_LISTS_CHANGE_SELECTED);
    expect(action.data).toBe("other-list");
  });

  it("marks only the selected list as checked in the switcher", () => {
    const stateWithMultipleLists = {
      ...mockState,
      ListsWidget: {
        selected: "test-list",
        lists: {
          "test-list": { label: "Checklist", tasks: [], completed: [] },
          "other-list": { label: "Shopping", tasks: [], completed: [] },
        },
      },
    };

    const { container } = renderLists(stateWithMultipleLists);
    const firstSelectionItems = container.querySelectorAll(
      "panel-list#lists-switcher-panel panel-item"
    );
    expect(firstSelectionItems[0].hasAttribute("checked")).toBe(true);
    expect(firstSelectionItems[1].hasAttribute("checked")).toBe(false);

    const selectedSecond = renderLists({
      ...stateWithMultipleLists,
      ListsWidget: {
        ...stateWithMultipleLists.ListsWidget,
        selected: "other-list",
      },
    });
    const secondSelectionItems = selectedSecond.container.querySelectorAll(
      "panel-list#lists-switcher-panel panel-item"
    );
    expect(secondSelectionItems[0].hasAttribute("checked")).toBe(false);
    expect(secondSelectionItems[1].hasAttribute("checked")).toBe(true);
  });

  it("renders the compact layout when widgets are minimized", () => {
    const state = {
      ...mockState,
      ListsWidget: {
        ...mockState.ListsWidget,
        lists: {
          "test-list": {
            label: "test",
            tasks: [
              { id: "1", value: "task 1", completed: false, isUrl: false },
              { id: "2", value: "task 2", completed: false, isUrl: false },
              { id: "3", value: "task 3", completed: false, isUrl: false },
              { id: "4", value: "task 4", completed: false, isUrl: false },
            ],
            completed: [{ id: "done", value: "done", completed: true }],
          },
        },
      },
    };

    const { container } = renderLists(state, {
      isMaximized: false,
      widgetsMayBeMaximized: true,
    });
    const listsWidget = container.querySelector(".lists");

    expect(listsWidget.classList.contains("compact-widget")).toBe(true);
    expect(listsWidget.classList.contains("medium-widget")).toBe(true);
    expect(listsWidget.classList.contains("large-widget")).toBe(false);
    expect(listsWidget.classList.contains("has-visible-tasks")).toBe(true);
    expect(container.querySelectorAll(".lists-title")).toHaveLength(1);
    expect(
      container.querySelectorAll(".lists-add-button.icon-only")
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(".lists-add-action .lists-add-button")
    ).toHaveLength(0);
    expect(container.querySelectorAll(".lists-completed-button")).toHaveLength(
      0
    );
    expect(container.querySelectorAll("moz-checkbox")).toHaveLength(4);
    expect(container.querySelectorAll(".task-item")).toHaveLength(4);
    expect(container.querySelectorAll(".completed-task-wrapper")).toHaveLength(
      0
    );
  });

  it("renders the full layout as large when widgets are maximized", () => {
    const { container } = renderLists(mockState, {
      isMaximized: true,
      widgetsMayBeMaximized: true,
    });
    const listsWidget = container.querySelector(".lists");

    expect(listsWidget.classList.contains("large-widget")).toBe(true);
    expect(listsWidget.classList.contains("medium-widget")).toBe(false);
    expect(listsWidget.classList.contains("compact-widget")).toBe(false);
  });

  it("respects the Lists widget size pref when resized individually", () => {
    const state = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          "widgets.lists.size": "medium",
        },
      },
    };

    const { container } = renderLists(state, {
      isMaximized: true,
      widgetsMayBeMaximized: true,
    });
    const listsWidget = container.querySelector(".lists");

    expect(listsWidget.classList.contains("medium-widget")).toBe(true);
    expect(listsWidget.classList.contains("compact-widget")).toBe(true);
    expect(listsWidget.classList.contains("large-widget")).toBe(false);
  });

  it("disables the add button when the selected list is at the item limit", () => {
    const state = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          "widgets.lists.maxListItems": 1,
        },
      },
    };

    const { container } = renderLists(state);

    expect(
      container.querySelector(".lists-add-button").hasAttribute("disabled")
    ).toBe(true);
  });

  it("renders a list switcher in compact view when there are multiple lists", () => {
    const state = {
      ...mockState,
      ListsWidget: {
        ...mockState.ListsWidget,
        lists: {
          "test-list": {
            label: "Checklist",
            tasks: [{ id: "1", value: "task", completed: false, isUrl: false }],
            completed: [],
          },
          "other-list": { label: "Shopping", tasks: [], completed: [] },
        },
      },
    };

    const { container } = renderLists(state, {
      isMaximized: false,
      widgetsMayBeMaximized: true,
    });

    expect(container.querySelectorAll(".lists-switcher")).toHaveLength(1);
    expect(
      container.querySelectorAll(".lists-switcher .lists-title")
    ).toHaveLength(1);
    expect(
      container.querySelectorAll("moz-button.lists-switcher-button")
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(".lists-add-button.icon-only")
    ).toHaveLength(1);
  });

  it("adds an explicit accessible name to the list switcher button", () => {
    const { container } = renderLists({
      ...mockState,
      ListsWidget: {
        ...mockState.ListsWidget,
        lists: {
          "test-list": { label: "Checklist", tasks: [], completed: [] },
          "other-list": { label: "Shopping", tasks: [], completed: [] },
        },
      },
    });

    expect(
      container
        .querySelector("moz-button.lists-switcher-button")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-widget-lists-change-list");
  });

  it("uses the Checklist fallback title in the switcher for an unnamed selected list", () => {
    const state = {
      ...mockState,
      ListsWidget: {
        selected: "test-list",
        lists: {
          "test-list": { label: "", tasks: [], completed: [] },
          "other-list": { label: "Shopping", tasks: [], completed: [] },
        },
      },
    };

    const { container } = renderLists(state);

    expect(
      container
        .querySelector(".lists-switcher .lists-title")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-widget-lists-name-default");
  });

  it("does not render compact completed preview controls in medium view", () => {
    const state = {
      ...mockState,
      ListsWidget: {
        ...mockState.ListsWidget,
        lists: {
          "test-list": {
            label: "Checklist",
            tasks: [{ id: "1", value: "task", completed: false, isUrl: false }],
            completed: [
              { id: "done", value: "done", completed: true, isUrl: false },
            ],
          },
        },
      },
    };

    const { container } = renderLists(state, {
      isMaximized: false,
      widgetsMayBeMaximized: true,
    });

    expect(container.querySelectorAll(".lists-completed-button")).toHaveLength(
      0
    );
    expect(container.querySelectorAll(".task-type-tasks")).toHaveLength(1);
    expect(container.querySelectorAll(".task-type-completed")).toHaveLength(0);
  });

  it("dispatches list change in compact view when the selected list is empty", () => {
    const state = {
      ...mockState,
      ListsWidget: {
        selected: "empty-list",
        lists: {
          "test-list": {
            label: "Checklist",
            tasks: [{ id: "1", value: "task", completed: false, isUrl: false }],
            completed: [],
          },
          "empty-list": { label: "Shopping", tasks: [], completed: [] },
        },
      },
    };

    const { container } = renderLists(state, {
      isMaximized: false,
      widgetsMayBeMaximized: true,
    });

    expect(container.querySelectorAll(".empty-list")).toHaveLength(1);

    const switcherItems = container.querySelectorAll(
      "panel-list#lists-switcher-panel panel-item"
    );
    fireEvent.click(switcherItems[0]);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [[action]] = dispatch.mock.calls;
    expect(action.type).toBe(at.WIDGETS_LISTS_CHANGE_SELECTED);
    expect(action.data).toBe("test-list");
  });

  it("disables the add button when the selected list is at the item limit", () => {
    const state = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          "widgets.lists.maxListItems": 1,
        },
      },
    };

    const { container } = renderLists(state);

    expect(
      container.querySelector(".lists-add-button").hasAttribute("disabled")
    ).toBe(true);
  });

  it("should delete list and select a fallback list", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-delete']"
      )
    );

    expect(dispatch).toHaveBeenCalledTimes(4);
    const [
      [updateAction],
      [selectAction],
      [oldTelemetryEvent],
      [newTelemetryEvent],
    ] = dispatch.mock.calls;
    expect(updateAction.type).toBe(at.WIDGETS_LISTS_UPDATE);
    expect(selectAction.type).toBe(at.WIDGETS_LISTS_CHANGE_SELECTED);

    // Old telemetry event
    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_LISTS_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("list_delete");

    // New unified telemetry event
    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("lists");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("list_delete");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");
  });

  it("should update list name when edited and saved", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-edit']"
      )
    );

    const editableInput = container.querySelector("input.edit-list");
    fireEvent.change(editableInput, { target: { value: "Updated List" } });
    fireEvent.keyDown(editableInput, { key: "Enter" });

    expect(dispatch).toHaveBeenCalledTimes(3);
    const [[action], [oldTelemetryEvent], [newTelemetryEvent]] =
      dispatch.mock.calls;
    expect(action.type).toBe(at.WIDGETS_LISTS_UPDATE);
    expect(action.data.lists["test-list"].label).toBe("Updated List");

    // Old telemetry event
    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_LISTS_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("list_edit");

    // New unified telemetry event
    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("lists");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("list_edit");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");
  });

  it("adds an explicit accessible name to the list-name editor", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-edit']"
      )
    );

    const editableInput = container.querySelector("input.edit-list");
    expect(editableInput.getAttribute("data-l10n-id")).toBe(
      "newtab-widget-lists-menu-edit2"
    );
    expect(editableInput.getAttribute("data-l10n-attrs")).toBe("aria-label");
  });

  it("cancels list-name edits without saving", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-edit']"
      )
    );

    const editableInput = container.querySelector("input.edit-list");
    fireEvent.change(editableInput, { target: { value: "Updated List" } });

    const cancelButton = container.querySelector("moz-button.edit-list-clear");
    expect(cancelButton.getAttribute("data-l10n-id")).toBe(
      "newtab-widget-lists-edit-clear"
    );

    fireEvent.click(cancelButton);

    expect(container.querySelector("input.edit-list")).not.toBeInTheDocument();
    expect(container.querySelector(".lists-title").textContent).toBe("test");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("cancels list-name edits via Escape without saving", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-edit']"
      )
    );

    const editableInput = container.querySelector("input.edit-list");
    fireEvent.change(editableInput, { target: { value: "Updated List" } });
    fireEvent.keyDown(editableInput, { key: "Escape" });

    expect(container.querySelector("input.edit-list")).not.toBeInTheDocument();
    expect(container.querySelector(".lists-title").textContent).toBe("test");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not save edits when Escape restores focus and triggers blur", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-edit']"
      )
    );

    const editableInput = container.querySelector("input.edit-list");
    fireEvent.change(editableInput, { target: { value: "Updated List" } });
    fireEvent.keyDown(editableInput, { key: "Escape" });
    // In the real browser, restoring focus after Escape fires a blur on the
    // input whose relatedTarget lives outside the edit wrapper. The
    // cancelling guard is what keeps that from saving.
    fireEvent.blur(editableInput, { relatedTarget: document.body });

    expect(container.querySelector("input.edit-list")).not.toBeInTheDocument();
    expect(container.querySelector(".lists-title").textContent).toBe("test");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not save when blur moves focus to the cancel button", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-edit']"
      )
    );

    const editableInput = container.querySelector("input.edit-list");
    fireEvent.change(editableInput, { target: { value: "Updated List" } });

    const cancelButton = container.querySelector("moz-button.edit-list-clear");
    fireEvent.blur(editableInput, { relatedTarget: cancelButton });

    expect(container.querySelector("input.edit-list")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("opens draft list editing without creating a list yet", () => {
    const { container } = renderLists();
    fireEvent.click(container.querySelector("panel-item.create-list"));

    expect(dispatch).not.toHaveBeenCalled();
    const editableInput = container.querySelector("input.edit-list");
    expect(editableInput).toBeInTheDocument();
    expect(editableInput.getAttribute("data-l10n-id")).toBe(
      "newtab-widget-lists-name-placeholder-new2"
    );
    expect(editableInput.getAttribute("data-l10n-attrs")).toBe(
      "placeholder,aria-label"
    );
  });

  it("creates and selects a new list after confirming a non-empty draft name", () => {
    Object.defineProperty(global, "crypto", {
      configurable: true,
      value: { randomUUID: () => "new-list-id" },
    });

    const { container } = renderLists();
    fireEvent.click(container.querySelector("panel-item.create-list"));

    const editableInput = container.querySelector("input.edit-list");
    fireEvent.change(editableInput, { target: { value: "Groceries" } });
    fireEvent.keyDown(editableInput, { key: "Enter" });

    expect(dispatch).toHaveBeenCalledTimes(4);
    const [
      [updateAction],
      [selectAction],
      [oldTelemetryEvent],
      [newTelemetryEvent],
    ] = dispatch.mock.calls;
    expect(updateAction.type).toBe(at.WIDGETS_LISTS_UPDATE);
    expect(updateAction.data.lists["new-list-id"].label).toBe("Groceries");
    expect(selectAction.type).toBe(at.WIDGETS_LISTS_CHANGE_SELECTED);
    expect(selectAction.data).toBe("new-list-id");

    // Old telemetry event
    expect(oldTelemetryEvent.type).toBe(at.WIDGETS_LISTS_USER_EVENT);
    expect(oldTelemetryEvent.data.userAction).toBe("list_create");

    // New unified telemetry event
    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("lists");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("list_create");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");
  });

  it("does not create a list when draft creation is cancelled with Escape", () => {
    const { container } = renderLists();
    fireEvent.click(container.querySelector("panel-item.create-list"));

    fireEvent.keyDown(container.querySelector("input.edit-list"), {
      key: "Escape",
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(container.querySelector("input.edit-list")).not.toBeInTheDocument();
  });

  it("keeps a draft list name when blurred without pressing Enter", () => {
    const { container } = renderLists();
    fireEvent.click(container.querySelector("panel-item.create-list"));

    const editableInput = container.querySelector("input.edit-list");
    fireEvent.change(editableInput, { target: { value: "Groceries" } });
    fireEvent.blur(editableInput);

    expect(dispatch).not.toHaveBeenCalled();
    expect(container.querySelector("input.edit-list")).toBeInTheDocument();
    expect(container.querySelector("input.edit-list").value).toBe("Groceries");
  });

  it("should copy the current list to clipboard with correct formatting", () => {
    const writeText = jest.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const copyState = {
      ...mockState,
      ListsWidget: {
        selected: "test-list",
        lists: {
          "test-list": {
            label: "test",
            tasks: [
              { id: "1", value: "task 1", completed: false, isUrl: false },
              { id: "2", value: "task 2", completed: true, isUrl: false },
            ],
            completed: [],
          },
        },
      },
    };

    const { container } = renderLists(copyState);
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-copy']"
      )
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    const [[copiedText]] = writeText.mock.calls;
    expect(copiedText).toContain("List: test");
    expect(copiedText).toContain("- [ ] task 1");
    expect(copiedText).toContain("- [x] task 2");

    // Confirm list_copy telemetry events
    expect(dispatch).toHaveBeenCalledTimes(2);
    const [[copyEvent], [newTelemetryEvent]] = dispatch.mock.calls;
    expect(copyEvent.type).toBe(at.WIDGETS_LISTS_USER_EVENT);
    expect(copyEvent.data.userAction).toBe("list_copy");

    expect(newTelemetryEvent.type).toBe(at.WIDGETS_USER_EVENT);
    expect(newTelemetryEvent.data.widget_name).toBe("lists");
    expect(newTelemetryEvent.data.widget_source).toBe("widget");
    expect(newTelemetryEvent.data.user_action).toBe("list_copy");
    expect(newTelemetryEvent.data.widget_size).toBe("medium");
  });

  it("should reorder tasks via reorder event", () => {
    const task1 = { id: "1", value: "task 1", completed: false, isUrl: false };
    const task2 = { id: "2", value: "task 2", completed: false, isUrl: false };

    const reorderState = {
      ...mockState,
      ListsWidget: {
        selected: "test-list",
        lists: {
          "test-list": { label: "test", tasks: [task1, task2], completed: [] },
        },
      },
    };

    const { container } = renderLists(reorderState);
    const reorderNode = container.querySelector("moz-reorderable-list");

    // Simulate moving task2 before task1
    const event = new CustomEvent("reorder", {
      detail: {
        draggedElement: { id: "2" },
        targetElement: { id: "1" },
        position: -1,
      },
      bubbles: true,
    });
    reorderNode.dispatchEvent(event);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [[action]] = dispatch.mock.calls;
    expect(action.type).toBe(at.WIDGETS_LISTS_UPDATE);
    expect(action.data.lists["test-list"].tasks).toEqual([task2, task1]);
  });

  it("should hide Lists widget when 'Hide widget' option is clicked", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-menu-hide']"
      )
    );

    expect(dispatch).toHaveBeenCalledTimes(2);
    const [[setPrefAction], [telemetryEvent]] = dispatch.mock.calls;
    expect(setPrefAction.type).toBe(at.SET_PREF);
    expect(setPrefAction.data.name).toBe("widgets.lists.enabled");
    expect(setPrefAction.data.value).toBe(false);

    expect(telemetryEvent.type).toBe(at.WIDGETS_ENABLED);
    expect(telemetryEvent.data.widget_name).toBe("lists");
    expect(telemetryEvent.data.widget_source).toBe("context_menu");
    expect(telemetryEvent.data.enabled).toBe(false);
    expect(telemetryEvent.data.widget_size).toBe("medium");

    expect(handleUserInteraction).not.toHaveBeenCalled();
  });

  it("adds an explicit accessible name to the task editor", () => {
    const { container } = renderLists();
    fireEvent.click(container.querySelector(".task-label"));

    const editableInput = container.querySelector("input.edit-task");
    expect(editableInput.getAttribute("data-l10n-id")).toBe(
      "newtab-widget-lists-input-menu-edit2"
    );
    expect(editableInput.getAttribute("data-l10n-attrs")).toBe("aria-label");
  });

  it("should dispatch OPEN_LINK when the Learn More option is clicked", () => {
    const { container } = renderLists();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-lists-menu-learn-more']"
      )
    );

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [[action]] = dispatch.mock.calls;
    expect(action.type).toBe(at.OPEN_LINK);
    expect(action.data.where).toBe("tab");
  });

  it("disables Create new list action (in the panel list) when at the max lists limit", () => {
    const stateAtMax = {
      ...mockState,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "widgets.lists.maxLists": 1,
        },
      },
    };

    const { container } = renderLists(stateAtMax);
    const createListBtn = container.querySelector("panel-item.create-list");
    expect(createListBtn.hasAttribute("disabled")).toBe(true);
  });

  it("overrides `widgets.lists.maxLists` pref when below `1` value", () => {
    const state = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          "widgets.lists.maxLists": 0,
        },
      },
    };

    const { container } = renderLists(state);
    // with 1 existing list, and maxLists coerced to 1, it should be disabled
    const createListBtn = container.querySelector("panel-item.create-list");
    expect(createListBtn.hasAttribute("disabled")).toBe(true);
  });

  it("disables Create List option when at the maximum lists limit", () => {
    const state = {
      ...mockState,
      ListsWidget: {
        ...mockState.ListsWidget,
        lists: {
          "list-1": { label: "A", tasks: [], completed: [] },
          "list-2": { label: "B", tasks: [], completed: [] },
        },
      },
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          "widgets.lists.maxLists": 2,
        },
      },
    };

    const { container } = renderLists(state);
    // with 2 existing lists, and maxLists set to 2, it should be disabled
    const createListBtn = container.querySelector("panel-item.create-list");
    expect(createListBtn.hasAttribute("disabled")).toBe(true);
  });

  it("disables add-task input when at maximum list items limit", () => {
    // total items = tasks + completed = 3
    const state = {
      ...mockState,
      ListsWidget: {
        selected: "test-list",
        lists: {
          "test-list": {
            label: "test",
            tasks: [
              { id: "1", value: "task 1", completed: false, isUrl: false },
              { id: "2", value: "task 2", completed: false, isUrl: false },
            ],
            completed: [
              { id: "c1", value: "done", completed: true, isUrl: false },
            ],
          },
        },
      },
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs?.values,
          // At limit (3), so input should be disabled and icon greyed
          "widgets.lists.maxListItems": 3,
        },
      },
    };

    const { container } = renderLists(state);
    const input = container.querySelector("input.add-task-input");
    const addIcon = container.querySelector(
      ".add-task-container .icon.icon-add"
    );

    expect(input.hasAttribute("disabled")).toBe(true);
    expect(addIcon.classList.contains("icon-disabled")).toBe(true);
  });

  it("enables add-task input when at maximum list items limit", () => {
    const state = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs?.values,
          "widgets.lists.maxListItems": 5,
        },
      },
    };

    const { container } = renderLists(state);
    const input = container.querySelector("input.add-task-input");
    const addIcon = container.querySelector(
      ".add-task-container .icon.icon-add"
    );

    expect(input.hasAttribute("disabled")).toBe(false);
    expect(addIcon.classList.contains("icon-disabled")).toBe(false);
  });
});

describe("<Lists> size submenu (nova)", () => {
  let dispatch;
  let handleUserInteraction;

  const novaState = {
    ...mockState,
    Prefs: {
      ...mockState.Prefs,
      values: {
        ...mockState.Prefs.values,
        "nova.enabled": true,
        "widgets.lists.size": "medium",
      },
    },
  };

  beforeEach(() => {
    dispatch = jest.fn();
    handleUserInteraction = jest.fn();
  });

  function renderLists(state, props = {}) {
    return render(
      <WrapWithProvider state={state}>
        <Lists
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
          {...props}
        />
      </WrapWithProvider>
    );
  }

  it("does not render size submenu when nova is disabled", () => {
    const { container } = renderLists(mockState);
    expect(
      container.querySelector("panel-list[id='lists-size-submenu']")
    ).not.toBeInTheDocument();
  });

  it("renders size submenu with medium/large items when nova is enabled", () => {
    const { container } = renderLists(novaState, {
      widgetsMayBeMaximized: true,
    });
    const submenu = container.querySelector(
      "panel-list[id='lists-size-submenu']"
    );
    expect(submenu).toBeInTheDocument();

    const items = submenu.querySelectorAll("panel-item");
    expect(items).toHaveLength(2);
    expect(
      submenu.querySelector("panel-item[data-size='medium']")
    ).toBeInTheDocument();
    expect(
      submenu.querySelector("panel-item[data-size='large']")
    ).toBeInTheDocument();
  });

  it("marks the current size as checked and others as undefined", () => {
    const { container } = renderLists(novaState, {
      widgetsMayBeMaximized: true,
    });
    const submenu = container.querySelector(
      "panel-list[id='lists-size-submenu']"
    );
    const mediumItem = submenu.querySelector("panel-item[data-size='medium']");
    const largeItem = submenu.querySelector("panel-item[data-size='large']");

    expect(mediumItem.hasAttribute("checked")).toBe(true);
    expect(largeItem.hasAttribute("checked")).toBe(false);
  });

  it("treats a stale small pref as medium in Nova", () => {
    const staleSmallState = {
      ...novaState,
      Prefs: {
        ...novaState.Prefs,
        values: {
          ...novaState.Prefs.values,
          "widgets.lists.size": "small",
        },
      },
    };

    const { container } = renderLists(staleSmallState, {
      widgetsMayBeMaximized: true,
    });

    expect(container.querySelector(".lists.medium-widget")).toBeInTheDocument();
    expect(
      container.querySelector(".lists.small-widget")
    ).not.toBeInTheDocument();

    const submenu = container.querySelector(
      "panel-list[id='lists-size-submenu']"
    );
    const mediumItem = submenu.querySelector("panel-item[data-size='medium']");
    expect(mediumItem.hasAttribute("checked")).toBe(true);
  });

  it("dispatches SET_PREF and WIDGETS_USER_EVENT when clicking a size item", () => {
    const { container } = renderLists(novaState, {
      widgetsMayBeMaximized: true,
    });
    const submenuNode = container.querySelector(
      "panel-list[id='lists-size-submenu']"
    );
    const mockItem = document.createElement("div");
    mockItem.dataset.size = "large";
    const event = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(event, "composedPath", { value: () => [mockItem] });
    submenuNode.dispatchEvent(event);

    expect(dispatch).toHaveBeenCalledTimes(2);
    const [[setPrefAction], [telemetryAction]] = dispatch.mock.calls;
    expect(setPrefAction.type).toBe(at.SET_PREF);
    expect(setPrefAction.data.name).toBe("widgets.lists.size");
    expect(setPrefAction.data.value).toBe("large");
    expect(telemetryAction.type).toBe(at.WIDGETS_USER_EVENT);
  });
});

describe("<Lists> change-size context menu item", () => {
  it("hides submenu when nova is disabled", () => {
    const { container } = render(
      <WrapWithProvider state={makeState({ "nova.enabled": false })}>
        <Lists {...defaultProps} widgetsMayBeMaximized={true} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(
        "span[data-l10n-id='newtab-widget-menu-change-size']"
      )
    ).not.toBeInTheDocument();
  });

  it("hides submenu when nova is enabled but widgetsMayBeMaximized is false", () => {
    const { container } = render(
      <WrapWithProvider state={makeState({ "nova.enabled": true })}>
        <Lists {...defaultProps} widgetsMayBeMaximized={false} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(
        "span[data-l10n-id='newtab-widget-menu-change-size']"
      )
    ).not.toBeInTheDocument();
  });

  it("shows submenu when nova is enabled and widgetsMayBeMaximized is true", () => {
    const { container } = render(
      <WrapWithProvider state={makeState({ "nova.enabled": true })}>
        <Lists {...defaultProps} widgetsMayBeMaximized={true} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(
        "span[data-l10n-id='newtab-widget-menu-change-size']"
      )
    ).toBeInTheDocument();
  });
});
