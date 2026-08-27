const PAGE_LIVE_STREAM =
  "https://example.com/browser/dom/media/mediacontrol/tests/browser/file_live_stream.html";

/**
 * A live stream (e.g. internet radio) is typically served without a
 * `Content-Length` header, so Gecko treats its underlying resource as a live
 * stream (`MediaDecoder::IsLiveStream()`). Such streams often report a very
 * short, or slowly growing, `duration` before enough data has arrived to
 * estimate it accurately. The fixture used here starts with a ~1 second
 * pre-recorded prelude, then streams in more content that grows the
 * reported duration well past the
 * `media.mediacontrol.eligible.media.duration.s` threshold, mimicking a
 * short jingle in front of a live broadcast. That threshold exists to
 * filter out short local sound effects, not live streams, so a live stream
 * must become - and remain - controllable regardless of how its reported
 * duration changes over time.
 */
add_task(async function testLiveStreamControllableRegardlessOfDuration() {
  const threshold = Services.prefs.getFloatPref(
    "media.mediacontrol.eligible.media.duration.s"
  );
  // This test plays for several real seconds so the reported duration can
  // grow past the threshold. With real hardware media keys enabled, the
  // platform's media-remote integration (e.g. macOS's Now Playing) can send
  // an actual Pause command once this stream registers as playing, which
  // stalls playback for the rest of the test. Other tests avoid this by
  // simulating key events instead of relying on the real backend; this one
  // doesn't send any key events at all, so it's simplest to just disable
  // the real backend here.
  await SpecialPowers.pushPrefEnv({
    set: [["media.hardwaremediakeys.enabled", false]],
  });

  info(`open new tab with live stream`);
  const tab = await createLoadedTabWrapper(PAGE_LIVE_STREAM, {
    needCheck: false,
  });

  info(`start playing the live stream`);
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    const audio = content.document.getElementById("live-stream");
    return audio.play();
  });

  info(`controller should become active despite the stream's short duration`);
  await checkOrWaitUntilControllerBecomeActive(tab);
  ok(tab.controller.isActive, "live stream activated the media controller");

  info(`wait for the prelude's duration to be known`);
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    const audio = content.document.getElementById("live-stream");
    if (audio.readyState >= audio.HAVE_METADATA) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      audio.addEventListener("loadedmetadata", () => resolve(), {
        once: true,
      });
    });
  });
  const initialDuration = await SpecialPowers.spawn(
    tab.linkedBrowser,
    [],
    () => content.document.getElementById("live-stream").duration
  );
  Assert.less(
    initialDuration,
    threshold,
    `initial duration ${initialDuration} is below the ${threshold}s threshold`
  );

  info(`wait for the reported duration to grow past the threshold`);
  await SpecialPowers.spawn(tab.linkedBrowser, [threshold], threshold => {
    const audio = content.document.getElementById("live-stream");
    if (audio.duration > threshold) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      audio.addEventListener("durationchange", function listener() {
        if (audio.duration > threshold) {
          audio.removeEventListener("durationchange", listener);
          resolve();
        }
      });
    });
  });
  ok(
    tab.controller.isActive,
    "live stream is still controllable once duration exceeds the threshold"
  );

  // live_stream.sjs keeps its HTTP response open for a while after
  // writing all of its bytes, to mimic a real live stream's connection.
  // Wait for the element to report the download as finished (a "suspend"
  // event, fired once its network state becomes idle) before tearing
  // down the tab, so the server-side response isn't torn down mid-flight.
  info(`wait for the live_stream.sjs response to finish on its own`);
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    const audio = content.document.getElementById("live-stream");
    if (audio.networkState == audio.NETWORK_IDLE) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      audio.addEventListener("suspend", () => resolve(), { once: true });
    });
  });

  info(`remove tab`);
  await tab.close();
});
