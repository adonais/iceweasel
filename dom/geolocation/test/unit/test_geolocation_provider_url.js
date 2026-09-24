/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { networkProviderLabel } = ChromeUtils.importESModule(
  "moz-src:///dom/system/NetworkGeolocationProvider.sys.mjs"
);

add_task(function test_networkProviderLabel() {
  const kTestCases = [
    ["https://www.googleapis.com/geolocation/v1/geolocate?key=key", "google"],
    ["https://googleapis.com/geolocation/v1/geolocate", "google"],
    ["https://api.beacondb.net/v1/geolocate", "beacondb"],
    ["https://beacondb.net/v1/geolocate", "beacondb"],
    ["https://notgoogleapis.com/geolocation/v1/geolocate", "other"],
    ["https://beacondb.net.example.com/v1/geolocate", "other"],
    ["https://location.services.mozilla.com/v1/geolocate", "other"],
    ["http://localhost:8080/geo", "other"],
    ["http://127.0.0.1:8080/geo", "other"],
    ["", "unknown"],
    ["UrlNotUsedHere:", "unknown"],
    ["data:application/json,{}", "unknown"],
  ];

  for (let [url, expected] of kTestCases) {
    Assert.equal(networkProviderLabel(url), expected, `${url} is ${expected}`);
  }
});
