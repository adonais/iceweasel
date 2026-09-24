/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Bug 2067308: a restarted transaction reports the connection statuses again on
// the same channel, so pairing the first with the last would count the interval
// between attempts into dns, connect and send at once. nsITimedChannel keeps
// them per attempt, which is where the phases come from.
//
// The fixtures are the reporter's HAR entry 0 (attachment 9631898) and the pcap
// it came from (attachment 9631899): a request that really took 10558ms,
// reported as dns 10163, connect 10238, send 10246, total 20720.

const { NetworkTimings } = ChromeUtils.importESModule(
  "resource://devtools/shared/network-observer/NetworkTimings.sys.mjs"
);

// Microseconds. The attempt that sent its 0-RTT data and stalled until the
// server reset the connection, then the attempt that served the request.
const REQUEST_START = 0;
const FAILED = {
  resolving: 1000,
  resolved: 1500,
  connecting: 1600,
  connected: 83_000,
  sending: 84_600,
};
const SERVING = {
  resolving: 10_120_000,
  resolved: 10_164_000,
  connecting: 10_161_000,
  connected: 10_239_600,
  tlsStarting: 10_239_600,
  tlsEnding: 10_330_600,
  sending: 10_330_600,
};
const RESPONSE_START = 10_521_600;
const RESPONSE_COMPLETE = 10_557_600;

const toMs = microseconds => Math.round(microseconds / 1000);
const ELAPSED_MS = toMs(RESPONSE_COMPLETE - REQUEST_START);
const SERVING_MS = toMs(RESPONSE_COMPLETE - SERVING.resolving);
const STALL_MS = toMs(SERVING.resolving - REQUEST_START);
const SLACK_MS = 100;

const TIMING_KEYS = [
  "blocked",
  "dns",
  "connect",
  "ssl",
  "send",
  "wait",
  "receive",
];

// What NetworkObserver records: `first` written once, `last` overwritten, so the
// two attempts are indistinguishable.
const TWO_ATTEMPT_TIMINGS = {
  REQUEST_HEADER: { first: REQUEST_START, last: REQUEST_START },
  STATUS_RESOLVING: { first: FAILED.resolving, last: SERVING.resolving },
  STATUS_RESOLVED: { first: FAILED.resolved, last: SERVING.resolved },
  STATUS_CONNECTING_TO: { first: FAILED.connecting, last: SERVING.connecting },
  STATUS_CONNECTED_TO: { first: FAILED.connected, last: SERVING.connected },
  STATUS_TLS_STARTING: {
    first: SERVING.tlsStarting,
    last: SERVING.tlsStarting,
  },
  STATUS_TLS_ENDING: { first: SERVING.tlsEnding, last: SERVING.tlsEnding },
  STATUS_SENDING_TO: { first: FAILED.sending, last: SERVING.sending },
  RESPONSE_START: { first: RESPONSE_START, last: RESPONSE_START },
  RESPONSE_COMPLETE: { first: RESPONSE_COMPLETE, last: RESPONSE_COMPLETE },
};

// One healthy attempt, for the control.
const ONE_ATTEMPT_TIMINGS = {
  REQUEST_HEADER: { first: 0, last: 0 },
  STATUS_RESOLVING: { first: 1000, last: 1000 },
  STATUS_RESOLVED: { first: 2000, last: 2000 },
  STATUS_CONNECTING_TO: { first: 2600, last: 2600 },
  STATUS_CONNECTED_TO: { first: 83_600, last: 83_600 },
  STATUS_TLS_STARTING: { first: 83_600, last: 83_600 },
  STATUS_TLS_ENDING: { first: 174_600, last: 174_600 },
  STATUS_SENDING_TO: { first: 174_600, last: 174_600 },
  RESPONSE_START: { first: 365_600, last: 365_600 },
  RESPONSE_COMPLETE: { first: 401_600, last: 401_600 },
};

// nsHttpTransaction::Restart clears mTimings, and for a retry onto a new
// connection BootstrapTimings refills it, so the channel describes the attempt
// that served the request.
const SERVING_TIMED_CHANNEL = {
  asyncOpenTime: 1,
  domainLookupStartTime: SERVING.resolving,
  domainLookupEndTime: SERVING.resolved,
  connectStartTime: SERVING.connecting,
  tcpConnectEndTime: SERVING.connected,
  secureConnectionStartTime: SERVING.tlsStarting,
  connectEndTime: SERVING.tlsEnding,
  requestStartTime: SERVING.sending,
  responseStartTime: RESPONSE_START,
  responseEndTime: RESPONSE_COMPLETE,
};

const ONE_ATTEMPT_TIMED_CHANNEL = {
  asyncOpenTime: 1,
  domainLookupStartTime: 1000,
  domainLookupEndTime: 2000,
  connectStartTime: 2600,
  tcpConnectEndTime: 83_600,
  secureConnectionStartTime: 83_600,
  connectEndTime: 174_600,
  requestStartTime: 174_600,
  responseStartTime: 365_600,
  responseEndTime: 401_600,
};

function makeChannel(timedChannelValues = {}) {
  return {
    QueryInterface: ChromeUtils.generateQI(["nsITimedChannel"]),
    asyncOpenTime: 0,
    requestStartTime: 0,
    responseStartTime: 0,
    responseEndTime: 0,
    tcpConnectEndTime: 0,
    connectStartTime: 0,
    connectEndTime: 0,
    secureConnectionStartTime: 0,
    domainLookupStartTime: 0,
    domainLookupEndTime: 0,
    ...timedChannelValues,
  };
}

function extract(timings, timedChannelValues, activityValues = {}) {
  const result = NetworkTimings.extractHarTimings({
    fromCache: false,
    channel: makeChannel(timedChannelValues),
    timings,
    ...activityValues,
  });
  info(
    `timings=${JSON.stringify(result.timings)} ` +
      `offsets=${JSON.stringify(result.offsets)} total=${result.total}`
  );
  return result;
}

function sumPhases(harTimings) {
  return TIMING_KEYS.reduce(
    (sum, key) => (harTimings[key] > 0 ? sum + harTimings[key] : sum),
    0
  );
}

function assertTotalMatches(total, expectedMs) {
  Assert.lessOrEqual(
    Math.abs(total - expectedMs),
    SLACK_MS,
    `total (${total}) matches the real duration (${expectedMs}ms)`
  );
}

// The waterfall draws each bar at offsets[key], so they have to advance with the
// phases they position and end within the total.
function assertOffsetsFitTotal(offsets, timings, total) {
  TIMING_KEYS.reduce((prev, key) => {
    Assert.lessOrEqual(
      offsets[prev],
      offsets[key],
      `offsets.${prev} (${offsets[prev]}) <= offsets.${key} (${offsets[key]})`
    );
    return key;
  });

  Assert.lessOrEqual(
    offsets.receive + timings.receive,
    total,
    "the last bar ends within the reported total"
  );
}

add_task(async function test_phases_measure_the_serving_attempt() {
  const { timings } = extract(TWO_ATTEMPT_TIMINGS, SERVING_TIMED_CHANNEL);

  // No DNS query was sent on the wire; this is the serving attempt's cached
  // resolve.
  Assert.equal(
    timings.dns,
    toMs(SERVING.resolved - SERVING.resolving),
    "dns measures the serving attempt"
  );
  Assert.equal(
    timings.connect,
    toMs(SERVING.connected - SERVING.connecting),
    "connect measures the serving attempt"
  );
  Assert.equal(
    timings.ssl,
    toMs(SERVING.tlsEnding - SERVING.tlsStarting),
    "ssl measures the serving attempt"
  );
  Assert.equal(timings.send, 0, "send measures the serving attempt");
});

add_task(async function test_no_phase_exceeds_the_serving_attempt() {
  const { timings, total } = extract(
    TWO_ATTEMPT_TIMINGS,
    SERVING_TIMED_CHANNEL
  );

  for (const key of TIMING_KEYS.filter(k => k !== "blocked")) {
    Assert.lessOrEqual(
      timings[key],
      SERVING_MS + SLACK_MS,
      `${key} (${timings[key]}) fits inside the serving attempt (${SERVING_MS}ms)`
    );
  }

  // The stall is real and has to be reported somewhere.
  Assert.lessOrEqual(
    Math.abs(timings.blocked - STALL_MS),
    SLACK_MS,
    `blocked (${timings.blocked}) accounts for the stall (${STALL_MS}ms)`
  );

  // Two-sided: dropping the inflation without crediting blocked would leave the
  // total too small, which is equally wrong.
  assertTotalMatches(total, ELAPSED_MS);
});

add_task(async function test_phase_sum_never_exceeds_elapsed() {
  // har-builder.js sums every phase for entry.time.
  const { timings } = extract(TWO_ATTEMPT_TIMINGS, SERVING_TIMED_CHANNEL);
  const sum = sumPhases(timings);

  Assert.lessOrEqual(
    sum,
    ELAPSED_MS + SLACK_MS,
    `phases (${sum}) do not sum past the real duration (${ELAPSED_MS}ms)`
  );
});

add_task(async function test_offsets_monotonic() {
  const { offsets, timings, total } = extract(
    TWO_ATTEMPT_TIMINGS,
    SERVING_TIMED_CHANNEL
  );

  assertOffsetsFitTotal(offsets, timings, total);
});

add_task(async function test_restart_onto_pooled_connection() {
  // The conn mgr can re-dispatch onto an established connection, which resolves
  // and connects nothing: Activate only bootstraps a connection's first
  // transaction, so the channel has only its own requestStart. The failed
  // attempt's STATUS_SENDING_TO is still there.
  const { offsets, timings, total } = extract(TWO_ATTEMPT_TIMINGS, {
    asyncOpenTime: 1,
    requestStartTime: SERVING.sending,
    responseStartTime: RESPONSE_START,
    responseEndTime: RESPONSE_COMPLETE,
  });

  Assert.equal(timings.send, 0, "send measures the serving attempt");

  // The absent phases must not walk the bars backwards.
  assertOffsetsFitTotal(offsets, timings, total);

  Assert.lessOrEqual(
    Math.abs(timings.blocked - toMs(SERVING.sending)),
    SLACK_MS,
    `blocked (${timings.blocked}) accounts for the wait for a connection`
  );
  assertTotalMatches(total, ELAPSED_MS);
});

add_task(async function test_restart_after_a_response_was_parsed() {
  // A 425, a 421 or an HTTP/2 to HTTP/1 fallback restarts after the response
  // head was parsed, so RESPONSE_START belongs to the attempt that failed and is
  // never reported again. Pairing it with the serving attempt would spread
  // `receive` across the whole gap, and count it a second time after `blocked`
  // already covers it.
  const { timings, total } = extract(
    {
      ...TWO_ATTEMPT_TIMINGS,
      RESPONSE_START: { first: FAILED.sending + 1000, last: RESPONSE_START },
    },
    SERVING_TIMED_CHANNEL
  );

  Assert.lessOrEqual(
    timings.receive,
    SERVING_MS + SLACK_MS,
    `receive (${timings.receive}) fits inside the serving attempt`
  );
  Assert.greaterOrEqual(timings.wait, 0, "wait is not left negative");
  assertTotalMatches(total, ELAPSED_MS);
});

add_task(async function test_multi_write_send_is_measured() {
  // A body split over several writes reports a genuinely long send. The clamp
  // must not flatten it.
  const sends = [174_600, 400_000, 674_600];
  const complete = 901_600;
  const { offsets, timings, total } = extract(
    {
      ...ONE_ATTEMPT_TIMINGS,
      STATUS_SENDING_TO: { first: sends[0], last: sends.at(-1) },
      RESPONSE_START: { first: 865_600, last: 865_600 },
      RESPONSE_COMPLETE: { first: complete, last: complete },
    },
    {
      ...ONE_ATTEMPT_TIMED_CHANNEL,
      responseStartTime: 865_600,
      responseEndTime: complete,
    }
  );

  Assert.equal(
    timings.send,
    toMs(sends.at(-1) - sends[0]),
    "a multi-write send spans the first write to the last"
  );

  // The offset has to be where sending began, not where it finished, or the bar
  // is drawn past the end of the response and the duration is counted twice.
  assertTotalMatches(total, toMs(complete));
  assertOffsetsFitTotal(offsets, timings, total);
});

add_task(async function test_zero_rtt_send_is_measured() {
  // With accepted 0-RTT the request goes out before the handshake finishes, and
  // Apply0RTTTimingOverride moves connectEnd to that send point. The clamp must
  // leave such a send alone.
  const earlyData = 90_000;
  const { timings } = extract(
    {
      ...ONE_ATTEMPT_TIMINGS,
      STATUS_SENDING_TO: { first: earlyData, last: 140_000 },
    },
    {
      ...ONE_ATTEMPT_TIMED_CHANNEL,
      connectEndTime: earlyData,
      requestStartTime: earlyData,
    }
  );

  Assert.equal(
    timings.send,
    toMs(140_000 - earlyData),
    "an accepted 0-RTT send is measured from the early data"
  );

  // The channel's connectEnd is rewritten to the early data send point here, so
  // the handshake has to keep coming from the statuses.
  Assert.equal(
    timings.ssl,
    toMs(174_600 - 83_600),
    "the handshake is measured in full despite the 0-RTT connectEnd"
  );
});

function withoutTlsStatuses() {
  const timings = { ...ONE_ATTEMPT_TIMINGS };
  delete timings.STATUS_TLS_STARTING;
  delete timings.STATUS_TLS_ENDING;
  return timings;
}

add_task(async function test_handshake_measures_the_serving_attempt() {
  // Both attempts ran a handshake and reported it, so STATUS_TLS_STARTING.first
  // is the failed attempt's while STATUS_TLS_ENDING.last is the serving one's.
  // This is the variant behind HAR entries 5, 9, 11, 74 and 75, where the stall
  // lands in ssl and connect stays short.
  const { timings } = extract(
    {
      ...TWO_ATTEMPT_TIMINGS,
      STATUS_TLS_STARTING: {
        first: FAILED.connected,
        last: SERVING.tlsStarting,
      },
    },
    SERVING_TIMED_CHANNEL
  );

  Assert.equal(
    timings.ssl,
    toMs(SERVING.tlsEnding - SERVING.tlsStarting),
    "ssl measures the serving attempt's handshake"
  );
  Assert.lessOrEqual(
    timings.ssl,
    SERVING_MS + SLACK_MS,
    `ssl (${timings.ssl}) fits inside the serving attempt (${SERVING_MS}ms)`
  );
});

add_task(async function test_handshake_without_tls_statuses() {
  // Happy Eyeballs runs the handshake against a null transaction, so neither TLS
  // status reaches the channel. The channel recorded it regardless.
  const { timings } = extract(withoutTlsStatuses(), ONE_ATTEMPT_TIMED_CHANNEL);

  Assert.equal(
    timings.ssl,
    toMs(
      ONE_ATTEMPT_TIMED_CHANNEL.connectEndTime -
        ONE_ATTEMPT_TIMED_CHANNEL.secureConnectionStartTime
    ),
    "the handshake is reported from the channel's own timings"
  );
});

add_task(async function test_plain_http_connect_is_reported() {
  // A plain HTTP request never stamps secureConnectionStart. Its connect still
  // has to come from the channel, and no handshake may be invented for it.
  const { timings } = extract(withoutTlsStatuses(), {
    ...ONE_ATTEMPT_TIMED_CHANNEL,
    secureConnectionStartTime: 0,
  });

  Assert.equal(
    timings.connect,
    toMs(
      ONE_ATTEMPT_TIMED_CHANNEL.tcpConnectEndTime -
        ONE_ATTEMPT_TIMED_CHANNEL.connectStartTime
    ),
    "connect is reported for a request with no handshake"
  );
  Assert.lessOrEqual(timings.ssl, 0, "no handshake is invented");
});

add_task(async function test_http3_connect_not_reported_twice() {
  // For HTTP/3 secureConnectionStart is stamped when connecting starts, and no
  // TLS statuses reach the channel. Taking it would report the whole connect a
  // second time as ssl.
  const { timings } = extract(withoutTlsStatuses(), {
    ...ONE_ATTEMPT_TIMED_CHANNEL,
    secureConnectionStartTime: ONE_ATTEMPT_TIMED_CHANNEL.connectStartTime,
  });

  Assert.lessOrEqual(timings.ssl, 0, "no handshake is invented for HTTP/3");
});

add_task(async function test_single_attempt_unchanged() {
  // Control: one attempt, where the statuses and the channel agree.
  const { timings, total } = extract(
    ONE_ATTEMPT_TIMINGS,
    ONE_ATTEMPT_TIMED_CHANNEL
  );

  Assert.deepEqual(
    timings,
    {
      blocked: 1,
      dns: 1,
      connect: 81,
      ssl: 91,
      send: 0,
      wait: 191,
      receive: 36,
    },
    "a single-attempt request keeps its phase durations"
  );
  assertTotalMatches(total, toMs(401_600));
});

// Throttling is simulated in NetworkObserver, which holds the response
// activities back and redispatches them with delayed timestamps. The channel
// records the transfer that really happened, so the response phases have to
// follow the activities or a throttled request is reported at full speed.
add_task(async function test_download_throttling_uses_the_activities() {
  const delayed = {
    ...ONE_ATTEMPT_TIMINGS,
    RESPONSE_COMPLETE: { first: 2_365_600, last: 2_365_600 },
  };

  const { timings: unthrottled } = extract(delayed, ONE_ATTEMPT_TIMED_CHANNEL);
  Assert.equal(
    unthrottled.receive,
    36,
    "without throttling the channel's own record is preferred"
  );

  const { timings } = extract(delayed, ONE_ATTEMPT_TIMED_CHANNEL, {
    downloadThrottle: {},
  });
  Assert.equal(
    timings.receive,
    2000,
    "a throttled transfer is measured from the delayed activities"
  );
});

add_task(async function test_throttled_restart_measures_the_serving_attempt() {
  // Throttling and a restart past the response head at once: the delayed
  // RESPONSE_START belongs to the attempt that failed, so pairing it with the
  // delayed RESPONSE_COMPLETE would spread `receive` over the whole stall that
  // `blocked` already covers.
  const { timings, total } = extract(
    {
      ...TWO_ATTEMPT_TIMINGS,
      RESPONSE_START: { first: FAILED.sending + 1000, last: RESPONSE_START },
    },
    SERVING_TIMED_CHANNEL,
    { downloadThrottle: {} }
  );

  Assert.lessOrEqual(
    timings.receive,
    SERVING_MS + SLACK_MS,
    `receive (${timings.receive}) fits inside the serving attempt`
  );
  Assert.greaterOrEqual(timings.wait, 0, "wait is not left negative");
  assertTotalMatches(total, ELAPSED_MS);
});
