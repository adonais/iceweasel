// META: global=window,dedicatedworker

// Regression test for Bug 2070255. MediaRecorder records video as VP8 in a
// WebM container. This query used to be routed through the WebRTC encoder
// factories, which expect a bare "video/<codec>" MIME type, so the container
// type resolved to CodecType::Unknown: an assertion failure in debug builds,
// and supported:false in opt builds.

// smooth comes from VP8 software encode measurements, scaled by framerate and
// by this machine's libvpx thread count, and powerEfficient from a 640x480
// pixel count threshold. These cases land on the same side of the smooth
// threshold for every thread count libvpx can pick.
const kCases = [
  {
    name: '640x480 at 30fps (powerEfficient boundary)',
    width: 640,
    height: 480,
    framerate: 30,
    bitrate: 500000,
    smooth: true,
    powerEfficient: true,
  },
  {
    name: '854x480 at 30fps (above the powerEfficient boundary)',
    width: 854,
    height: 480,
    framerate: 30,
    bitrate: 1000000,
    smooth: true,
    powerEfficient: false,
  },
  {
    name: '1920x1080 at 240fps (framerate above the measured ratio)',
    width: 1920,
    height: 1080,
    framerate: 240,
    bitrate: 5000000,
    smooth: false,
    powerEfficient: false,
  },
  {
    name: '7680x4320 at 30fps (above the largest measured resolution)',
    width: 7680,
    height: 4320,
    framerate: 30,
    bitrate: 50000000,
    smooth: false,
    powerEfficient: false,
  },
];

for (const testCase of kCases) {
  promise_test(async () => {
    const info = await navigator.mediaCapabilities.encodingInfo({
      type: 'record',
      video: {
        contentType: 'video/webm; codecs="vp8"',
        width: testCase.width,
        height: testCase.height,
        bitrate: testCase.bitrate,
        framerate: testCase.framerate,
      },
    });
    assert_true(info.supported, 'supported');
    assert_equals(info.smooth, testCase.smooth, 'smooth');
    assert_equals(info.powerEfficient, testCase.powerEfficient,
                  'powerEfficient');
  }, `encodingInfo: record video/webm vp8 ${testCase.name}`);
}

promise_test(async () => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: 'record',
    audio: {
      contentType: 'audio/webm; codecs="opus"',
    },
  });
  assert_true(info.supported, 'supported');
  assert_true(info.smooth, 'smooth');
  assert_true(info.powerEfficient, 'powerEfficient');
}, 'encodingInfo: record audio/webm opus is supported, smooth, powerEfficient');
