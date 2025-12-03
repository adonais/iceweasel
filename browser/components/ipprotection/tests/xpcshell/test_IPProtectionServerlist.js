/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPProtectionServerlist } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs"
);

const COLLECTION_NAME = "vpn-serverlist";

const TEST_SERVER_1 = {
  hostname: "test1.example.com",
  port: 443,
  quarantined: false,
};
const TEST_SERVER_2 = {
  hostname: "test2.example.com",
  port: 443,
  quarantined: false,
};
const TEST_SERVER_QUARANTINED = {
  hostname: "quarantined.example.com",
  port: 443,
  quarantined: true,
};

const TEST_US_CITY = {
  name: "Test City",
  code: "TC",
  servers: [TEST_SERVER_1, TEST_SERVER_2],
};

const TEST_COUNTRIES = [
  {
    name: "United States",
    code: "US",
    cities: [TEST_US_CITY],
  },
  {
    name: "Canada",
    code: "CA",
    cities: [
      {
        name: "Test City 2",
        code: "TC2",
        servers: [TEST_SERVER_1],
      },
    ],
  },
];

const client = RemoteSettings(COLLECTION_NAME);

add_setup(async function () {
  do_get_profile();
  await client.db.clear();
  for (const country of TEST_COUNTRIES) {
    await client.db.create(country);
  }
  await client.db.importChanges({}, Date.now());

  await IPProtectionServerlist.maybeFetchList();
});

add_task(async function test_getDefaultLocation() {
  const { country, city } = IPProtectionServerlist.getDefaultLocation();
  Assert.equal(country.code, "US", "The default country should be US");
  Assert.deepEqual(city, TEST_US_CITY, "The correct city should be returned");
});

add_task(async function test_selectServer() {
  // Test with a city with multiple non-quarantined servers
  let selected = IPProtectionServerlist.selectServer(TEST_US_CITY);
  Assert.ok(
    [TEST_SERVER_1, TEST_SERVER_2].some(s => s.hostname === selected.hostname),
    "A valid server should be selected"
  );

  // Test with a city with one server
  const cityWithOneServer = {
    name: "One Server City",
    code: "OSC",
    servers: [TEST_SERVER_1],
  };
  selected = IPProtectionServerlist.selectServer(cityWithOneServer);
  Assert.deepEqual(
    selected,
    TEST_SERVER_1,
    "The single server should be selected"
  );

  // Test with a city with a mix of quarantined and non-quarantined servers
  const cityWithMixedServers = {
    name: "Mixed Servers City",
    code: "MSC",
    servers: [TEST_SERVER_1, TEST_SERVER_QUARANTINED],
  };
  selected = IPProtectionServerlist.selectServer(cityWithMixedServers);
  Assert.deepEqual(
    selected,
    TEST_SERVER_1,
    "The non-quarantined server should be selected"
  );

  // Test with a city with only quarantined servers
  const cityWithQuarantinedServers = {
    name: "Quarantined City",
    code: "QC",
    servers: [TEST_SERVER_QUARANTINED],
  };
  selected = IPProtectionServerlist.selectServer(cityWithQuarantinedServers);
  Assert.equal(selected, null, "No server should be selected");

  // Test with a city with no servers
  const cityWithNoServers = {
    name: "No Server City",
    code: "NSC",
    servers: [],
  };
  selected = IPProtectionServerlist.selectServer(cityWithNoServers);
  Assert.equal(selected, null, "No server should be selected");
});
