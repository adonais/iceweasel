/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env node */
/* global require, module */

const { logTest } = require("./utils/profiling");

module.exports = logTest(
  "multi-domain dns lookup pageload",
  async function (context, commands) {
    context.log.info(
      "Starting multi-domain pageload to measure DNS lookup time"
    );

    const testType = `${context.options.browsertime.test_type}`;
    context.log.info("testType: " + testType);

    const url =
      "https://mozilla-necko.github.io/tests/dns/trr_multi_domain.html";

    await commands.navigate("about:blank");

    // Idle to allow for confirmation
    await commands.wait.byTime(5000);

    if (testType === "trr_warm") {
      // Ensure the trr connection has been warmed up by making an arbitrary request
      await commands.navigate("https://www.w3.org");
      await commands.wait.byTime(2000);
    }

    // Start measuring
    await commands.measure.start();
    await commands.navigate(url);

    // Wait for all domains to load (or fail)
    await commands.wait.byTime(10000);

    await commands.measure.stop();

    // Get pageload time
    let pageload_time = await commands.js.run(`
      return (window.performance.timing.loadEventEnd - window.performance.timing.navigationStart);
    `);

    // Extract DNS timing data from the page
    let dns_data = await commands.js.run(`
      const entries = window.performance.getEntriesByType('resource');

      let totalDNS = 0;
      let maxDNS = 0;
      let minDNS = Infinity;
      let dnsCount = 0;

      const dnsTimings = [];

      entries.forEach(entry => {
        const dnsTime = entry.domainLookupEnd - entry.domainLookupStart;
        if (dnsTime > 0) {
          totalDNS += dnsTime;
          maxDNS = Math.max(maxDNS, dnsTime);
          minDNS = Math.min(minDNS, dnsTime);
          dnsCount++;
          dnsTimings.push({
            url: entry.name,
            dns_time: dnsTime
          });
        }
      });

      return {
        avg_dns_lookup_time: dnsCount > 0 ? totalDNS / dnsCount : 0,
        total_dns_lookup_time: totalDNS,
        total_resource_entries: entries.length,
        dns_entries_count: dnsCount,
        max_dns_lookup_time: maxDNS === 0 ? 0 : maxDNS,
        min_dns_lookup_time: minDNS === Infinity ? 0 : minDNS,
        dns_timings: dnsTimings
      };
    `);

    context.log.info("pageload_time: " + pageload_time);
    context.log.info(
      "total_resource_entries: " + dns_data.total_resource_entries
    );
    context.log.info("dns_entries_count: " + dns_data.dns_entries_count);
    context.log.info("avg_dns_lookup_time: " + dns_data.avg_dns_lookup_time);
    context.log.info(
      "total_dns_lookup_time: " + dns_data.total_dns_lookup_time
    );
    context.log.info("max_dns_lookup_time: " + dns_data.max_dns_lookup_time);
    context.log.info("min_dns_lookup_time: " + dns_data.min_dns_lookup_time);

    await commands.measure.addObject({
      custom_data: {
        pageload_time,
        total_resource_entries: dns_data.total_resource_entries,
        dns_entries_count: dns_data.dns_entries_count,
        avg_dns_lookup_time: dns_data.avg_dns_lookup_time,
        total_dns_lookup_time: dns_data.total_dns_lookup_time,
        max_dns_lookup_time: dns_data.max_dns_lookup_time,
        min_dns_lookup_time: dns_data.min_dns_lookup_time,
        dns_timings: dns_data.dns_timings,
      },
    });

    context.log.info("Multi-domain DNS lookup test finished.");
    return true;
  }
);
