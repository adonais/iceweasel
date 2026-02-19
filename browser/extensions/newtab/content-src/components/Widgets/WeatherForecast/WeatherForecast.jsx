/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useSelector } from "react-redux";

function WeatherForecast() {
  const prefs = useSelector(state => state.Prefs.values);
  const weatherData = useSelector(state => state.Weather);

  const WEATHER_SUGGESTION = weatherData.suggestions?.[0];

  const showDetailedView = prefs["weather.display"] === "detailed";

  if (!showDetailedView || !weatherData?.initialized) {
    return null;
  }

  return (
    <article className="weather-forecast-widget">
      <div className="city-wrapper">
        <h3>{weatherData.locationData.city}</h3>
      </div>
      <div className="current-weather-wrapper">
        <div className="weather-icon-column">
          <span
            className={`weather-icon iconId${WEATHER_SUGGESTION.current_conditions.icon_id}`}
          ></span>
        </div>
        <div className="weather-info-column">
          <span className="temperature-unit">
            {
              WEATHER_SUGGESTION.current_conditions.temperature[
                prefs["weather.temperatureUnits"]
              ]
            }
            &deg;{prefs["weather.temperatureUnits"]}
          </span>
          <span className="temperature-description">
            {WEATHER_SUGGESTION.current_conditions.summary}
          </span>
        </div>
        <div className="high-low-column">
          <span className="high-temperature">
            <span className="arrow-icon arrow-up" />
            {
              WEATHER_SUGGESTION.forecast.high[
                prefs["weather.temperatureUnits"]
              ]
            }
            &deg;
          </span>

          <span className="low-temperature">
            <span className="arrow-icon arrow-down" />
            {WEATHER_SUGGESTION.forecast.low[prefs["weather.temperatureUnits"]]}
            &deg;
          </span>
        </div>
      </div>
      <hr />
      <div className="forecast-row">
        <p
          className="today-forecast"
          data-l10n-id="newtab-weather-todays-forecast"
        ></p>
        <ul className="forecast-row-items">
          <li>
            <span>80&deg;</span>
            <span
              className={`weather-icon iconId${WEATHER_SUGGESTION.current_conditions.icon_id}`}
            ></span>
            <span>7:00</span>
          </li>
          <li>
            <span>80&deg;</span>
            <span
              className={`weather-icon iconId${WEATHER_SUGGESTION.current_conditions.icon_id}`}
            ></span>
            <span>7:00</span>
          </li>
          <li>
            <span>80&deg;</span>
            <span
              className={`weather-icon iconId${WEATHER_SUGGESTION.current_conditions.icon_id}`}
            ></span>
            <span>7:00</span>
          </li>
          <li>
            <span>80&deg;</span>
            <span
              className={`weather-icon iconId${WEATHER_SUGGESTION.current_conditions.icon_id}`}
            ></span>
            <span>7:00</span>
          </li>
          <li>
            <span>80&deg;</span>
            <span
              className={`weather-icon iconId${WEATHER_SUGGESTION.current_conditions.icon_id}`}
            ></span>
            <span>7:00</span>
          </li>
        </ul>
      </div>

      <div className="weather-forecast-footer">
        <a
          href="#"
          className="full-forecast"
          data-l10n-id="newtab-weather-see-full-forecast"
        ></a>
        <span
          className="sponsored-text"
          data-l10n-id="newtab-weather-sponsored"
          data-l10n-args='{"provider": "AccuWeather®"}'
        ></span>
      </div>
    </article>
  );
}

export { WeatherForecast };
