/**
 * Test BreachAlertsData.sys.mjs
 */

"use strict";

const { RemoteSettings } = ChromeUtils.importESModule(
  "resource://services-settings/remote-settings.sys.mjs"
);
const { BreachAlertsData } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/passwordmgr/BreachAlertsData.sys.mjs"
);

const TEST_BREACHES = [
  {
    AddedDate: "2018-12-20T23:56:26Z",
    BreachDate: "2018-12-16",
    Domain: "breached.com",
    Name: "Breached",
    PwnCount: 1643100,
    DataClasses: ["Email addresses", "Usernames", "Passwords", "IP addresses"],
    _status: "synced",
    id: "047940fe-d2fd-4314-b636-b4a952ee0043",
    last_modified: "1541615610052",
    schema: "1541615609018",
  },
];

add_setup(async function () {
  const db = RemoteSettings("fxmonitor-breaches").db;
  await db.clear();
  for (const breach of TEST_BREACHES) {
    await db.create(breach, { useRecordId: true });
  }
  await db.importChanges({}, Date.now());
});

add_task(async function test_getBreachData() {
  const breachAlertsData = new BreachAlertsData();
  const breaches = await breachAlertsData.getAllBreaches();

  Assert.equal(
    breaches.length,
    TEST_BREACHES.length,
    "Should return all test breaches"
  );
  Assert.ok(
    breaches.some(b => b.Domain === "breached.com"),
    "Should contain breached.com"
  );
});

add_task(async function test_getBreachForSite() {
  const breachAlertsData = new BreachAlertsData();

  const breach = await breachAlertsData.getBreachForSite("breached.com");
  Assert.ok(breach, "Should find breach for breached.com");
  Assert.equal(breach.Name, "Breached", "Should return the correct breach");

  const subdomainBreach =
    await breachAlertsData.getBreachForSite("sub.breached.com");
  Assert.ok(subdomainBreach, "Should find breach for subdomain");
  Assert.equal(
    subdomainBreach.Name,
    "Breached",
    "Should return the correct breach for subdomain"
  );

  const noBreach = await breachAlertsData.getBreachForSite("safe-site.com");
  Assert.equal(noBreach, null, "Should return null for non-breached site");

  const nullBreach = await breachAlertsData.getBreachForSite(null);
  Assert.equal(nullBreach, null, "Should return null for null input");
});

add_task(async function test_getAllBreaches() {
  const breachAlertsData = new BreachAlertsData();

  const allBreaches = await breachAlertsData.getAllBreaches();
  Assert.equal(
    allBreaches.length,
    TEST_BREACHES.length,
    "Should return all breaches"
  );
  Assert.deepEqual(
    allBreaches,
    await breachAlertsData.getAllBreaches(),
    "Should be same as getAllBreaches"
  );
});
