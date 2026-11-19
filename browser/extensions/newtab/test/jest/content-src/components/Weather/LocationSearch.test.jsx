import { render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore, combineReducers } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { WrapWithProvider } from "test/jest/test-utils";
import { LocationSearch } from "content-src/components/Weather/LocationSearch";

const baseState = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      "nova.enabled": false,
      "system.showWeatherOptIn": false,
      "weather.optInAccepted": false,
    },
  },
  Weather: {
    ...INITIAL_STATE.Weather,
    suggestedLocations: [],
    locationSearchString: "",
  },
};

function renderLocationSearch(state = baseState) {
  const store = createStore(combineReducers(reducers), state);
  jest.spyOn(store, "dispatch");
  const { container } = render(
    <Provider store={store}>
      <LocationSearch outerClassName="weather" />
    </Provider>
  );
  return { container, dispatch: store.dispatch };
}

function setSearchValue(container, value) {
  const input = container.querySelector(".location-input");
  Object.defineProperty(input, "value", {
    configurable: true,
    writable: true,
    value,
  });
  fireEvent.input(input);
}

function dispatchedActions(dispatch) {
  return dispatch.mock.calls.map(([action]) => action);
}

describe("<LocationSearch>", () => {
  it("should render", () => {
    const { container } = render(
      <WrapWithProvider>
        <LocationSearch outerClassName="weather" />
      </WrapWithProvider>
    );
    expect(container.querySelector(".location-search")).toBeInTheDocument();
  });

  it("adds an explicit accessible name to the back button", () => {
    const { container } = renderLocationSearch();
    expect(container.querySelector(".location-search-back")).toHaveAttribute(
      "data-l10n-id",
      "newtab-weather-search-back-button"
    );
  });

  describe("use current location button", () => {
    it("hides the button when nova is disabled", () => {
      const { container } = renderLocationSearch();
      expect(
        container.querySelector(
          "[data-l10n-id='newtab-weather-change-location-search-use-current']"
        )
      ).not.toBeInTheDocument();
    });

    it("shows the button when nova is enabled and weatherOptIn is false", () => {
      const state = {
        ...baseState,
        Prefs: {
          ...baseState.Prefs,
          values: { ...baseState.Prefs.values, "nova.enabled": true },
        },
      };
      const { container } = renderLocationSearch(state);
      expect(
        container.querySelector(
          "[data-l10n-id='newtab-weather-change-location-search-use-current']"
        )
      ).toBeInTheDocument();
    });

    it("shows the button when nova is enabled, weatherOptIn is true, and user has accepted", () => {
      const state = {
        ...baseState,
        Prefs: {
          ...baseState.Prefs,
          values: {
            ...baseState.Prefs.values,
            "nova.enabled": true,
            "system.showWeatherOptIn": true,
            "weather.optInAccepted": true,
          },
        },
      };
      const { container } = renderLocationSearch(state);
      expect(
        container.querySelector(
          "[data-l10n-id='newtab-weather-change-location-search-use-current']"
        )
      ).toBeInTheDocument();
    });

    it("hides the button when nova is enabled, weatherOptIn is true, and user has not accepted", () => {
      const state = {
        ...baseState,
        Prefs: {
          ...baseState.Prefs,
          values: {
            ...baseState.Prefs.values,
            "nova.enabled": true,
            "system.showWeatherOptIn": true,
            "weather.optInAccepted": false,
          },
        },
      };
      const { container } = renderLocationSearch(state);
      expect(
        container.querySelector(
          "[data-l10n-id='newtab-weather-change-location-search-use-current']"
        )
      ).not.toBeInTheDocument();
    });

    it("dispatches WEATHER_USER_OPT_IN_LOCATION and closes search on click", () => {
      const state = {
        ...baseState,
        Prefs: {
          ...baseState.Prefs,
          values: { ...baseState.Prefs.values, "nova.enabled": true },
        },
      };
      const { container, dispatch } = renderLocationSearch(state);
      const button = container.querySelector(
        "[data-l10n-id='newtab-weather-change-location-search-use-current']"
      );
      fireEvent.click(button);

      const calls = dispatch.mock.calls.map(([action]) => action);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: at.WEATHER_USER_OPT_IN_LOCATION }),
          expect.objectContaining({
            type: at.WEATHER_SEARCH_ACTIVE,
            data: false,
          }),
        ])
      );
    });
  });

  describe("location suggestions", () => {
    const suggestionState = {
      ...baseState,
      Weather: {
        ...baseState.Weather,
        locationSearchString: "Tor",
        suggestedLocations: [
          {
            key: "55488",
            localized_name: "Toronto",
            administrative_area: { localized_name: "Ontario" },
            country: { localized_name: "Canada" },
          },
        ],
      },
    };

    // Suggestions only show after typing, so type the stored query again.
    function renderWithOpenSuggestions(state = suggestionState) {
      const rendered = renderLocationSearch(state);
      setSearchValue(rendered.container, "Tor");
      return rendered;
    }

    it("does not show the previous query's suggestions before the user types", () => {
      const { container } = renderLocationSearch(suggestionState);
      expect(container.querySelector(".location-input")).toHaveAttribute(
        "value",
        "Tor"
      );
      expect(
        container.querySelector(".location-search-results")
      ).not.toBeInTheDocument();
    });

    it("closes the suggestions when focus leaves the field and its list", () => {
      const { container } = renderWithOpenSuggestions();
      const field = container.querySelector(".location-input");
      const option = container.querySelector(".location-search-result");

      fireEvent.focusOut(field, { relatedTarget: option });
      expect(
        container.querySelector(".location-search-results")
      ).toBeInTheDocument();

      fireEvent.focusOut(option, { relatedTarget: document.body });
      expect(
        container.querySelector(".location-search-results")
      ).not.toBeInTheDocument();

      setSearchValue(container, "Toro");
      expect(
        container.querySelector(".location-search-results")
      ).toBeInTheDocument();
    });

    it("hides the results list when there are no suggestions", () => {
      const { container } = renderLocationSearch();
      expect(
        container.querySelector(".location-search-results")
      ).not.toBeInTheDocument();
    });

    it("renders each suggestion as an option", () => {
      const { container } = renderWithOpenSuggestions();
      const options = container.querySelectorAll(
        ".location-search-results [role='option']"
      );
      expect(options).toHaveLength(1);
      expect(
        options[0].querySelector(".location-search-result-city").textContent
      ).toBe("Toronto");
      expect(
        options[0].querySelector(".location-search-result-region").textContent
      ).toBe("Ontario");
    });

    it("selects a location and closes search when a suggestion is clicked", () => {
      const { container, dispatch } = renderWithOpenSuggestions();
      fireEvent.click(container.querySelector(".location-search-result"));

      const calls = dispatch.mock.calls.map(([action]) => action);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: at.WEATHER_LOCATION_DATA_UPDATE,
            data: expect.objectContaining({ city: "Toronto" }),
          }),
          expect.objectContaining({
            type: at.WEATHER_SEARCH_ACTIVE,
            data: false,
          }),
        ])
      );
    });

    it("requests suggestions once the query reaches three characters", () => {
      const { container, dispatch } = renderLocationSearch();
      setSearchValue(container, "Ber");

      expect(dispatchedActions(dispatch)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: at.WEATHER_LOCATION_SEARCH_UPDATE,
            data: "Ber",
          }),
        ])
      );
    });

    it("clears existing suggestions when the query drops below three characters", () => {
      const { container, dispatch } = renderLocationSearch(suggestionState);
      setSearchValue(container, "To");

      const actions = dispatchedActions(dispatch);
      expect(actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: at.WEATHER_LOCATION_SUGGESTIONS_UPDATE,
            data: [],
          }),
        ])
      );
      expect(actions).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: at.WEATHER_LOCATION_SEARCH_UPDATE }),
        ])
      );
      expect(
        container.querySelector(".location-search-results")
      ).not.toBeInTheDocument();
    });

    it("does not clear suggestions for a short query when there are none", () => {
      const { container, dispatch } = renderLocationSearch();
      setSearchValue(container, "To");

      expect(dispatchedActions(dispatch)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: at.WEATHER_LOCATION_SUGGESTIONS_UPDATE,
          }),
        ])
      );
    });

    it("closes search when Escape is pressed on a suggestion", () => {
      const { container, dispatch } = renderWithOpenSuggestions();
      fireEvent.keyDown(container.querySelector(".location-search-result"), {
        key: "Escape",
      });

      expect(dispatchedActions(dispatch)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: at.WEATHER_SEARCH_ACTIVE,
            data: false,
          }),
        ])
      );
    });

    it("selects a location with the Enter key", () => {
      const { container, dispatch } = renderWithOpenSuggestions();
      fireEvent.keyDown(container.querySelector(".location-search-result"), {
        key: "Enter",
      });

      const calls = dispatch.mock.calls.map(([action]) => action);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: at.WEATHER_LOCATION_DATA_UPDATE }),
        ])
      );
    });
  });

  describe("suggestion keyboard navigation", () => {
    const twoSuggestionsState = {
      ...baseState,
      Weather: {
        ...baseState.Weather,
        suggestedLocations: [
          {
            key: "55488",
            localized_name: "Toronto",
            administrative_area: { localized_name: "Ontario" },
            country: { localized_name: "Canada" },
          },
          {
            key: "330891",
            localized_name: "Torquay",
            administrative_area: { localized_name: "Torbay" },
            country: { localized_name: "United Kingdom" },
          },
        ],
      },
    };

    function renderOpenList() {
      const rendered = renderLocationSearch(twoSuggestionsState);
      setSearchValue(rendered.container, "Tor");
      const field = rendered.container.querySelector(".location-input");
      // moz-input-search isn't upgraded in jsdom, so give it the inner input
      // that the component would normally render.
      field.inputEl = document.createElement("input");
      rendered.container.appendChild(field.inputEl);
      const options = rendered.container.querySelectorAll(
        ".location-search-result"
      );
      return { ...rendered, field, options };
    }

    it("keeps suggestions out of the Tab order", () => {
      const { options } = renderOpenList();
      options.forEach(option =>
        expect(option.getAttribute("tabIndex")).toBe("-1")
      );
    });

    it("moves from the field to the first suggestion with Down", () => {
      const { field, options } = renderOpenList();
      fireEvent.keyDown(field, { key: "ArrowDown" });
      expect(document.activeElement).toBe(options[0]);
    });

    it("moves between suggestions with Down and Up", () => {
      const { options } = renderOpenList();
      options[0].focus();
      fireEvent.keyDown(options[0], { key: "ArrowDown" });
      expect(document.activeElement).toBe(options[1]);
      fireEvent.keyDown(options[1], { key: "ArrowUp" });
      expect(document.activeElement).toBe(options[0]);
    });

    it("wraps from the last suggestion to the first without scrolling the page", () => {
      const { options } = renderOpenList();
      options[1].focus();
      // fireEvent returns false when the handler prevented the default.
      expect(fireEvent.keyDown(options[1], { key: "ArrowDown" })).toBe(false);
      expect(document.activeElement).toBe(options[0]);
    });

    it("returns to the field with Up from the first suggestion", () => {
      const { field, options } = renderOpenList();
      options[0].focus();
      fireEvent.keyDown(options[0], { key: "ArrowUp" });
      expect(document.activeElement).toBe(field.inputEl);
    });
  });

  describe("back button direction", () => {
    afterEach(() => {
      document.dir = "";
    });

    it("points the back arrow left in left-to-right layouts", () => {
      const { container } = renderLocationSearch();
      expect(
        container.querySelector(".location-search-back").getAttribute("iconSrc")
      ).toBe("chrome://global/skin/icons/arrow-left.svg");
    });

    it("points the back arrow right in right-to-left layouts", () => {
      document.dir = "rtl";
      const { container } = renderLocationSearch();
      expect(
        container.querySelector(".location-search-back").getAttribute("iconSrc")
      ).toBe("chrome://global/skin/icons/arrow-right.svg");
    });
  });
});
