/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Perf test for on-device speech recognition (parakeet). Per session it
// reports:
//
//   engine-ready-latency    start() -> the engine can consume audio
//   first-result-latency    start() -> the first word reaches the page
//   finalization-latency    stop() -> "end", the end-of-stream flush
//   real-time-factor        seconds of audio recognized per second of inference
//   memory-after-init       HWInference process RSS once the engine is up
//   memory-mid-recognition  the same, with recognition under way
//
// Every metric is reported per model, and the first session of each under the
// cold-start- prefix: it pays for the HWInference process starting up, the
// later ones find it already running.

const perfMetadata = {
  owner: "Media Playback Team",
  name: "browser_speech_recognition_perf.js",
  description:
    "Latency, real-time factor and memory of on-device speech recognition",
  options: {
    default: {
      perfherder: true,
      perfherder_metrics: [
        { name: "engine-ready-latency", unit: "ms", shouldAlert: false },
        { name: "first-result-latency", unit: "ms", shouldAlert: false },
        { name: "finalization-latency", unit: "ms", shouldAlert: false },
        {
          name: "real-time-factor",
          unit: "X",
          shouldAlert: false,
          lowerIsBetter: false,
        },
        { name: "memory-after-init", unit: "MB", shouldAlert: false },
        { name: "memory-mid-recognition", unit: "MB", shouldAlert: false },
      ],
      verbose: true,
      manifest: "perftest.toml",
      manifest_flavor: "browser-chrome",
      try_platform: ["linux", "mac", "win"],
    },
  },
};

const ORIGIN = "https://example.com";
const AUDIO_FILE = "kennedy-appolo.opus";
const SERVER_PORT = 8766;
const LANG = "en-US";
const ONE_MIB = 1024 * 1024;
const COLD_START_PREFIX = "cold-start-";

// Both models transcribe the same English clip over the same language;
// media.webspeech.recognition.model.en decides which one runs. 141MB against
// 785MB moves the model load, the footprint and the real-time factor enough
// that they need their own series.
const MODELS = [{ id: "english" }, { id: "multilingual" }];

// One cold session plus three warm ones, reported as a median: the real-time
// factor is sensitive to whatever else the machine is doing, and two samples
// with a mean let one busy session decide the number. Each costs the clip's
// length, since audio is fed in real time.
const ITERATIONS = 4;

requestLongerTimeout(20);

// A utility process hosting the hwInference actor. Not the "inference" process
// type, which is the ML component's.
async function hwInferenceProcess() {
  const info = await ChromeUtils.requestProcInfo();
  return info.children.find(
    child =>
      child.type == "utility" &&
      child.utilityActors.some(actor => actor.actorName == "hwInference")
  );
}

// resident-unique rather than requestProcInfo()'s resident: the engine reads
// the weights rather than mapping them, so the file's own pages stay resident
// on top of the copy it holds and resident counts the model twice.
async function hwInferenceMemoryMiB() {
  const proc = await hwInferenceProcess();
  ok(proc, "Found the HWInference process");

  let bytes = 0;
  await new Promise(resolve =>
    Cc["@mozilla.org/memory-reporter-manager;1"]
      .getService(Ci.nsIMemoryReporterManager)
      .getReports(
        (process, path, kind, units, amount) => {
          if (
            path == "resident-unique" &&
            process.includes(`(pid ${proc.pid},`)
          ) {
            bytes = amount;
          }
        },
        null,
        resolve,
        null,
        /* anonymize */ false
      )
  );
  Assert.greater(bytes, 0, "Got the HWInference process' resident-unique");
  return Math.round(bytes / ONE_MIB);
}

// Runs a whole session in the content process and resolves with its stats.
//
// One task, because getPerfStats() is ChromeOnly: it needs the privileged Xray
// view of the object, which this sandbox has and which a later task would not
// get back out of window.wrappedJSObject. Progress is published there instead,
// for the parent to sample process memory against.
function runSessionInContent(browser) {
  return SpecialPowers.spawn(
    browser,
    [LANG, AUDIO_FILE],
    async (lang, audioFile) => {
      const ctx = new content.AudioContext();
      await ctx.resume();
      if (ctx.state !== "running") {
        throw new Error(`AudioContext failed to resume: ${ctx.state}`);
      }

      const audio = content.document.createElement("audio");
      audio.src = audioFile;
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
      await audio.play();

      const recognition = new content.SpeechRecognition();
      recognition.processLocally = true;
      recognition.continuous = true;
      // The first word arrives as an interim result, well before the utterance
      // it belongs to is finalized.
      recognition.interimResults = true;
      recognition.lang = lang;

      await new Promise((resolve, reject) => {
        recognition.onstart = resolve;
        recognition.onerror = e => reject(new Error(e.error));
        recognition.start(dst.stream.getAudioTracks()[0]);
      });
      content.wrappedJSObject._phase = "listening";

      await new Promise(resolve => {
        audio.addEventListener("timeupdate", function onTimeUpdate() {
          if (audio.currentTime < audio.duration / 2) {
            return;
          }
          audio.removeEventListener("timeupdate", onTimeUpdate);
          content.wrappedJSObject._phase = "midway";
          resolve();
        });
      });

      await new Promise(resolve =>
        audio.addEventListener("ended", resolve, { once: true })
      );
      await new Promise(resolve => {
        recognition.onend = resolve;
        recognition.stop();
      });

      const stats = await recognition.getPerfStats();
      await ctx.close();
      return {
        engineReadyDuration: stats.engineReadyDuration,
        firstResultDuration: stats.firstResultDuration,
        finalizationDuration: stats.finalizationDuration,
        fedAudioDuration: stats.fedAudioDuration,
        inferenceDuration: stats.inferenceDuration,
      };
    }
  );
}

function waitForPhase(browser, phase) {
  return TestUtils.waitForCondition(
    async () =>
      (await SpecialPowers.spawn(
        browser,
        [],
        () => content.wrappedJSObject._phase
      )) == phase,
    `The session reached the ${phase} phase`,
    250,
    // The clip is fed in real time, so halfway through it is a while away.
    1000
  );
}

async function runSession(browser) {
  const session = runSessionInContent(browser);

  await waitForPhase(browser, "listening");
  const memoryAfterInit = await hwInferenceMemoryMiB();
  await waitForPhase(browser, "midway");
  const memoryMidRecognition = await hwInferenceMemoryMiB();

  const stats = await session;
  Assert.greater(stats.engineReadyDuration, 0, "The engine reported ready");
  Assert.greater(stats.firstResultDuration, 0, "A result reached the page");
  Assert.greater(stats.inferenceDuration, 0, "The engine recognized audio");

  return {
    "engine-ready-latency": stats.engineReadyDuration,
    "first-result-latency": stats.firstResultDuration,
    "finalization-latency": stats.finalizationDuration,
    "real-time-factor": stats.fedAudioDuration / stats.inferenceDuration,
    "memory-after-init": memoryAfterInit,
    "memory-mid-recognition": memoryMidRecognition,
  };
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["media.webspeech.recognition.enable", true],
      // Serves the models fetched into MOZ_FETCHES_DIR; started by runtests.py
      // for anything tagged parakeet-asr.
      ["browser.ml.modelHubRootUrl", `http://localhost:${SERVER_PORT}/`],
      ["media.webspeech.recognition.model-download.prompt.testing", true],
      ["media.navigator.permission.disabled", true],
    ],
  });
});

add_task(async function speech_recognition_perf() {
  const page =
    getRootDirectory(gTestPath).replace("chrome://mochitests/content", ORIGIN) +
    "empty.html";
  await BrowserTestUtils.withNewTab(page, async browser => {
    const journal = {};
    for (const model of MODELS) {
      await SpecialPowers.pushPrefEnv({
        set: [["media.webspeech.recognition.model.en", model.id]],
      });

      const installed = await SpecialPowers.spawn(
        browser,
        [LANG],
        async lang => {
          const options = { langs: [lang], processLocally: true };
          if (
            (await content.SpeechRecognition.available(options)) === "available"
          ) {
            return true;
          }
          SpecialPowers.wrap(content.document).notifyUserGestureActivation();
          return content.SpeechRecognition.install(options);
        }
      );
      ok(installed, `The ${model.id} model is installed`);

      // install() opens a transient session of its own, so the process is up
      // by now. Let it go idle again, otherwise the first session below is not
      // the cold one it is reported as.
      await TestUtils.waitForCondition(
        async () => !(await hwInferenceProcess()),
        "The HWInference process shut down after the availability check",
        250,
        100
      );

      for (let i = 0; i < ITERATIONS; i++) {
        const prefix = i === 0 ? COLD_START_PREFIX : "";
        info(`${model.id} session ${i + 1}/${ITERATIONS}`);
        for (const [name, value] of Object.entries(await runSession(browser))) {
          const metric = `${model.id}-${prefix}${name}`;
          if (!journal[metric]) {
            journal[metric] = [];
          }
          journal[metric].push(value);
        }
      }

      await SpecialPowers.popPrefEnv();
    }

    const metrics = Object.entries(journal).map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return {
        name,
        values,
        value:
          sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      };
    });
    for (const metric of metrics) {
      info(`${metric.name}: ${metric.value} ${JSON.stringify(metric.values)}`);
    }
    info(`perfMetrics | ${JSON.stringify(metrics)}`);
  });
});
