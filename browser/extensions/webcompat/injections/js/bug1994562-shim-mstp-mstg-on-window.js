/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1994562 - Sites that depend on legacy (main-thread)
 *               MediaStreamTrackProcessor or MediaStreamTrackGenerator
 *
 * Several websites that offer real-time media processing in Chrome fail
 * to work in Firefox, either ghosting the button that offers this
 * feature or erroring with a message like "Voice/Video processing is
 * not supported in this browser".
 *
 * These webpages rely on the older Chrome-only MSTP or MSTG APIs on
 * window instead of the standard MSTP and VTG (VideoTrackGenerator)
 * implemented in Safari (and soon Firefox). The following shims the
 * former APIs using existing technology on window (canvas for video
 * and AudioWorklets for audio).
 *
 * Note: this shim has inherent performance limitations being on
 * main thread. Websites are encouraged to upgrade to the standard
 * worker-based APIs directly for optimal performance in Firefox.
 */

/* globals exportFunction, cloneInto */

console.info(
  "Nonstandard MediaStreamTrackProcessor and MediaStreamTrackGenerator are being shimmed for compatibility reasons. Please consider updating to the standard equivalents available in workers for optimal performance! See https://bugzil.la/1994562 for details."
);

if (!window.MediaStreamTrackProcessor) {
  const win = window.wrappedJSObject;
  const f = func => exportFunction(func, window);
  const o = obj => Object.assign(new win.Object(), obj);

  function MediaStreamTrackProcessor(options) {
    if (!(options?.track instanceof win.MediaStreamTrack)) {
      throw new TypeError("Missing track");
    }
    const { track } = options;
    if (track.kind == "video") {
      const src = o({
        start: f(function start(controller) {
          return win.Promise.resolve()
            .then(
              f(() => {
                track.addEventListener(
                  "ended",
                  f(() => controller.close()),
                  o({ once: true })
                );
                src.video = win.document.createElement("video");
                const tracks = new win.Array();
                tracks.push(track);
                src.video.srcObject = new win.MediaStream(tracks);
                src.video.play();
                return new win.Promise(
                  f(r => (src.video.onloadedmetadata = r))
                );
              })
            )
            .then(
              f(() => {
                src.track = track;
                src.canvas = new win.OffscreenCanvas(
                  src.video.videoWidth,
                  src.video.videoHeight
                );
                src.ctx = src.canvas.getContext(
                  "2d",
                  o({ desynchronized: true })
                );
                src.t1 = performance.now();
              })
            );
        }),
        pull: f(function pull(controller) {
          if (track.readyState == "ended") {
            controller.close();
            return Promise.resolve();
          }
          const fps = track.getSettings().frameRate || 30;
          return new win.Promise(
            f(r => {
              const waitUntil = () => {
                if (
                  track.readyState == "ended" ||
                  performance.now() - src.t1 >= 1000 / fps
                ) {
                  r();
                  return;
                }
                requestAnimationFrame(waitUntil);
              };
              requestAnimationFrame(waitUntil);
            })
          ).then(
            f(() => {
              if (track.readyState == "ended") {
                controller.close();
                return;
              }
              src.t1 = performance.now();
              src.ctx.drawImage(src.video, 0, 0);
              const frame = new win.VideoFrame(
                src.canvas,
                o({ timestamp: src.t1 })
              );
              controller.enqueue(frame);
            })
          );
        }),
      });
      return o({ readable: new win.ReadableStream(src) });
    } else if (track.kind == "audio") {
      const src = o({
        start: f(function start(controller) {
          return win.Promise.resolve()
            .then(
              f(() => {
                track.addEventListener(
                  "ended",
                  f(() => controller.close()),
                  o({ once: true })
                );
                src.ac = new win.AudioContext();
                src.arrays = new win.Array();
                function worklet() {
                  registerProcessor(
                    "mstp-shim",
                    class Processor extends AudioWorkletProcessor {
                      process(input) {
                        this.port.postMessage(input);
                        return true;
                      }
                    }
                  );
                }
                return src.ac.audioWorklet.addModule(
                  `data:text/javascript,(${worklet.toString()})()`
                );
              })
            )
            .then(
              f(() => {
                src.node = new win.AudioWorkletNode(src.ac, "mstp-shim");
                const tracks = new win.Array();
                tracks.push(track);
                src.ac
                  .createMediaStreamSource(new win.MediaStream(tracks))
                  .connect(src.node);
                src.node.port.addEventListener(
                  "message",
                  f(({ data }) => data[0][0] && src.arrays.push(data))
                );
              })
            );
        }),
        pull: f(function pull(controller) {
          return win.Promise.resolve()
            .then(
              f(() => {
                if (track.readyState == "ended") {
                  controller.close();
                  return Promise.resolve();
                }
                return src.arrays.length
                  ? win.Promise.resolve()
                  : new win.Promise(f(r => (src.node.port.onmessage = r))).then(
                      f(function loop() {
                        if (track.readyState == "ended") {
                          return Promise.resolve();
                        }
                        if (!src.arrays.length) {
                          return new win.Promise(
                            f(r => (src.node.port.onmessage = r))
                          ).then(f(loop));
                        }
                        return win.Promise.resolve();
                      })
                    );
              })
            )
            .then(
              f(() => {
                if (track.readyState == "ended") {
                  return;
                }
                const [channels] = src.arrays.shift();
                const joined = new win.Float32Array(
                  channels.reduce(f((a, b) => a + b.length, 0))
                );
                channels.reduce(
                  f((offset, a) => {
                    joined.set(a, offset);
                    return offset + a.length;
                  }, 0)
                );
                const transfer = new win.Array();
                transfer.push(joined.buffer);
                const data = new win.AudioData(
                  o({
                    format: "f32-planar",
                    sampleRate: src.ac.sampleRate,
                    numberOfFrames: channels[0].length,
                    numberOfChannels: channels.length,
                    timestamp: (src.ac.currentTime * 1e6) | 0,
                    data: joined,
                    transfer,
                  })
                );
                controller.enqueue(data);
              })
            );
        }),
      });
      return o({ readable: new win.ReadableStream(src) });
    }
  }
  win.MediaStreamTrackProcessor = exportFunction(
    MediaStreamTrackProcessor,
    window,
    { allowCrossOriginArguments: true }
  );
}

if (!window.MediaStreamTrackGenerator) {
  const win = window.wrappedJSObject;
  const f = func => exportFunction(func, window);
  const o = obj => Object.assign(new win.Object(), obj);

  function MediaStreamTrackGenerator(options) {
    if (options?.kind != "video" && options?.kind != "audio") {
      throw new TypeError("Invalid kind");
    }
    if (options.kind == "video") {
      const canvas = win.document.createElement("canvas");
      const ctx = canvas.getContext("2d", o({ desynchronized: true }));
      const [track] = canvas.captureStream().getVideoTracks();
      const sink = o({
        write: f(function write(frame) {
          canvas.width = frame.displayWidth;
          canvas.height = frame.displayHeight;
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
          frame.close();
        }),
      });
      track.writable = new win.WritableStream(sink);
      return track;
    } else if (options.kind == "audio") {
      const ac = new win.AudioContext();
      const dest = ac.createMediaStreamDestination();
      const [track] = dest.stream.getAudioTracks();
      const sink = o({
        start: f(function start() {
          return win.Promise.resolve()
            .then(
              f(() => {
                sink.arrays = new win.Array();
                function worklet() {
                  registerProcessor(
                    "mstg-shim",
                    class Processor extends AudioWorkletProcessor {
                      constructor() {
                        super();
                        this.arrays = [];
                        this.arrayOffset = 0;
                        this.port.onmessage = ({ data }) =>
                          this.arrays.push(data);
                        this.emptyArray = new Float32Array(0);
                      }
                      process(inputs, [[output]]) {
                        for (let i = 0; i < output.length; i++) {
                          if (
                            !this.array ||
                            this.arrayOffset >= this.array.length
                          ) {
                            this.array = this.arrays.shift() || this.emptyArray;
                            this.arrayOffset = 0;
                          }
                          output[i] = this.array[this.arrayOffset++] || 0;
                        }
                        return true;
                      }
                    }
                  );
                }
                return ac.audioWorklet.addModule(
                  `data:text/javascript,(${worklet.toString()})()`
                );
              })
            )
            .then(
              f(() => {
                sink.node = new win.AudioWorkletNode(ac, "mstg-shim");
                sink.node.connect(dest);
                return track;
              })
            );
        }),
        write: f(function write(audioData) {
          const array = new win.Float32Array(
            audioData.numberOfFrames * audioData.numberOfChannels
          );
          audioData.copyTo(array, o({ planeIndex: 0 }));
          const transfer = new win.Array();
          transfer.push(array.buffer);
          sink.node.port.postMessage(array, o({ transfer }));
          audioData.close();
        }),
      });
      track.writable = new win.WritableStream(sink);
      return track;
    }
  }
  win.MediaStreamTrackGenerator = exportFunction(
    MediaStreamTrackGenerator,
    window,
    { allowCrossOriginArguments: true }
  );
}
