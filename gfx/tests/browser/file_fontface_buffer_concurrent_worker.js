/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

self.onmessage = async ({ data: { bytes, at } }) => {
  while (Date.now() < at) {
    // Busy-wait until the shared start time.
  }
  const face = new FontFace("test", bytes);
  const statusAfterConstructor = face.status;
  self.fonts.add(face);
  let error = null;
  try {
    await face.loaded;
  } catch (e) {
    error = `${e.name}: ${e.message}`;
  }
  self.postMessage({ statusAfterConstructor, error });
};

self.postMessage("ready");
