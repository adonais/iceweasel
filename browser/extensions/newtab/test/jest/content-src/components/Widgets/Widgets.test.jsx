import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { Provider } from "react-redux";
import { createStore, combineReducers } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { Widgets } from "content-src/components/Widgets/Widgets";

const ENABLED_STATE = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      "widgets.enabled": true,
      "widgets.lists.enabled": true,
      "widgets.system.lists.enabled": true,
    },
  },
  ListsWidget: {
    selected: "list-1",
    lists: {
      "list-1": {
        label: "My List",
        tasks: [],
        completed: [],
      },
    },
  },
};

describe("<Widgets>", () => {
  it("should not render without any enabled widgets", () => {
    const store = createStore(combineReducers(reducers), INITIAL_STATE);
    const { container } = render(
      <Provider store={store}>
        <Widgets />
      </Provider>
    );
    expect(container.querySelector(".widgets-wrapper")).not.toBeInTheDocument();
  });

  it("should render when a widget is enabled", () => {
    const { container } = render(
      <WrapWithProvider state={ENABLED_STATE}>
        <Widgets />
      </WrapWithProvider>
    );
    expect(container.querySelector(".widgets-wrapper")).toBeInTheDocument();
  });
});
