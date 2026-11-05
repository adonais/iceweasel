// META: global=window,dedicatedworker
'use strict';

const kTypes = ['file', 'media-source'];

function configWith(type, contentType) {
  return {
    type,
    video: {
      contentType,
      width: 800,
      height: 600,
      bitrate: 3000,
      framerate: 24,
    },
  };
}

async function assertSameCapabilities(type, profileless, withProfile) {
  const a =
    await navigator.mediaCapabilities.decodingInfo(configWith(type, profileless));
  const b =
    await navigator.mediaCapabilities.decodingInfo(configWith(type, withProfile));
  assert_true(a.supported, `${profileless} is supported`);
  assert_equals(a.supported, b.supported, 'supported');
  assert_equals(a.smooth, b.smooth, 'smooth');
  assert_equals(a.powerEfficient, b.powerEfficient, 'powerEfficient');
  assert_equals(a.keySystemAccess, b.keySystemAccess, 'keySystemAccess');
}

const kEquivalentCodecs = [
  {name: 'vp8', bare: 'video/webm; codecs="vp8"',
   qualified: 'video/webm; codecs="vp08.00.41.08"'},
  {name: 'vp9', bare: 'video/webm; codecs="vp9"',
   qualified: 'video/webm; codecs="vp09.00.10.08"'},
  {name: 'av1', bare: 'video/mp4; codecs="av1"',
   qualified: 'video/mp4; codecs="av01.0.04M.08"'},
  {name: 'avc1', bare: 'video/mp4; codecs="avc1"',
   qualified: 'video/mp4; codecs="avc1.42E01E"'},
];

for (const type of kTypes) {
  for (const {name, bare, qualified} of kEquivalentCodecs) {
    promise_test(
      () => assertSameCapabilities(type, bare, qualified),
      `${type}: profile-less '${name}' matches its qualified form`);
  }
}

for (const type of kTypes) {
  promise_test(async () => {
    const {supported} = await navigator.mediaCapabilities.decodingInfo(
      configWith(type, 'video/mp4; codecs="hev1"'));
    assert_false(supported);
  }, `${type}: profile-less 'hev1' is unsupported`);
}
