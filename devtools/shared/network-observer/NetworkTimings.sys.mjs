/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helper singleton to compute network timings for a given httpActivity object.
 */
export const NetworkTimings = new (class {
  /**
   * Convert the httpActivity timings in HAR compatible timings. The HTTP
   * activity object holds the raw timing information in |timings| - these are
   * timings stored for each activity notification. The HAR timing information
   * is constructed based on these lower level data.
   *
   * @param {object} httpActivity
   *     The HTTP activity object we are working with.
   * @return {object}
   *     This object holds three properties:
   *     - {Object} offsets: the timings computed as offsets from the initial
   *     request start time.
   *     - {Object} timings: the HAR timings object
   *     - {number} total: the total time for all of the request and response
   */
  extractHarTimings(httpActivity) {
    if (httpActivity.fromCache) {
      // If it came from the browser cache, we have no timing
      // information and these should all be 0
      return this.getEmptyHARTimings();
    }

    const timings = httpActivity.timings;
    const harTimings = {};

    harTimings.blocked = this.#getBlockedTiming(timings);
    // DNS timing information is available only in when the DNS record is not
    // cached.
    harTimings.dns = this.#getDnsTiming(timings);
    harTimings.connect = this.#getConnectTiming(timings);

    let { secureConnectionStartTime, secureConnectionStartTimeRelative } =
      this.#getSecureConnectionStartTimeInfo(timings);

    // sometimes the connection information events are attached to a speculative
    // channel instead of this one, but necko might glue them back together in the
    // nsITimedChannel interface used by Resource and Navigation Timing
    const timedChannel = httpActivity.channel.QueryInterface(
      Ci.nsITimedChannel
    );

    const {
      requestStartTimeTc,
      responseStartTimeTc,
      responseEndTimeTc,
      tcpConnectEndTimeTc,
      connectStartTimeTc,
      connectEndTimeTc,
      secureConnectionStartTimeTc,
      domainLookupEndTimeTc,
      domainLookupStartTimeTc,
    } = this.#getDataFromTimedChannel(timedChannel);

    harTimings.ssl = this.#getSslTiming(timings, secureConnectionStartTimeTc);

    const fromChannel = this.#getChannelConnectTimings(harTimings.ssl, {
      connectStartTimeTc,
      tcpConnectEndTimeTc,
      connectEndTimeTc,
      secureConnectionStartTimeTc,
    });

    if (fromChannel) {
      harTimings.connect = fromChannel.connect;
      harTimings.ssl = fromChannel.ssl;
      secureConnectionStartTime = fromChannel.secureConnectionStart;
      secureConnectionStartTimeRelative = fromChannel.relative;
    }

    if (domainLookupEndTimeTc != 0 && domainLookupStartTimeTc != 0) {
      harTimings.dns = domainLookupEndTimeTc - domainLookupStartTimeTc;
    }

    // Established connection: any such status is a failed attempt's.
    const reusedConnection =
      requestStartTimeTc != 0 &&
      connectStartTimeTc == 0 &&
      domainLookupStartTimeTc == 0;
    if (reusedConnection) {
      harTimings.dns = -1;
      harTimings.connect = -1;
      harTimings.ssl = -1;
      secureConnectionStartTime = 0;
      secureConnectionStartTimeRelative = false;
    }

    // Absorbs a failed attempt's time. Clamped: OnStopRequest can replace
    // domainLookupStart with an earlier DNS prefetch.
    const servingAttemptStart =
      domainLookupStartTimeTc || connectStartTimeTc || requestStartTimeTc;
    if (servingAttemptStart != 0 && timings.REQUEST_HEADER) {
      harTimings.blocked = Math.max(
        servingAttemptStart - timings.REQUEST_HEADER.first,
        0
      );
    }

    // Simulated throttling delays these activities; the channel's marks are
    // real, so they describe an unthrottled transfer. Clamping rather than
    // dropping them keeps a restart's stale RESPONSE_START out of the response.
    const throttled = httpActivity.downloadThrottle;
    const responseStart = throttled
      ? this.#clampToServingAttempt(
          timings.RESPONSE_START?.first ?? 0,
          responseStartTimeTc
        )
      : responseStartTimeTc;
    const responseEnd = throttled ? 0 : responseEndTimeTc;

    harTimings.send = this.#getSendTiming(timings, requestStartTimeTc);
    harTimings.wait = this.#getWaitTiming(timings, responseStart);
    harTimings.receive = this.#getReceiveTiming(
      timings,
      responseStart,
      responseEnd
    );
    let { startSendingTime, startSendingTimeRelative } =
      this.#getStartSendingTimeInfo(
        timings,
        connectStartTimeTc,
        requestStartTimeTc
      );

    if (secureConnectionStartTimeRelative) {
      secureConnectionStartTime = this.#convertTimeToMs(
        secureConnectionStartTime
      );
    }
    if (startSendingTimeRelative) {
      startSendingTime = this.#convertTimeToMs(startSendingTime);
    }

    const ot = this.#calculateOffsetAndTotalTime(
      harTimings,
      secureConnectionStartTime,
      startSendingTimeRelative,
      secureConnectionStartTimeRelative,
      startSendingTime
    );
    return {
      total: ot.total,
      timings: harTimings,
      offsets: ot.offsets,
    };
  }

  extractServerTimings(httpActivity) {
    const channel = httpActivity.channel;
    if (!channel || !channel.serverTiming) {
      return null;
    }

    const serverTimings = new Array(channel.serverTiming.length);

    for (let i = 0; i < channel.serverTiming.length; ++i) {
      const { name, duration, description } =
        channel.serverTiming.queryElementAt(i, Ci.nsIServerTiming);
      serverTimings[i] = { name, duration, description };
    }

    return serverTimings;
  }

  extractServiceWorkerTimings(httpActivity) {
    if (!httpActivity.fromServiceWorker) {
      return null;
    }
    const timedChannel = httpActivity.channel.QueryInterface(
      Ci.nsITimedChannel
    );

    return {
      launchServiceWorker:
        timedChannel.launchServiceWorkerEndTime -
        timedChannel.launchServiceWorkerStartTime,
      requestToServiceWorker:
        timedChannel.dispatchFetchEventEndTime -
        timedChannel.dispatchFetchEventStartTime,
      handledByServiceWorker:
        timedChannel.handleFetchEventEndTime -
        timedChannel.handleFetchEventStartTime,
    };
  }

  /**
   * For some requests such as cached or data: URI requests, we don't have
   * access to any timing information so all timings should be 0.
   *
   * @return {object}
   *     A timings object (@see extractHarTimings), with all values set to 0.
   */
  getEmptyHARTimings() {
    return {
      total: 0,
      timings: {
        blocked: 0,
        dns: 0,
        ssl: 0,
        connect: 0,
        send: 0,
        wait: 0,
        receive: 0,
      },
      offsets: {
        blocked: 0,
        dns: 0,
        ssl: 0,
        connect: 0,
        send: 0,
        wait: 0,
        receive: 0,
      },
    };
  }

  /**
   * The connect and handshake per attempt, which the statuses do not separate.
   *
   * @param {number} statusSsl
   *     The handshake duration the activity statuses reported, or -1.
   * @param {object} channelTimings
   *     The connect and handshake marks this attempt took from the channel, in
   *     microseconds, 0 when unset.
   * @return {object|null}
   *     null when the channel has no connect of its own, otherwise:
   *     - {number} connect: the connect duration
   *     - {number} ssl: the handshake duration, -1 when there was none
   *     - {number} secureConnectionStart: where the handshake began
   *     - {boolean} relative: whether that is an offset from the connect
   */
  #getChannelConnectTimings(
    statusSsl,
    {
      connectStartTimeTc,
      tcpConnectEndTimeTc,
      connectEndTimeTc,
      secureConnectionStartTimeTc,
    }
  ) {
    if (connectStartTimeTc == 0 || tcpConnectEndTimeTc == 0) {
      return null;
    }

    const connect = tcpConnectEndTimeTc - connectStartTimeTc;

    // HTTP/3 stamps it at connect start; a bootstrapped connection at connectEnd.
    if (
      secureConnectionStartTimeTc < tcpConnectEndTimeTc ||
      connectEndTimeTc <= secureConnectionStartTimeTc
    ) {
      return { connect, ssl: -1, secureConnectionStart: 0, relative: false };
    }

    return {
      connect,
      // Accepted 0-RTT rewrites connectEnd to the early data send.
      ssl:
        statusSsl > 0
          ? statusSsl
          : connectEndTimeTc - secureConnectionStartTimeTc,
      secureConnectionStart: secureConnectionStartTimeTc - connectStartTimeTc,
      relative: true,
    };
  }

  #getBlockedTiming(timings) {
    if (timings.STATUS_RESOLVING && timings.STATUS_CONNECTING_TO) {
      return timings.STATUS_RESOLVING.first - timings.REQUEST_HEADER.first;
    } else if (timings.STATUS_SENDING_TO) {
      return timings.STATUS_SENDING_TO.first - timings.REQUEST_HEADER.first;
    }

    return -1;
  }

  #getDnsTiming(timings) {
    if (timings.STATUS_RESOLVING && timings.STATUS_RESOLVED) {
      return timings.STATUS_RESOLVED.last - timings.STATUS_RESOLVING.first;
    }

    return -1;
  }

  #getConnectTiming(timings) {
    if (timings.STATUS_CONNECTING_TO && timings.STATUS_CONNECTED_TO) {
      return (
        timings.STATUS_CONNECTED_TO.last - timings.STATUS_CONNECTING_TO.first
      );
    }

    return -1;
  }

  // RESPONSE_START is reported once, so a restart past the head leaves it stale.
  #getReceiveTiming(timings, responseStartTimeTc, responseEndTimeTc) {
    if (responseStartTimeTc != 0 && responseEndTimeTc != 0) {
      return responseEndTimeTc - responseStartTimeTc;
    }

    // A response delimited by a close is stamped after it reports complete.
    if (responseStartTimeTc != 0 && timings.RESPONSE_COMPLETE) {
      return timings.RESPONSE_COMPLETE.last - responseStartTimeTc;
    }

    if (timings.RESPONSE_START && timings.RESPONSE_COMPLETE) {
      return timings.RESPONSE_COMPLETE.last - timings.RESPONSE_START.first;
    }

    return -1;
  }

  // From the end of sending; the channel's requestStart is where it began.
  #getWaitTiming(timings, responseStartTimeTc) {
    const sent = timings.REQUEST_BODY_SENT || timings.STATUS_SENDING_TO;
    if (!sent) {
      return -1;
    }

    // Floored: a server can answer before the upload finishes, and a negative
    // phase is dropped from the total rather than counted.
    if (responseStartTimeTc != 0) {
      return Math.max(responseStartTimeTc - sent.last, 0);
    }

    if (timings.RESPONSE_START) {
      return Math.max(timings.RESPONSE_START.first - sent.last, 0);
    }

    return -1;
  }

  // When both attempts ran a handshake, `first` is the failed one's.
  #getSslTiming(timings, secureConnectionStartTimeTc) {
    if (timings.STATUS_TLS_STARTING && timings.STATUS_TLS_ENDING) {
      return Math.max(
        timings.STATUS_TLS_ENDING.last -
          this.#clampToServingAttempt(
            timings.STATUS_TLS_STARTING.first,
            secureConnectionStartTimeTc
          ),
        0
      );
    }

    return -1;
  }

  // Reported once per transaction, so a restart leaves `first` at the failure.
  #clampToServingAttempt(first, attemptStart) {
    return attemptStart == 0 ? first : Math.max(first, attemptStart);
  }

  // Shared with the offset, so the bar and the duration cover one interval.
  #getSendStart(timings, requestStartTimeTc) {
    return this.#clampToServingAttempt(
      timings.STATUS_SENDING_TO.first,
      requestStartTimeTc
    );
  }

  // Both ends from one status, so a multi-write body reports a long send.
  #getSendTiming(timings, requestStartTimeTc) {
    if (timings.STATUS_SENDING_TO) {
      return Math.max(
        timings.STATUS_SENDING_TO.last -
          this.#getSendStart(timings, requestStartTimeTc),
        0
      );
    } else if (timings.REQUEST_HEADER && timings.REQUEST_BODY_SENT) {
      return Math.max(
        timings.REQUEST_BODY_SENT.last -
          this.#clampToServingAttempt(
            timings.REQUEST_HEADER.first,
            requestStartTimeTc
          ),
        0
      );
    }

    return -1;
  }

  #getDataFromTimedChannel(timedChannel) {
    const lookUpArr = [
      "requestStartTime",
      "responseStartTime",
      "responseEndTime",
      "tcpConnectEndTime",
      "connectStartTime",
      "connectEndTime",
      "secureConnectionStartTime",
      "domainLookupEndTime",
      "domainLookupStartTime",
    ];

    return Object.fromEntries(
      lookUpArr.map(prop => [
        `${prop}Tc`,
        this.#channelMark(timedChannel, prop),
      ])
    );
  }

  // Discards a mark predating the request, which is not this one's.
  #channelMark(timedChannel, prop) {
    if (!timedChannel) {
      return 0;
    }

    const value = timedChannel[prop];
    const { asyncOpenTime } = timedChannel;
    return value != 0 && asyncOpenTime && value < asyncOpenTime ? 0 : value;
  }

  #getSecureConnectionStartTimeInfo(timings) {
    let secureConnectionStartTime = 0;
    let secureConnectionStartTimeRelative = false;

    if (timings.STATUS_TLS_STARTING && timings.STATUS_TLS_ENDING) {
      if (timings.STATUS_CONNECTING_TO) {
        secureConnectionStartTime =
          timings.STATUS_TLS_STARTING.first -
          timings.STATUS_CONNECTING_TO.first;
      }

      if (secureConnectionStartTime < 0) {
        secureConnectionStartTime = 0;
      }
      secureConnectionStartTimeRelative = true;
    }

    return {
      secureConnectionStartTime,
      secureConnectionStartTimeRelative,
    };
  }

  #getStartSendingTimeInfo(timings, connectStartTimeTc, requestStartTimeTc) {
    let startSendingTime = 0;
    let startSendingTimeRelative = false;

    if (timings.STATUS_SENDING_TO) {
      if (connectStartTimeTc != 0) {
        startSendingTime = Math.max(
          this.#getSendStart(timings, requestStartTimeTc) - connectStartTimeTc,
          0
        );
        startSendingTimeRelative = true;
      } else if (requestStartTimeTc != 0) {
        // Established connection: no connect to offset from, any status stale.
      } else if (timings.STATUS_CONNECTING_TO) {
        startSendingTime =
          timings.STATUS_SENDING_TO.first - timings.STATUS_CONNECTING_TO.first;
        startSendingTimeRelative = true;
      }

      if (startSendingTime < 0) {
        startSendingTime = 0;
      }
    }
    return { startSendingTime, startSendingTimeRelative };
  }

  #convertTimeToMs(timing) {
    return Math.max(Math.round(timing / 1000), -1);
  }

  #calculateOffsetAndTotalTime(
    harTimings,
    secureConnectionStartTime,
    startSendingTimeRelative,
    secureConnectionStartTimeRelative,
    startSendingTime
  ) {
    let totalTime = 0;
    for (const timing in harTimings) {
      const time = this.#convertTimeToMs(harTimings[timing]);
      harTimings[timing] = time;
      if (time > -1 && timing != "connect" && timing != "ssl") {
        totalTime += time;
      }
    }

    // connect, ssl and send times can be overlapped.
    if (startSendingTimeRelative) {
      totalTime += startSendingTime;
    } else if (secureConnectionStartTimeRelative) {
      totalTime += secureConnectionStartTime;
      totalTime += harTimings.ssl;
    }

    // Already milliseconds here, and a phase can still be negative: the loop
    // above floors at -1. Adding that would move the following bars back.
    const span = timing => Math.max(harTimings[timing], 0);

    const offsets = {};
    offsets.blocked = 0;
    offsets.dns = span("blocked");
    offsets.connect = offsets.dns + span("dns");
    if (secureConnectionStartTimeRelative) {
      offsets.ssl = offsets.connect + secureConnectionStartTime;
    } else {
      offsets.ssl = offsets.connect + span("connect");
    }
    if (startSendingTimeRelative) {
      offsets.send = offsets.connect + startSendingTime;
      if (!secureConnectionStartTimeRelative) {
        offsets.ssl = offsets.send - span("ssl");
      }
    } else {
      offsets.send = offsets.ssl + span("ssl");
    }
    offsets.wait = offsets.send + span("send");
    offsets.receive = offsets.wait + span("wait");

    return {
      total: totalTime,
      offsets,
    };
  }
})();
