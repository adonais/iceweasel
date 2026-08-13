/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global require, module */

const { logTest } = require("./utils/profiling");

const TEST_URL = "https://www.cloudflare.com/";

// commands.navigate() blocks on the full `load` event, which live Android pages
// frequently never fire, hanging the run until it trips maxRunTime. We only need
// early navigation timing (available at responseStart), so navigate manually and
// poll for the response to start, capped so a stalled connection fails fast.
//
// The poll is hand-rolled rather than commands.wait.byCondition() on purpose:
// byCondition() logs at ERROR level on timeout, and raptor kills and retries the
// whole browsertime run on any ERROR-level output. A stalled connection is an
// outcome we want to record, not a job failure, so this path must stay non-error.
const RESPONSE_WAIT_MS = 30000;
const RESPONSE_POLL_MS = 500;

// The raptor results parser only keeps numeric custom_data metrics, so the
// negotiated protocol is recorded as a version number: 3 = h3, 2 = h2,
// 1 = http/1.x, 0 = unknown.
function protocolToNumber(protocol) {
  if (protocol === "h3") {
    return 3;
  }
  if (protocol === "h2") {
    return 2;
  }
  if (protocol === "http/1.1" || protocol === "http/1.0") {
    return 1;
  }
  return 0;
}

// Read the protocol version and time-to-request-start of the root document from
// the page (content) context. This works on all platforms, including Android.
async function readNavInfo(commands) {
  return commands.js.run(`
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) {
      return {
        protocol: "",
        time_to_request_start: 0,
        redirect_ms: 0,
        dns_ms: 0,
        connect_ms: 0,
        tls_ms: 0,
        ttfb_ms: 0,
        fresh: false,
      };
    }
    const dur = (start, end) => (start > 0 && end > start ? end - start : 0);
    return {
      protocol: nav.nextHopProtocol,
      time_to_request_start: nav.requestStart,
      // Connection-setup breakdown (ms). requestStart follows redirect + DNS +
      // connect + TLS, so these localise a slow time_to_request_start.
      redirect_ms: dur(nav.redirectStart, nav.redirectEnd),
      dns_ms: dur(nav.domainLookupStart, nav.domainLookupEnd),
      connect_ms: dur(nav.connectStart, nav.connectEnd),
      tls_ms: dur(nav.secureConnectionStart, nav.connectEnd),
      ttfb_ms: dur(nav.requestStart, nav.responseStart),
      // Fresh connect: connectEnd > connectStart; a reused pooled connection
      // reports them equal. (secureConnectionStart falls back to connectStart.)
      fresh: nav.connectEnd - nav.connectStart > 0,
    };
  `);
}

// Navigate to `url` without going through commands.navigate() (which blocks on the
// full `load` event). Returns true once the new document has started receiving its
// response, or false if that has not happened within RESPONSE_WAIT_MS.
async function navigateAndWaitForResponse(commands, context, url) {
  await commands.js.run(`window.location.href = ${JSON.stringify(url)};`);

  // Poll for the response to start.
  const polls = Math.ceil(RESPONSE_WAIT_MS / RESPONSE_POLL_MS);
  for (let i = 0; i < polls; i++) {
    await commands.wait.byTime(RESPONSE_POLL_MS);
    try {
      const started = await commands.js.run(`
        const nav = performance.getEntriesByType('navigation')[0];
        return !!nav && nav.responseStart > 0 && !location.href.startsWith("about:");
      `);
      if (started) {
        return true;
      }
    } catch (e) {
      // Document is mid-navigation; retry on the next poll.
    }
  }
  context.log.info(
    "No response from " + url + " within " + RESPONSE_WAIT_MS + "ms"
  );
  return false;
}

module.exports = logTest(
  "hev3 connection pageload",
  async function (context, commands) {
    context.log.info(
      "Starting a Happy Eyeballs v3 connection test against " + TEST_URL
    );

    await commands.navigate("about:blank");

    // Idle to let Firefox's connectivity-service and startup settle. Chrome has no
    // connectivity-service, but still gets a shorter settle since we don't model its
    // connection-pool internals.
    const settleMs = context.options.browser === "chrome" ? 15000 : 30000;
    await commands.wait.byTime(settleMs);

    // Cold navigation: nothing has warmed the pool to the test host, so this
    // establishes a fresh connection whose protocol and setup time we record.
    // Wrapped in a measure start/stop so the custom_data below has a result to
    // attach to.
    await commands.measure.start();
    const started = await navigateAndWaitForResponse(
      commands,
      context,
      TEST_URL
    );
    await commands.measure.stop();

    // Every subtest is summarised with a geometric mean, so a single 0 replicate
    // zeroes the result. A timeout has no meaningful per-phase/protocol/fresh value,
    // so record only the (capped) time_to_request_start and omit the rest, leaving
    // each metric's summary to reflect the connections that actually succeeded.
    let customData;
    if (started) {
      const navInfo = await readNavInfo(commands);
      context.log.info("protocol: " + navInfo.protocol);
      context.log.info(
        "time_to_request_start: " + navInfo.time_to_request_start
      );
      context.log.info("fresh_connection: " + navInfo.fresh);
      // All values must be numeric: the raptor results parser drops non-numeric
      // custom_data. Protocol is a version number and fresh_connection is 1/0.
      customData = {
        protocol: protocolToNumber(navInfo.protocol),
        time_to_request_start: navInfo.time_to_request_start,
        redirect_ms: navInfo.redirect_ms,
        dns_ms: navInfo.dns_ms,
        connect_ms: navInfo.connect_ms,
        tls_ms: navInfo.tls_ms,
        ttfb_ms: navInfo.ttfb_ms,
        fresh_connection: navInfo.fresh ? 1 : 0,
      };
    } else {
      customData = { time_to_request_start: RESPONSE_WAIT_MS };
    }

    await commands.measure.addObject({ custom_data: customData });

    context.log.info("Happy Eyeballs v3 connection test finished.");
    return true;
  }
);
