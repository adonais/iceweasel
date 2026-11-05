/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global require, module */

const { logTest } = require("./utils/profiling");

// The replayed timelines run for up to 30s after the document request.
const DURATION_MS = 32000;

module.exports = logTest(
  "doh busy site pageload",
  async function (context, commands) {
    const serverUrl = context.options.browsertime.server_url;
    const site = context.options.browsertime.site;
    if (!serverUrl || !site) {
      throw new Error(
        "doh_busy_site: needs --browsertime.server_url (from " +
          "support_class=doh_busy_site.py) and --browsertime.site"
      );
    }
    await commands.navigate("about:blank");
    // Idle to allow for the TRR confirmation, like the other DoH tests.
    await commands.wait.byTime(2000);

    await commands.measure.start();
    await commands.navigate(`${serverUrl}/?site=${site}`);
    await commands.wait.byTime(DURATION_MS);
    await commands.measure.stop();

    const data = await commands.js.run(`
      const entries = performance.getEntriesByType("resource");
      const dns = entries
        .map(e => e.domainLookupEnd - e.domainLookupStart)
        .sort((a, b) => a - b);
      const pct = p =>
        dns.length ? dns[Math.min(dns.length - 1, Math.floor(p * dns.length))] : 0;
      const dnsTotal = dns.reduce((sum, t) => sum + t, 0);
      // Same-origin stats from the test server; sync so executeScript can return it.
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "/stats", false);
      xhr.send();
      return {
        ...JSON.parse(xhr.responseText),
        resources: entries.length,
        // Images that failed to load, e.g. after a fallback to native DNS.
        resources_failed: window.busy.failed,
        dns_phase_count: dns.filter(t => t > 0).length,
        dns_total_ms: dnsTotal,
        dns_mean_ms: dns.length ? dnsTotal / dns.length : 0,
        dns_p99: pct(0.99),
        dns_max: dns[dns.length - 1] || 0,
        dns_over_100ms: dns.filter(t => t > 100).length,
      };
    `);

    context.log.info(
      `doh_busy_site ${site}: ${data.resources} resources ` +
        `(${data.resources_failed} failed), ` +
        `${data.dns_phase_count} DNS phases, mean=${data.dns_mean_ms} ` +
        `p99=${data.dns_p99} max=${data.dns_max} ` +
        `over100=${data.dns_over_100ms} ` +
        `doh_reconnects=${data.doh_reconnects}`
    );

    await commands.measure.addObject({ custom_data: data });
    return true;
  }
);
