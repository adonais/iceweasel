/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { LlamaCppPipeline } = ChromeUtils.importESModule(
  "chrome://global/content/ml/backends/LlamaCppPipeline.mjs"
);

/**
 * A generator standing in for LlamaRunner. Its stream delivers one chunk and
 * then leaves a read outstanding, and its cancel algorithm only settles once
 * the test releases it, the way the generation thread holds the backend after
 * a cancellation.
 *
 * @returns {{generator: object, control: object}} The stub and the handles the
 *          test drives it with: `streams` counts generations started,
 *          `releases` holds a resolver per cancelled stream, and `firstChunk`
 *          settles once a generation has produced output.
 */
function createGeneratorStub() {
  let deliverFirstChunk;

  const control = {
    streams: 0,
    releases: [],
    firstChunk: new Promise(resolve => {
      deliverFirstChunk = resolve;
    }),
  };

  const generator = {
    createGenerationStream() {
      control.streams++;
      let pulls = 0;

      return new ReadableStream({
        pull(controller) {
          pulls++;
          if (pulls === 1) {
            controller.enqueue({
              phase: "generation",
              tokens: [1],
              piece: "x",
            });
            deliverFirstChunk();
            return undefined;
          }

          return new Promise(() => {});
        },

        cancel() {
          return new Promise(resolve => control.releases.push(resolve));
        },
      });
    },
  };

  return { generator, control };
}

async function settle() {
  await TestUtils.waitForTick();
  await TestUtils.waitForTick();
}

// Cancelling a stream closes it, so the run ends and cancels the same stream
// again on its way out. That second cancel resolves immediately, and taking it
// as the drain would let the next generation start while the backend, which is
// not thread-safe, is still held by the cancelled one.
add_task(async function test_next_run_waits_for_a_cancelled_generation() {
  const { generator, control } = createGeneratorStub();
  const pipeline = new LlamaCppPipeline(generator, {}, error => error);
  const request = { prompt: "Once upon a time there was", nPredict: 200 };

  const cancelledRun = pipeline.run(request, "run-1");
  await control.firstChunk;
  await settle();

  // Not awaited: it settles only once the backend is released below.
  const cancelled = pipeline.cancel("run-1");

  // Closing the stream ends the read loop, so the run itself returns here.
  await cancelledRun;
  Assert.equal(control.streams, 1, "The cancelled run started one generation");
  Assert.equal(control.releases.length, 1, "The stream's cancel algorithm ran");

  const nextRun = pipeline.run(request, "run-2");
  await settle();

  Assert.equal(
    control.streams,
    1,
    "The next run waits for the cancelled generation to release the backend"
  );

  control.releases.shift()();
  await cancelled;
  await settle();

  Assert.equal(
    control.streams,
    2,
    "The next run starts once the backend is free"
  );

  const nextCancelled = pipeline.cancel("run-2");
  await settle();
  control.releases.forEach(release => release());
  await nextCancelled;
  await nextRun;
});

// A cancellation can also land before the run has opened its stream, in which
// case the run cancels on its own behalf once it has a reader. That drain has
// to be waited on too, otherwise the same overlap happens through a narrower
// window.
add_task(async function test_next_run_waits_for_a_cancel_before_the_reader() {
  const { generator, control } = createGeneratorStub();

  let enterFormatChat;
  let releaseFormatChat;
  const formatChatEntered = new Promise(resolve => {
    enterFormatChat = resolve;
  });
  const formatChatReleased = new Promise(resolve => {
    releaseFormatChat = resolve;
  });

  // formatChat is only awaited for a chat prompt, which parks the run after it
  // has registered but before it opens a stream.
  generator.formatChat = async () => {
    enterFormatChat();
    await formatChatReleased;
    return "Once upon a time there was";
  };

  const pipeline = new LlamaCppPipeline(generator, {}, error => error);
  const request = {
    prompt: [{ role: "user", content: "Once upon a time there was" }],
    nPredict: 200,
  };

  const cancelledRun = pipeline.run(request, "run-1");
  await formatChatEntered;

  await pipeline.cancel("run-1");
  releaseFormatChat();
  await settle();

  Assert.equal(control.streams, 1, "The cancelled run started one generation");
  Assert.equal(control.releases.length, 1, "The stream's cancel algorithm ran");

  const nextRun = pipeline.run(request, "run-2");
  await settle();

  Assert.equal(
    control.streams,
    1,
    "The next run waits even though the cancel preceded the reader"
  );

  control.releases.shift()();
  await cancelledRun;
  await settle();

  Assert.equal(
    control.streams,
    2,
    "The next run starts once the backend is free"
  );

  const nextCancelled = pipeline.cancel("run-2");
  await settle();
  control.releases.forEach(release => release());
  await nextCancelled;
  await nextRun;
});
