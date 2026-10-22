// Plays encrypted audio-only content using a temporary session.
//
// config = {
//   audio: HTMLMediaElement to play the content with,
//   keysystem: key system to use,
//   messagehandler: message handler for the key system's license server,
//   contentitem: item from resources/content-metadata.js to play,
//   duration: playback position in seconds to reach before passing,
// }
function runTest(config) {
  const { initDataType, audio: audioContent } = config.contentitem;
  const initData = stringToUint8Array(
    atob(config.contentitem.keys[0].initData)
  );
  const testname =
    testnamePrefix(null, config.keysystem) +
    `, temporary, ${audioContent.type}, playback`;

  promise_test(async test => {
    const audio = config.audio;

    const access = await navigator.requestMediaKeySystemAccess(
      config.keysystem,
      [
        {
          initDataTypes: [initDataType],
          audioCapabilities: [{ contentType: audioContent.type }],
          sessionTypes: ["temporary"],
        },
      ]
    );
    const mediaKeys = await access.createMediaKeys();
    await audio.setMediaKeys(mediaKeys);

    // The content may also carry its own init data, but we always use the
    // mp4-basic init data so the license request matches the known asset.
    // The CDM may send more than one message, e.g. a service certificate
    // request before the license request, so answer every one of them.
    const session = mediaKeys.createSession("temporary");
    const keysUsable = new Promise((resolve, reject) => {
      session.addEventListener("message", event => {
        config
          .messagehandler(event.messageType, event.message)
          .then(response => session.update(response))
          .catch(reject);
      });
      session.addEventListener("keystatuseschange", () => {
        for (const [, status] of session.keyStatuses) {
          if (status === "usable") {
            resolve();
            return;
          }
        }
      });
    });
    await session.generateRequest(initDataType, initData);
    await keysUsable;

    const mediaSource = new MediaSource();
    audio.src = URL.createObjectURL(mediaSource);
    await new Promise(resolve =>
      mediaSource.addEventListener("sourceopen", resolve, { once: true })
    );
    const sourceBuffer = mediaSource.addSourceBuffer(audioContent.type);
    const data = await (await fetch(audioContent.path)).arrayBuffer();
    sourceBuffer.appendBuffer(data);
    await new Promise(resolve =>
      sourceBuffer.addEventListener("updateend", resolve, { once: true })
    );
    mediaSource.endOfStream();

    await new Promise((resolve, reject) => {
      audio.addEventListener("error", () =>
        reject(new Error(`Media error: ${audio.error.message}`))
      );
      audio.addEventListener("timeupdate", () => {
        if (audio.currentTime >= config.duration) {
          resolve();
        }
      });
      audio.play().catch(reject);
    });

    audio.pause();
    await session.close();
  }, testname);
}
