/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { connect, batch } from "react-redux";
import { LinkMenu } from "content-src/components/LinkMenu/LinkMenu";
import { LocationSearch } from "content-src/components/Weather/LocationSearch";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { useIntersectionObserver } from "../../lib/utils";
import React, { useState } from "react";

const VISIBLE = "visible";
const VISIBILITY_CHANGE_EVENT = "visibilitychange";
const PREF_SYSTEM_SHOW_WEATHER = "system.showWeather";

function WeatherPlaceholder() {
  const [isSeen, setIsSeen] = useState(false);

  // We are setting up a visibility and intersection event
  // so animations don't happen with headless automation.
  // The animations causes tests to fail beause they never stop,
  // and many tests wait until everything has stopped before passing.
  const ref = useIntersectionObserver(() => setIsSeen(true), 1);

  const isSeenClassName = isSeen ? `placeholder-seen` : ``;

  return (
    <div
      className={`weather weather-placeholder ${isSeenClassName}`}
      ref={el => {
        ref.current = [el];
      }}
    >
      <div className="placeholder-image placeholder-fill" />
      <div className="placeholder-context">
        <div className="placeholder-header placeholder-fill" />
        <div className="placeholder-description placeholder-fill" />
      </div>
    </div>
  );
}

export class _Weather extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      contextMenuKeyboard: false,
      showContextMenu: false,
      url: "https://example.com",
      impressionSeen: false,
      errorSeen: false,
    };
    this.setImpressionRef = element => {
      this.impressionElement = element;
    };
    this.setErrorRef = element => {
      this.errorElement = element;
    };
    this.onClick = this.onClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onUpdate = this.onUpdate.bind(this);
    this.onProviderClick = this.onProviderClick.bind(this);
  }

  componentDidMount() {
    const { props } = this;

    if (!props.dispatch) {
      return;
    }

    if (props.document.visibilityState === VISIBLE) {
      // Setup the impression observer once the page is visible.
      this.setImpressionObservers();
    } else {
      // We should only ever send the latest impression stats ping, so remove any
      // older listeners.
      if (this._onVisibilityChange) {
        props.document.removeEventListener(
          VISIBILITY_CHANGE_EVENT,
          this._onVisibilityChange
        );
      }

      this._onVisibilityChange = () => {
        if (props.document.visibilityState === VISIBLE) {
          // Setup the impression observer once the page is visible.
          this.setImpressionObservers();
          props.document.removeEventListener(
            VISIBILITY_CHANGE_EVENT,
            this._onVisibilityChange
          );
        }
      };
      props.document.addEventListener(
        VISIBILITY_CHANGE_EVENT,
        this._onVisibilityChange
      );
    }
  }

  componentWillUnmount() {
    // Remove observers on unmount
    if (this.observer && this.impressionElement) {
      this.observer.unobserve(this.impressionElement);
    }
    if (this.observer && this.errorElement) {
      this.observer.unobserve(this.errorElement);
    }
    if (this._onVisibilityChange) {
      this.props.document.removeEventListener(
        VISIBILITY_CHANGE_EVENT,
        this._onVisibilityChange
      );
    }
  }

  setImpressionObservers() {
    if (this.impressionElement) {
      this.observer = new IntersectionObserver(this.onImpression.bind(this));
      this.observer.observe(this.impressionElement);
    }
    if (this.errorElement) {
      this.observer = new IntersectionObserver(this.onError.bind(this));
      this.observer.observe(this.errorElement);
    }
  }

  onImpression(entries) {
    if (this.state) {
      const entry = entries.find(e => e.isIntersecting);

      if (entry) {
        if (this.impressionElement) {
          this.observer.unobserve(this.impressionElement);
        }

        this.props.dispatch(
          ac.OnlyToMain({
            type: at.WEATHER_IMPRESSION,
          })
        );

        // Stop observing since element has been seen
        this.setState({
          impressionSeen: true,
        });
      }
    }
  }

  onError(entries) {
    if (this.state) {
      const entry = entries.find(e => e.isIntersecting);

      if (entry) {
        if (this.errorElement) {
          this.observer.unobserve(this.errorElement);
        }

        this.props.dispatch(
          ac.OnlyToMain({
            type: at.WEATHER_LOAD_ERROR,
          })
        );

        // Stop observing since element has been seen
        this.setState({
          errorSeen: true,
        });
      }
    }
  }

  openContextMenu(isKeyBoard) {
    if (this.props.onUpdate) {
      this.props.onUpdate(true);
    }
    this.setState({
      showContextMenu: true,
      contextMenuKeyboard: isKeyBoard,
    });
  }

  onClick(event) {
    event.preventDefault();
    this.openContextMenu(false, event);
  }

  onKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.openContextMenu(true, event);
    }
  }

  onUpdate(showContextMenu) {
    if (this.props.onUpdate) {
      this.props.onUpdate(showContextMenu);
    }
    this.setState({ showContextMenu });
  }

  onProviderClick() {
    this.props.dispatch(
      ac.OnlyToMain({
        type: at.WEATHER_OPEN_PROVIDER_URL,
        data: {
          source: "WEATHER",
        },
      })
    );
  }

  handleRejectOptIn = () => {
    batch(() => {
      this.props.dispatch(ac.SetPref("weather.optInAccepted", false));
      this.props.dispatch(ac.SetPref("weather.optInDisplayed", false));

      this.props.dispatch(
        ac.AlsoToMain({
          type: at.WEATHER_OPT_IN_PROMPT_SELECTION,
          data: "rejected opt-in",
        })
      );
    });
  };

  handleAcceptOptIn = () => {
    batch(() => {
      this.props.dispatch(
        ac.AlsoToMain({
          type: at.WEATHER_USER_OPT_IN_LOCATION,
        })
      );

      this.props.dispatch(
        ac.AlsoToMain({
          type: at.WEATHER_OPT_IN_PROMPT_SELECTION,
          data: "accepted opt-in",
        })
      );
    });
  };

  isEnabled() {
    const { values } = this.props.Prefs;
    const systemValue =
      values[PREF_SYSTEM_SHOW_WEATHER] && values["feeds.weatherfeed"];
    const experimentValue = values.trainhopConfig?.weather?.enabled;
    return systemValue || experimentValue;
  }

  render() {
    // Check if weather should be rendered
    if (!this.isEnabled()) {
      return false;
    }

    if (
      this.props.App.isForStartupCache.Weather ||
      !this.props.Weather.initialized
    ) {
      return <WeatherPlaceholder />;
    }

    const { showContextMenu } = this.state;

    const { props } = this;

    const { dispatch, Prefs, Weather } = props;

    const WEATHER_SUGGESTION = Weather.suggestions?.[0];

    const outerClassName = [
      "weather",
      Weather.searchActive && "search",
      props.isInSection && "section-weather",
    ]
      .filter(v => v)
      .join(" ");

    const showDetailedView = Prefs.values["weather.display"] === "detailed";

    const weatherOptIn = Prefs.values["system.showWeatherOptIn"];
    const nimbusWeatherOptInEnabled =
      Prefs.values.trainhopConfig?.weather?.weatherOptInEnabled;

    const optInDisplayed = Prefs.values["weather.optInDisplayed"];
    const optInUserChoice = Prefs.values["weather.optInAccepted"];
    const staticWeather = Prefs.values["weather.staticData.enabled"];

    // Conditionals for rendering feature based on prefs + nimbus experiment variables
    const isOptInEnabled = weatherOptIn || nimbusWeatherOptInEnabled;

    // Opt-in dialog should only show if:
    // - weather enabled on customization menu
    // - weather opt-in pref is enabled
    // - opt-in prompt is enabled
    // - user hasn't accepted the opt-in yet
    const shouldShowOptInDialog =
      isOptInEnabled && optInDisplayed && !optInUserChoice;

    // Show static weather data only if:
    // - weather is enabled on customization menu
    // - weather opt-in pref is enabled
    // - static weather data is enabled
    const showStaticData = isOptInEnabled && staticWeather;

    // Note: The temperature units/display options will become secondary menu items
    const WEATHER_SOURCE_CONTEXT_MENU_OPTIONS = [
      ...(Prefs.values["weather.locationSearchEnabled"]
        ? ["ChangeWeatherLocation"]
        : []),
      ...(isOptInEnabled ? ["DetectLocation"] : []),
      ...(Prefs.values["weather.temperatureUnits"] === "f"
        ? ["ChangeTempUnitCelsius"]
        : ["ChangeTempUnitFahrenheit"]),
      ...(Prefs.values["weather.display"] === "simple"
        ? ["ChangeWeatherDisplayDetailed"]
        : ["ChangeWeatherDisplaySimple"]),
      "HideWeather",
      "OpenLearnMoreURL",
    ];
    const WEATHER_SOURCE_SHORTENED_CONTEXT_MENU_OPTIONS = [
      ...(Prefs.values["weather.locationSearchEnabled"]
        ? ["ChangeWeatherLocation"]
        : []),
      ...(isOptInEnabled ? ["DetectLocation"] : []),
      "HideWeather",
      "OpenLearnMoreURL",
    ];

    const contextMenu = contextOpts => (
      <div className="weatherButtonContextMenuWrapper">
        <button
          aria-haspopup="true"
          onKeyDown={this.onKeyDown}
          onClick={this.onClick}
          data-l10n-id="newtab-menu-section-tooltip"
          className="weatherButtonContextMenu"
        >
          {showContextMenu ? (
            <LinkMenu
              dispatch={dispatch}
              index={0}
              source="WEATHER"
              onUpdate={this.onUpdate}
              options={contextOpts}
              site={{
                url: "https://support.mozilla.org/kb/customize-items-on-firefox-new-tab-page",
              }}
              link="https://support.mozilla.org/kb/customize-items-on-firefox-new-tab-page"
              shouldSendImpressionStats={false}
            />
          ) : null}
        </button>
      </div>
    );

    if (Weather.searchActive) {
      return <LocationSearch outerClassName={outerClassName} />;
    } else if (WEATHER_SUGGESTION) {
      return (
        <div ref={this.setImpressionRef} className={outerClassName}>
          <div className="weatherCard">
            {showStaticData ? (
              <div className="weatherInfoLink staticWeatherInfo">
                <div className="weatherIconCol">
                  <span className="weatherIcon iconId3" />
                </div>
                <div className="weatherText">
                  <div className="weatherForecastRow">
                    <span className="weatherTemperature">
                      22&deg;{Prefs.values["weather.temperatureUnits"]}
                    </span>
                  </div>
                  <div className="weatherCityRow">
                    <span
                      className="weatherCity"
                      data-l10n-id="newtab-weather-static-city"
                    ></span>
                  </div>
                </div>
              </div>
            ) : (
              <a
                data-l10n-id="newtab-weather-see-forecast"
                data-l10n-args='{"provider": "AccuWeather®"}'
                href={WEATHER_SUGGESTION.forecast.url}
                className="weatherInfoLink"
                onClick={this.onProviderClick}
              >
                <div className="weatherIconCol">
                  <span
                    className={`weatherIcon iconId${WEATHER_SUGGESTION.current_conditions.icon_id}`}
                  />
                </div>
                <div className="weatherText">
                  <div className="weatherForecastRow">
                    <span className="weatherTemperature">
                      {
                        WEATHER_SUGGESTION.current_conditions.temperature[
                          Prefs.values["weather.temperatureUnits"]
                        ]
                      }
                      &deg;{Prefs.values["weather.temperatureUnits"]}
                    </span>
                  </div>
                  <div className="weatherCityRow">
                    <span className="weatherCity">
                      {Weather.locationData.city}
                    </span>
                  </div>
                  {showDetailedView ? (
                    <div className="weatherDetailedSummaryRow">
                      <div className="weatherHighLowTemps">
                        {/* Low Forecasted Temperature */}
                        <span>
                          {
                            WEATHER_SUGGESTION.forecast.high[
                              Prefs.values["weather.temperatureUnits"]
                            ]
                          }
                          &deg;
                          {Prefs.values["weather.temperatureUnits"]}
                        </span>
                        {/* Spacer / Bullet */}
                        <span>&bull;</span>
                        {/* Low Forecasted Temperature */}
                        <span>
                          {
                            WEATHER_SUGGESTION.forecast.low[
                              Prefs.values["weather.temperatureUnits"]
                            ]
                          }
                          &deg;
                          {Prefs.values["weather.temperatureUnits"]}
                        </span>
                      </div>
                      <span className="weatherTextSummary">
                        {WEATHER_SUGGESTION.current_conditions.summary}
                      </span>
                    </div>
                  ) : null}
                </div>
              </a>
            )}

            {contextMenu(
              showStaticData
                ? WEATHER_SOURCE_SHORTENED_CONTEXT_MENU_OPTIONS
                : WEATHER_SOURCE_CONTEXT_MENU_OPTIONS
            )}
          </div>
          <span className="weatherSponsorText">
            <span
              data-l10n-id="newtab-weather-sponsored"
              data-l10n-args='{"provider": "AccuWeather®"}'
            ></span>
          </span>

          {shouldShowOptInDialog && (
            <div className="weatherOptIn">
              <dialog open={true}>
                <span className="weatherOptInImg"></span>
                <div className="weatherOptInContent">
                  <h3 data-l10n-id="newtab-weather-opt-in-see-weather"></h3>
                  <moz-button-group className="button-group">
                    <moz-button
                      size="small"
                      type="default"
                      data-l10n-id="newtab-weather-opt-in-not-now"
                      onClick={this.handleRejectOptIn}
                      id="reject-opt-in"
                    />
                    <moz-button
                      size="small"
                      type="default"
                      data-l10n-id="newtab-weather-opt-in-yes"
                      onClick={this.handleAcceptOptIn}
                      id="accept-opt-in"
                    />
                  </moz-button-group>
                </div>
              </dialog>
            </div>
          )}
        </div>
      );
    }

    return (
      <div ref={this.setErrorRef} className={outerClassName}>
        <div className="weatherNotAvailable">
          <span className="icon icon-info-warning" />{" "}
          <p data-l10n-id="newtab-weather-error-not-available"></p>
          {contextMenu(WEATHER_SOURCE_SHORTENED_CONTEXT_MENU_OPTIONS)}
        </div>
      </div>
    );
  }
}

export const Weather = connect(state => ({
  App: state.App,
  Weather: state.Weather,
  Prefs: state.Prefs,
  IntersectionObserver: globalThis.IntersectionObserver,
  document: globalThis.document,
}))(_Weather);
