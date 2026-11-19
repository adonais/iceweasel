/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals AudioWorkletProcessor, currentFrame, registerProcessor */

/* Scan input 0 channel 1; input 1 starts the graph-time observation budget. */

function isNonZero(sample) {
  return sample !== 0;
}

class ChannelFillProbe extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { fillWord, budgetFrames } = options.processorOptions;
    this.fillWord = fillWord;
    this.budgetFrames = budgetFrames;
    this.markerFrame = -1;
    this.reported = false;
  }

  report(result) {
    this.reported = true;
    this.port.postMessage(result);
  }

  // Count the samples that are not silent, and how many of those carry the
  // allocator's fill word.
  tally(channel) {
    const bits = new Uint32Array(
      channel.buffer,
      channel.byteOffset,
      channel.length
    );
    let nonSilent = 0;
    let fillWords = 0;
    for (let i = 0; i < channel.length; i++) {
      if (channel[i] !== 0) {
        nonSilent++;
      }
      if (bits[i] === this.fillWord) {
        fillWords++;
      }
    }
    return { nonSilent, fillWords };
  }

  process(inputs) {
    if (this.reported) {
      return false;
    }

    const source = inputs[0];
    if (source.length > 1 && source[1].some(isNonZero)) {
      this.report(this.tally(source[1]));
      return false;
    }

    if (this.markerFrame < 0) {
      const marker = inputs[1];
      if (marker.length && marker[0].some(isNonZero)) {
        this.markerFrame = currentFrame;
      }
    } else if (currentFrame - this.markerFrame >= this.budgetFrames) {
      this.report({ nonSilent: 0, fillWords: 0, frames: this.budgetFrames });
      return false;
    }

    // Remain active until the post-marker observation budget expires.
    return true;
  }
}

registerProcessor("channel-fill-probe", ChannelFillProbe);
