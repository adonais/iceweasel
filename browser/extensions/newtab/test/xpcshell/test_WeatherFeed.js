/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionCreators: "resource://newtab/common/Actions.mjs",
  actionTypes: "resource://newtab/common/Actions.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  MerinoTestUtils: "resource://testing-common/MerinoTestUtils.sys.mjs",
  WeatherFeed: "resource://newtab/lib/WeatherFeed.sys.mjs",
  Region: "resource://gre/modules/Region.sys.mjs",
});

const { WEATHER_SUGGESTION } = MerinoTestUtils;

const WEATHER_ENABLED = "browser.newtabpage.activity-stream.showWeather";
const SYS_WEATHER_ENABLED =
  "browser.newtabpage.activity-stream.system.showWeather";

add_task(async function test_construction() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(WeatherFeed.prototype, "PersistentCache").returns({
    set: () => {},
    get: () => {},
  });

  let feed = new WeatherFeed();

  info("WeatherFeed constructor should create initial values");

  Assert.ok(feed, "Could construct a WeatherFeed");
  Assert.strictEqual(feed.loaded, false, "WeatherFeed is not loaded");
  Assert.strictEqual(feed.merino, null, "merino is initialized as null");
  Assert.strictEqual(
    feed.suggestions.length,
    0,
    "suggestions is initialized as a array with length of 0"
  );
  Assert.strictEqual(
    feed.fetchTimer,
    null,
    "fetchTimer is initialized as null"
  );
  sandbox.restore();
});

add_task(async function test_checkOptInRegion() {
  let sandbox = sinon.createSandbox();

  sandbox.stub(WeatherFeed.prototype, "PersistentCache").returns({
    set: () => {},
    get: () => {},
  });

  let feed = new WeatherFeed();

  feed.store = {
    dispatch: sinon.spy(),
    getState() {
      return { Prefs: { values: {} } };
    },
  };

  sandbox.stub(feed, "isEnabled").returns(true);

  // First case: If home region is in the opt-in list, showWeatherOptIn should be true
  // Region._setHomeRegion() is the supported way to control region in tests:
  // https://firefox-source-docs.mozilla.org/toolkit/modules/toolkit_modules/Region.html#testing
  // We used false here because that second argument is a change observer that will fire an event.
  // So keeping it false silently sets the region for our test
  Region._setHomeRegion("FR", false);
  let resultTrue = await feed.checkOptInRegion();

  Assert.strictEqual(
    resultTrue,
    true,
    "Returns true for region in opt-in list"
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("system.showWeatherOptIn", true)
    ),
    "Dispatch sets system.showWeatherOptIn to true when region is in opt-in list"
  );

  // Second case: If home region is not in the opt-in list, showWeatherOptIn should be false
  Region._setHomeRegion("ZZ", false);
  let resultFalse = await feed.checkOptInRegion();

  Assert.strictEqual(
    resultFalse,
    false,
    "Returns false for region not found in opt-in list"
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("system.showWeatherOptIn", false)
    ),
    "Dispatch sets system.showWeatherOptIn to false when region is not in opt-in list"
  );

  sandbox.restore();
});

add_task(async function test_onAction_INIT() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(WeatherFeed.prototype, "MerinoClient").returns({
    get: () => [WEATHER_SUGGESTION],
    on: () => {},
  });
  sandbox.stub(WeatherFeed.prototype, "PersistentCache").returns({
    set: () => {},
    get: () => {},
  });
  const dateNowTestValue = 1;
  sandbox.stub(WeatherFeed.prototype, "Date").returns({
    now: () => dateNowTestValue,
  });

  let feed = new WeatherFeed();
  let locationData = {
    city: "testcity",
    adminArea: "",
    country: "",
  };

  Services.prefs.setBoolPref(WEATHER_ENABLED, true);
  Services.prefs.setBoolPref(SYS_WEATHER_ENABLED, true);

  sandbox.stub(feed, "isEnabled").returns(true);

  sandbox.stub(feed, "fetchHelper");
  feed.suggestions = [WEATHER_SUGGESTION];
  feed.locationData = locationData;
  feed.store = {
    dispatch: sinon.spy(),
    getState() {
      return this.state;
    },
    state: {
      Prefs: {
        values: {
          "weather.query": "348794",
        },
      },
    },
  };

  info("WeatherFeed.onAction INIT should initialize Weather");

  await feed.onAction({
    type: actionTypes.INIT,
  });

  Assert.equal(feed.store.dispatch.callCount, 2);
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.BroadcastToContent({
        type: actionTypes.WEATHER_UPDATE,
        data: {
          suggestions: [WEATHER_SUGGESTION],
          lastUpdated: dateNowTestValue,
          locationData,
        },
      })
    )
  );
  Services.prefs.clearUserPref(WEATHER_ENABLED);
  sandbox.restore();
});

// Test if location lookup was successful
add_task(async function test_onAction_opt_in_location_success() {
  let sandbox = sinon.createSandbox();

  sandbox.stub(WeatherFeed.prototype, "PersistentCache").returns({
    set: () => {},
    get: () => {},
  });

  let feed = new WeatherFeed();

  feed.store = {
    dispatch: sinon.spy(),
    getState() {
      return { Prefs: { values: {} } };
    },
  };

  // Stub fetchLocationByIP() to simulate a successful lookup
  sandbox.stub(feed, "fetchLocationByIP").resolves({
    localized_name: "Testville",
    administrative_area: "Paris",
    country: "FR",
    key: "12345",
  });

  await feed.onAction({ type: actionTypes.WEATHER_USER_OPT_IN_LOCATION });

  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("weather.optInAccepted", true)
    )
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("weather.optInDisplayed", false)
    )
  );

  // Assert location data broadcasted to content
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.BroadcastToContent({
        type: actionTypes.WEATHER_LOCATION_DATA_UPDATE,
        data: {
          city: "Testville",
          adminName: "Paris",
          country: "FR",
        },
      })
    ),
    "Broadcasts WEATHER_LOCATION_DATA_UPDATE with normalized location data"
  );

  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("weather.query", "12345")
    ),
    "Sets weather.query pref from location key"
  );

  sandbox.restore();
});

// Test if no location was found
add_task(async function test_onAction_opt_in_no_location_found() {
  let sandbox = sinon.createSandbox();

  sandbox.stub(WeatherFeed.prototype, "PersistentCache").returns({
    set: () => {},
    get: () => {},
  });

  let feed = new WeatherFeed();

  feed.store = {
    dispatch: sinon.spy(),
    getState() {
      return { Prefs: { values: {} } };
    },
  };

  // Test that fetchLocationByIP doesn't return a location
  sandbox.stub(feed, "fetchLocationByIP").resolves(null);

  await feed.onAction({ type: actionTypes.WEATHER_USER_OPT_IN_LOCATION });

  // Ensure the pref flips always happens so user won’t see the opt-in again
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("weather.optInAccepted", true)
    )
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("weather.optInDisplayed", false)
    )
  );

  Assert.ok(
    !feed.store.dispatch.calledWithMatch(
      actionCreators.BroadcastToContent({
        type: actionTypes.WEATHER_LOCATION_DATA_UPDATE,
      })
    ),
    "Doesn't broadcast location data if location not found"
  );

  Assert.ok(
    !feed.store.dispatch.calledWith(
      actionCreators.SetPref("weather.query", sinon.match.any)
    ),
    "Does not set weather.query if no detected location"
  );

  sandbox.restore();
});
