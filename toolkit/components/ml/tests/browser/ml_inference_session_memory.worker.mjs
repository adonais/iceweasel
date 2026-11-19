/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

import { _lazyForTestMocking } from "chrome://global/content/ml/MLEngine.worker.mjs";

_lazyForTestMocking.getBackend = async function () {
  const { InferenceSession, Tensor } = globalThis;
  const response = await fetch(
    "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/data/acme/bert/resolve/main/onnx/model_quantized.onnx"
  );
  const model = new Uint8Array(await response.arrayBuffer());

  return {
    async run({ cycles }) {
      const input = new Tensor(
        "int64",
        new BigInt64Array(256).fill(1n),
        [1, 256]
      );
      let logits;
      try {
        for (let cycle = 0; cycle < cycles; cycle++) {
          const session = await InferenceSession.create(model, {
            intraOpNumThreads: 1,
            interOpNumThreads: 1,
          });
          let outputs;
          try {
            outputs = await session.run({
              input_ids: input,
              attention_mask: input,
              token_type_ids: input,
            });
            logits = Array.from(outputs.logits.data);
          } finally {
            for (const output of Object.values(outputs ?? {})) {
              output.dispose();
            }
            await session.release();
          }
        }
      } finally {
        input.dispose();
      }
      return { logits, metrics: {} };
    },
  };
};
