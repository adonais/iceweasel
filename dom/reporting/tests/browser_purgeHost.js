/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SJS_PATH = "/browser/dom/reporting/tests/reporting_endpoints.sjs";

async function registerEndpointsFor(origin) {
  await BrowserTestUtils.withNewTab(origin + SJS_PATH, async () => {});
  ok(
    ChromeUtils.hasReportingHeaderForOrigin(origin),
    `Reporting header was stored for ${origin}`
  );
}

function purgeHost(host) {
  Services.obs.notifyObservers(null, "reporting:purge-host", host);
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.reporting.enabled", true],
      ["dom.reporting.header.enabled", true],
    ],
  });

  registerCleanupFunction(() => {
    Services.obs.notifyObservers(null, "reporting:purge-all");
  });
});

add_task(async function purgeHostRemovesExactHost() {
  await registerEndpointsFor("https://example.com");

  purgeHost("example.com");

  ok(
    !ChromeUtils.hasReportingHeaderForOrigin("https://example.com"),
    "purge-host removed the origin whose host is exactly the purged host"
  );
});

add_task(async function purgeHostRemovesSubdomains() {
  await registerEndpointsFor("https://test1.example.com");

  purgeHost("example.com");

  ok(
    !ChromeUtils.hasReportingHeaderForOrigin("https://test1.example.com"),
    "purge-host removed the origin belonging to a subdomain of the purged host"
  );
});

add_task(async function purgeHostKeepsUnrelatedHosts() {
  await registerEndpointsFor("https://example.com");
  await registerEndpointsFor("https://example.org");

  purgeHost("example.org");

  ok(
    ChromeUtils.hasReportingHeaderForOrigin("https://example.com"),
    "purge-host did not remove an unrelated origin"
  );
  ok(
    !ChromeUtils.hasReportingHeaderForOrigin("https://example.org"),
    "purge-host removed the purged origin"
  );

  purgeHost("example.com");
});

add_task(async function purgeHostRequiresADomainBoundary() {
  await registerEndpointsFor("https://example.com");

  purgeHost("ample.com");

  ok(
    ChromeUtils.hasReportingHeaderForOrigin("https://example.com"),
    "purge-host did not remove an origin whose host merely ends with the purged host"
  );

  purgeHost("example.com");
});
