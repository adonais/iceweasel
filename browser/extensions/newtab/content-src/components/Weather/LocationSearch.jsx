/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";

// moz-input-search doesn't support <datalist>, so the suggestions are a bespoke listbox and need their own keyboard navigation
function handleListboxArrowKeys(event) {
  const listbox = event.currentTarget.querySelector('[role="listbox"]');
  if (!listbox || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) {
    return;
  }
  const options = [...listbox.querySelectorAll('[role="option"]')];
  const index = options.indexOf(event.target);
  let next = null;
  if (event.key === "ArrowDown") {
    // Wrap from the last option back to the first.
    next = options[index + 1] ?? options[0];
  } else if (index === 0) {
    const field = event.currentTarget.querySelector("moz-input-search");
    next = field?.inputEl ?? field;
  } else if (index > 0) {
    next = options[index - 1];
  }
  // On an option, always prevent the default so the page never scrolls, even
  // if focus has nowhere to move.
  if (next || index >= 0) {
    event.preventDefault();
  }
  next?.focus();
}

function LocationSearch({ outerClassName, onLocationSelected }) {
  // should be the location object from suggestedLocations
  const [selectedLocation, setSelectedLocation] = useState("");
  const suggestedLocations = useSelector(
    state => state.Weather.suggestedLocations
  );
  const locationSearchString = useSelector(
    state => state.Weather.locationSearchString
  );
  // @nova-cleanup(remove-pref): Delete this read and the novaEnabled guard on
  // the use-current-location button below; keep showCurrentLocation.
  const novaEnabled = useSelector(state => state.Prefs.values["nova.enabled"]);
  const weatherOptIn = useSelector(
    state => state.Prefs.values["system.showWeatherOptIn"]
  );
  const optInAccepted = useSelector(
    state => state.Prefs.values["weather.optInAccepted"]
  );
  const showCurrentLocation = !weatherOptIn || optInAccepted;

  const [userInput, setUserInput] = useState(locationSearchString || "");
  // The previous query and its suggestions stay in the store after search
  // closes, so only show suggestions once the user types in this session, and
  // hide them again when focus leaves the field and its list.
  const [resultsOpen, setResultsOpen] = useState(false);
  const inputRef = useRef(null);

  const dispatch = useDispatch();

  useEffect(() => {
    if (selectedLocation) {
      dispatch(
        ac.AlsoToMain({
          type: at.WEATHER_LOCATION_DATA_UPDATE,
          data: {
            city: selectedLocation.localized_name,
            adminName: selectedLocation.administrative_area,
            country: selectedLocation.country,
          },
        })
      );
      dispatch(ac.SetPref("weather.query", selectedLocation.key));
      dispatch(
        ac.BroadcastToContent({
          type: at.WEATHER_SEARCH_ACTIVE,
          data: false,
        })
      );
      onLocationSelected?.();
    }
  }, [selectedLocation, dispatch, onLocationSelected]);

  // moz-input-search creates its inner input asynchronously, so wait for it over
  // a few frames before focusing.
  useEffect(() => {
    let frameId = 0;
    let remainingFrames = 5;
    const focusWhenReady = () => {
      const input = inputRef.current?.inputEl;
      if (input) {
        input.focus();
        return;
      }
      if (remainingFrames > 0) {
        remainingFrames -= 1;
        frameId = requestAnimationFrame(focusWhenReady);
      }
    };
    frameId = requestAnimationFrame(focusWhenReady);
    return () => cancelAnimationFrame(frameId);
  }, []);

  function handleChange(event) {
    const { value } = event.target;
    setUserInput(value);
    setResultsOpen(true);

    // if the user input contains less than three characters and suggestedLocations is not an empty array,
    // reset suggestedLocations to [] so there aren't incorrect items in the results list
    if (value.length < 3) {
      if (suggestedLocations.length) {
        dispatch(
          ac.AlsoToMain({
            type: at.WEATHER_LOCATION_SUGGESTIONS_UPDATE,
            data: [],
          })
        );
      }
    } else {
      dispatch(
        ac.AlsoToMain({
          type: at.WEATHER_LOCATION_SEARCH_UPDATE,
          data: value,
        })
      );
    }
  }

  function handleSelectLocation(suggestion) {
    setSelectedLocation(suggestion);
    setUserInput(
      `${suggestion.localized_name}, ${suggestion.administrative_area.localized_name}`
    );
  }

  function handleCloseSearch() {
    dispatch(
      ac.BroadcastToContent({
        type: at.WEATHER_SEARCH_ACTIVE,
        data: false,
      })
    );
    setUserInput("");
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      handleCloseSearch();
    }
  }

  function handleUseCurrentLocation() {
    dispatch(ac.AlsoToMain({ type: at.WEATHER_USER_OPT_IN_LOCATION }));
    dispatch(
      ac.BroadcastToContent({ type: at.WEATHER_SEARCH_ACTIVE, data: false })
    );
  }

  const isRTL = typeof document !== "undefined" && document.dir === "rtl";
  const backIconSrc = `chrome://global/skin/icons/arrow-${isRTL ? "right" : "left"}.svg`;
  const showResults =
    resultsOpen && userInput.length >= 3 && !!suggestedLocations?.length;

  return (
    <div
      className={`${outerClassName} location-search`}
      onKeyDown={handleKeyDown}
    >
      <div className="location-input-wrapper">
        <moz-button
          className="location-search-back"
          data-l10n-id="newtab-weather-search-back-button"
          type="icon ghost"
          size="small"
          iconSrc={backIconSrc}
          onClick={handleCloseSearch}
        />
        <div
          className="location-search-field"
          onKeyDown={handleListboxArrowKeys}
          onBlur={e => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setResultsOpen(false);
            }
          }}
        >
          {/* Results are a reachable listbox, not a combobox popup:
              moz-input-search can't forward combobox ARIA to its input. */}
          <moz-input-search
            ref={inputRef}
            className="location-input"
            data-l10n-id="newtab-weather-change-location-search-input-placeholder"
            value={userInput}
            onInput={handleChange}
          />
          {showResults && (
            <div
              className="location-search-results"
              role="listbox"
              data-l10n-id="newtab-weather-location-search-results"
            >
              {suggestedLocations.map(suggestion => (
                <div
                  className="location-search-result"
                  key={suggestion.key}
                  role="option"
                  aria-selected={suggestion.key === selectedLocation?.key}
                  tabIndex={-1}
                  onClick={() => handleSelectLocation(suggestion)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectLocation(suggestion);
                    }
                  }}
                >
                  <span className="location-search-result-city" dir="auto">
                    {suggestion.localized_name}
                  </span>
                  <span className="location-search-result-region" dir="auto">
                    {suggestion.administrative_area.localized_name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showCurrentLocation && novaEnabled && (
        <moz-button
          data-l10n-id="newtab-weather-change-location-search-use-current"
          type="icon ghost"
          iconSrc="chrome://browser/skin/notification-icons/geo.svg"
          onClick={handleUseCurrentLocation}
        />
      )}
    </div>
  );
}

export { LocationSearch };
