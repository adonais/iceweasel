// META: global=window,dedicatedworker

const kVideoBase = {
  width: 640,
  height: 480,
  bitrate: 500000,
  framerate: 30,
};

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1' },
  });
  assert_true(info.supported, 'absent fmtp params is supported');
}, 'encodingInfo: AV1 with no fmtp params is supported');

// The RTP payload spec defaults an absent level-idx to level 3.1, whose
// MaxPicSize 1080p exceeds. MediaCapabilities instead infers the level from
// the requested resolution, so this is supported. (For encoding an explicit
// level-idx=5 is supported too, since the encoder downscales to fit.)
promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, width: 1920, height: 1080, contentType: 'video/AV1' },
  });
  assert_true(info.supported);
}, 'encodingInfo: AV1 with no level-idx at 1080p is not capped by the default level 3.1');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: {
      ...kVideoBase,
      width: 1920,
      height: 1080,
      contentType: 'video/AV1;level-idx=5',
    },
  });
  assert_true(info.supported);
}, 'encodingInfo: AV1 explicit level-idx=5 (3.1) at 1080p exceeds the level cap but is supported (downscaled)');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: {
      ...kVideoBase,
      contentType: 'video/AV1;profile=0;level-idx=9;tier=0',
    },
  });
  assert_true(info.supported);
}, 'encodingInfo: AV1 with valid profile/level-idx/tier is supported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;profile=9' },
  });
  assert_false(info.supported);
  assert_false(info.smooth);
  assert_false(info.powerEfficient);
}, 'encodingInfo: AV1 with invalid profile is unsupported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;level-idx=2' },
  });
  assert_false(info.supported);
}, 'encodingInfo: AV1 with an undefined-but-named level-idx is unsupported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;level-idx=25' },
  });
  assert_false(info.supported);
}, 'encodingInfo: AV1 with a reserved level-idx is unsupported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;level-idx=99' },
  });
  assert_false(info.supported);
}, 'encodingInfo: AV1 with an out-of-range level-idx is unsupported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;tier=2' },
  });
  assert_false(info.supported);
}, 'encodingInfo: AV1 with an invalid tier is unsupported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;level-idx=5;tier=1' },
  });
  assert_false(info.supported);
}, 'encodingInfo: AV1 high tier with an explicit level below 4.0 is unsupported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;level-idx=8;tier=1' },
  });
  assert_true(info.supported);
}, 'encodingInfo: AV1 high tier at level 4.0 is supported');

// With no level-idx the level is inferred from the resolution, which is only
// a lower bound, so there is no level to judge the tier against.
promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;tier=1' },
  });
  assert_true(info.supported);
}, 'encodingInfo: AV1 high tier with no level-idx is supported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;level-idx=banana' },
  });
  assert_false(info.supported);
}, 'encodingInfo: AV1 with a non-numeric level-idx is unsupported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: { ...kVideoBase, contentType: 'video/AV1;level-idx=9!' },
  });
  assert_false(info.supported);
}, 'encodingInfo: AV1 with a level-idx with trailing junk is unsupported');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: {
      ...kVideoBase,
      width: 7680,
      height: 4320,
      contentType: 'video/AV1;level-idx=31',
    },
  });
  assert_true(info.supported);
}, 'encodingInfo: AV1 level-idx=31 (Maximum parameters) imposes no resolution cap');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: {
      ...kVideoBase,
      width: 3840,
      height: 2160,
      contentType: 'video/AV1;level-idx=1',
    },
  });
  assert_true(info.supported);
}, 'encodingInfo: AV1 level-idx=1 (2.1) at 3840x2160 exceeds the level cap but is supported (downscaled)');

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'webrtc',
    video: {
      ...kVideoBase,
      width: 640,
      height: 360,
      contentType: 'video/AV1;level-idx=1',
    },
  });
  assert_true(info.supported);
}, 'encodingInfo: AV1 level-idx=1 (2.1) at 640x360 fits the level cap and is supported');
