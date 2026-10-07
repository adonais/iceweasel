/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPProxyableRuleProvider } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPSiteRuleProviders.sys.mjs"
);

const makePrincipal = url =>
  Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(url),
    {}
  );

const provider = new IPPProxyableRuleProvider();

/**
 * Only http(s) traffic can be proxied, so anything else is EXCLUDED. A missing
 * principal is treated the same way, which is what makes the channel path fail
 * safe when it cannot attribute a channel to an origin.
 */
add_task(function test_non_http_schemes_are_excluded() {
  for (const url of ["about:preferences", "file:///tmp/page.html"]) {
    Assert.equal(
      provider.getRule(makePrincipal(url)),
      IPPPrincipalRules.EXCLUDED,
      `${url} -> EXCLUDED`
    );
  }

  Assert.equal(
    provider.getRule(null),
    IPPPrincipalRules.EXCLUDED,
    "missing principal -> EXCLUDED"
  );
});

/**
 * A null principal's scheme is moz-nullprincipal even when it backs real
 * http(s) content (e.g. a sandboxed iframe), so the scheme says nothing about
 * whether the traffic should be proxied and the provider must abstain.
 */
add_task(function test_null_principal_is_not_excluded_on_scheme() {
  Assert.equal(
    provider.getRule(Services.scriptSecurityManager.createNullPrincipal({})),
    null,
    "null principal -> no opinion"
  );
});

/**
 * Loopback hosts and LAN addresses never leave the machine or the local
 * network, so proxying them is pointless and breaks local development.
 */
add_task(function test_local_connections_are_excluded() {
  const tests = [
    // True either LAN or Loopback
    ["http://[::]", true],
    ["http://[::1]", true],
    ["http://[::1]:1234", true],
    ["http://[::ffff:0:0]", true],
    ["http://127.0.0.1", true],
    ["http://127.1.2.3", true],
    ["http://10.1.2.3", true],
    ["http://192.168.0.1", true],
    ["http://169.254.0.1", true],
    ["http://localhost", true],
    ["http://something.localhost", true],
    // False, anything else
    ["http://something.test", false],
    ["http://looocalhost", false],
    ["http://localhost.something", false],
    ["http://localhost6", false],
    ["http://looocalhost6", false],
    ["http://something.localhost6", false],
    ["http://localhost6.something", false],
    ["http://something.example", false],
    ["http://example.com", false],
    ["http://something.invalid", false],
    ["http://invalid.com", false],
    ["http://test.com", false],
    ["http://128.1.2.3", false],
    ["http://169.253.0.1", false],
    ["http://193.168.0.1", false],
    ["http://11.1.2.3", false],
  ];

  for (const [url, isLocal] of tests) {
    Assert.equal(
      provider.getRule(makePrincipal(url)),
      isLocal ? IPPPrincipalRules.EXCLUDED : null,
      url
    );
  }
});

/**
 * A normal https site is left to the providers further down the list.
 */
add_task(function test_proxyable_site_abstains() {
  Assert.equal(
    provider.getRule(makePrincipal("https://example.com")),
    null,
    "plain https principal -> no opinion"
  );
});
