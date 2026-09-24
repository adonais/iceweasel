// META: global=window
// META: variant=?mode=strict
// META: variant=?mode=supportscache

// Note this test does not assert what we should support, since codec support
// is machine dependent. Test expectations for CI are in the meta file and
// would need to be cross-checked with machine capabilities.

function testInfo(info, desc) {
  test(() => assert_true(info.supported), `decodingInfo: ${desc} is supported`);
  if (info.supported) {
    test(() => assert_true(info.powerEfficient), `decodingInfo: ${desc} is powerEfficient`);
    test(() => assert_true(info.smooth), `decodingInfo: ${desc} is smooth`);
  }
}

async function runTests() {
  const kWebrtcCodecs = ['video/VP8', 'video/VP9', 'video/H264', 'video/AV1'];
  for (const contentType of kWebrtcCodecs) {
    testInfo(await navigator.mediaCapabilities.decodingInfo({
        type: 'webrtc',
        video: {
          contentType,
          width: 640,
          height: 480,
          bitrate: 500000,
          framerate: 30,
        },
      }), `WebRTC ${contentType} 640x480`);


    testInfo(await navigator.mediaCapabilities.decodingInfo({
        type: 'webrtc',
        video: {
          contentType,
          width: 1920,
          height: 1080,
          bitrate: 20000000,
          framerate: 30,
        },
      }), `WebRTC ${contentType} 1920x1080`);

    testInfo(await navigator.mediaCapabilities.decodingInfo({
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

  const kPlaybackTypes = [
      'video/webm; codecs=vp08.00.10.08',
      'video/mp4; codecs=vp09.00.10.08',
      'video/webm; codecs=vp09.00.10.08',
      'video/mp4; codecs=avc1.42E01E',
      'video/mp4; codecs=hvc1.1.6.L63.B0',
      'video/mp4; codecs=av01.0.10M.08',
      'video/webm; codecs=av01.0.10M.08',
    ];
  for (const contentType of kPlaybackTypes) {
    testInfo(await navigator.mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: {
          contentType,
          width: 640,
          height: 480,
          bitrate: 500000,
          framerate: 30,
        },
      }), `MSE ${contentType} 640x480`);

    testInfo(await navigator.mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: {
          contentType,
          width: 1920,
          height: 1080,
          bitrate: 20000000,
          framerate: 30,
        },
      }), `MSE ${contentType} 1920x1080`);

    testInfo(await navigator.mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: {
          contentType,
          width: 7680,
          height: 4320,
          bitrate: 50000000,
          framerate: 120,
        },
      }), `MSE ${contentType} 8k@120`);
  }

  const kHdrPlaybackTypes = [
      'video/mp4; codecs=vp09.02.51.12.01.09.16.09.00',
      'video/webm; codecs=vp09.02.51.12.01.09.16.09.00',
      'video/mp4; codecs=hvc1.4.1.L153.B0.9.16.9',
      'video/mp4; codecs=av01.2.12M.12.0.110.09.16.09.0',
      'video/webm; codecs=av01.2.12M.12.0.110.09.16.09.0',
    ];
  for (const contentType of kHdrPlaybackTypes) {
    testInfo(await navigator.mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: {
          contentType,
          width: 1920,
          height: 1080,
          bitrate: 1000000,
          framerate: 24,
          hdrMetadataType: 'smpteSt2086',
          colorGamut: 'rec2020',
          transferFunction: 'pq',
        },
      }), `MSE ${contentType} with 1080p@24 HDR`);

    testInfo(await navigator.mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: {
          contentType,
          width: 1920,
          height: 1080,
          bitrate: 5000000,
          framerate: 120,
          hdrMetadataType: 'smpteSt2086',
          colorGamut: 'rec2020',
          transferFunction: 'pq',
        },
      }), `MSE ${contentType} with 1080p@120 HDR`);

    testInfo(await navigator.mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: {
          contentType,
          width: 7680,
          height: 4320,
          bitrate: 5000000,
          framerate: 120,
          hdrMetadataType: 'smpteSt2086',
          colorGamut: 'rec2020',
          transferFunction: 'pq',
        },
      }), `MSE ${contentType} with 8k@120 HDR`);
  }
}

setup({explicit_done: true});
runTests().then(done);
