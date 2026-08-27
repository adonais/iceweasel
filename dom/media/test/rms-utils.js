/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../webaudio/test/webaudio.js */

"use strict";

async function measureRMSOnceWithFreshScriptProcessor(ac, src) {
  const sp = ac.createScriptProcessor(2048, 1, 1);
  src.connect(sp);
  sp.connect(ac.destination);

  const { inputBuffer } = await new Promise(
    resolve => (sp.onaudioprocess = resolve)
  );

  src.disconnect(sp);
  sp.disconnect();
  sp.onaudioprocess = null;
  return rms(inputBuffer);
}

async function waitForRmsPredicate(
  ac,
  src,
  threshold,
  predicate,
  timeoutMs = 10000
) {
  const start = performance.now();
  while (true) {
    const measuredRms = await measureRMSOnceWithFreshScriptProcessor(ac, src);
    if (predicate(measuredRms)) {
      return measuredRms;
    }
    if (performance.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for RMS threshold ${threshold}; ` +
          `last RMS=${measuredRms}`
      );
    }
  }
}

function waitForRmsEqualToThreshold(ac, src, threshold) {
  return waitForRmsPredicate(
    ac,
    src,
    threshold,
    measuredRms => measuredRms === threshold
  );
}

function waitForRmsOverThreshold(ac, src, threshold) {
  return waitForRmsPredicate(
    ac,
    src,
    threshold,
    measuredRms => measuredRms > threshold
  );
}

const RMSUtils = {
  measureRMSOnceWithFreshScriptProcessor,
  waitForRmsEqualToThreshold,
  waitForRmsOverThreshold,
};
