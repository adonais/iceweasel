// META: global=window
// META: variant=?mode=strict
// META: variant=?mode=supportscache

// Note this test does not assert what we should support, since codec support
// is machine dependent. Test expectations for CI are in the meta file and
// would need to be cross-checked with machine capabilities.

function testInfo(info, desc) {
  test(() => assert_true(info.supported), `encodingInfo: ${desc} is supported`);
  if (info.supported) {
    test(() => assert_true(info.powerEfficient), `encodingInfo: ${desc} is powerEfficient`);
    test(() => assert_true(info.smooth), `encodingInfo: ${desc} is smooth`);
  }
}

async function runTests() {
  const kWebrtcCodecs = ['video/VP8', 'video/VP9', 'video/H264', 'video/AV1'];
  for (const contentType of kWebrtcCodecs) {
    testInfo(await navigator.mediaCapabilities.encodingInfo({
        type: 'webrtc',
        video: {
          contentType,
          width: 640,
          height: 480,
          bitrate: 500000,
          framerate: 30,
        },
      }), `WebRTC ${contentType} 640x480`);

    testInfo(await navigator.mediaCapabilities.encodingInfo({
        type: 'webrtc',
        video: {
          contentType,
          width: 1920,
          height: 1080,
          bitrate: 20000000,
          framerate: 30,
        },
      }), `WebRTC ${contentType} 1920x1080`);

    testInfo(await navigator.mediaCapabilities.encodingInfo({
        type: 'webrtc',
        video: {
          contentType,
          width: 7680,
          height: 4320,
          bitrate: 50000000,
          framerate: 30,
        },
      }), `WebRTC ${contentType} 7680x4320`);
  }
}

setup({explicit_done: true});
runTests().then(done);
