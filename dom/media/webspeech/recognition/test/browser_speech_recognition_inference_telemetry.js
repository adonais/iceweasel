/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Instrumentation test for the inference-process metrics, which need a real
// model and real audio. Runs one recognition session over a speech recording
// and checks the engine reported its load time and real-time factor.

const SERVER_PORT = 8766;
const LANG = "en-US";
const ORIGIN = "https://example.com";
const DIR = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  ORIGIN
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["media.webspeech.recognition.enable", true],
      ["browser.ml.modelHubRootUrl", `http://localhost:${SERVER_PORT}/`],
      ["media.webspeech.recognition.model-download.prompt.testing", true],
      ["media.navigator.permission.disabled", true],
    ],
  });
});

add_task(async function test_inference_metrics() {
  await BrowserTestUtils.withNewTab(DIR + "empty.html", async browser => {
    const installed = await SpecialPowers.spawn(browser, [LANG], async lang => {
      const status = await content.SpeechRecognition.available({
        langs: [lang],
        processLocally: true,
      });
      if (status === "available") {
        return true;
      }
      SpecialPowers.wrap(content.document).notifyUserGestureActivation();
      return content.SpeechRecognition.install({
        langs: [lang],
        processLocally: true,
      });
    });
    ok(installed, "Model is installed");

    // Reset only once the model is in place: install() runs a session-less
    // download, and the metrics asserted below must come from the session.
    await Services.fog.testFlushAllChildren();
    Services.fog.testResetFOG();

    const transcript = await SpecialPowers.spawn(
      browser,
      [DIR + "kennedy-appolo.opus", LANG],
      async (audioUrl, lang) => {
        const ctx = new content.AudioContext();
        await ctx.resume();
        if (ctx.state !== "running") {
          throw new Error(`AudioContext did not resume: ${ctx.state}`);
        }

        const audio = content.document.createElement("audio");
        audio.src = audioUrl;
        content.document.body.appendChild(audio);
        await new Promise((resolve, reject) => {
          audio.addEventListener("canplaythrough", resolve, { once: true });
          audio.addEventListener(
            "error",
            () => reject(new Error("Audio load failed")),
            { once: true }
          );
          audio.load();
        });

        const dst = ctx.createMediaStreamDestination();
        ctx.createMediaElementSource(audio).connect(dst);
        const track = dst.stream.getAudioTracks()[0];

        const recognition = new content.SpeechRecognition();
        recognition.processLocally = true;
        recognition.lang = lang;
        content.wrappedJSObject._recognition = recognition;

        // Listen over a real stretch of speech rather than stopping at the
        // first result, so the real-time factor is measured over enough
        // inference calls to be meaningful.
        const LISTEN_MS = 20000;
        const finals = [];
        let timer = null;
        const done = new Promise(resolve => {
          recognition.onresult = e => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) {
                finals.push(e.results[i][0].transcript);
              }
            }
          };
          recognition.onerror = e => resolve(`error: ${e.error}`);
          recognition.onend = () => resolve(finals.join(" ").trim());
          timer = content.setTimeout(() => recognition.stop(), LISTEN_MS);
        }).finally(() => content.clearTimeout(timer));

        recognition.start(track);
        audio.currentTime = 0;
        await audio.play();
        const result = await done;
        audio.pause();
        return result;
      }
    );

    info(`Transcript: ${transcript}`);
    Assert.greater(
      transcript.split(/\s+/).filter(Boolean).length,
      10,
      "Recognized a real stretch of speech"
    );

    await Services.fog.testFlushAllChildren();

    const load = Glean.mediaSpeechRecognition.modelLoadTime.testGetValue();
    Assert.ok(load, "model_load_time has samples");
    is(load.count, 1, "The model was loaded once");

    const rtf =
      Glean.mediaSpeechRecognition.inferenceRealtimeFactor.testGetValue();
    Assert.ok(rtf, "inference_realtime_factor has samples");
    is(rtf.count, 1, "One mean real-time factor per session");
    Assert.greater(rtf.sum, 0, "A real-time factor was reported");

    const latency = Glean.mediaSpeechRecognition.resultLatency.testGetValue();
    Assert.ok(latency, "result_latency has samples");
    is(latency.count, 1, "One mean result latency per session");

    info(
      `model load ${(load.sum / 1e6).toFixed(0)}ms; ` +
        `mean result latency ${(latency.sum / 1e6).toFixed(0)}ms; ` +
        `mean real-time factor ${(rtf.sum / rtf.count / 100).toFixed(1)}x`
    );
  });
});
