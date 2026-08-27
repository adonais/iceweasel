// Each registerTestCase() is one decodingInfo() or encodingInfo() query.
// worker: true also runs the case in a worker.

var WEBRTC_VIDEO = { width: 1280, height: 720, bitrate: 2000000, framerate: 30 };
var FILE_VIDEO = { width: 1920, height: 1080, bitrate: 5000000, framerate: 30 };
var WEBRTC_H264 =
  "video/H264;profile-level-id=42e01f;packetization-mode=1;level-asymmetry-allowed=1";
var AVC_MP4 = 'video/mp4; codecs="avc1.640028"';
var VP9_WEBM = 'video/webm; codecs="vp09.00.40.08"';
var VP8_WEBM = 'video/webm; codecs="vp8"';
var AV1_MP4 = 'video/mp4; codecs="av01.0.08M.08"';
var HEVC_MP4 = 'video/mp4; codecs="hvc1.1.6.L120.B0"';
var AAC_MP4 = 'audio/mp4; codecs="mp4a.40.2"';
var OPUS_WEBM = 'audio/webm; codecs="opus"';
var MP3_MP4 = 'audio/mp4; codecs="mp3"';
var FLAC_MP4 = 'audio/mp4; codecs="flac"';
var VORBIS_WEBM = 'audio/webm; codecs="vorbis"';
var WAV_PCM = 'audio/wav; codecs="1"';

registerTestCase({
  name: "decode-webrtc-video-vp8",
  kind: "decode",
  worker: true,
  config: { type: "webrtc", video: { ...WEBRTC_VIDEO, contentType: "video/VP8" } },
});
registerTestCase({
  name: "decode-webrtc-video-vp9",
  kind: "decode",
  worker: true,
  config: { type: "webrtc", video: { ...WEBRTC_VIDEO, contentType: "video/VP9" } },
});
registerTestCase({
  name: "decode-webrtc-video-h264",
  kind: "decode",
  worker: true,
  config: { type: "webrtc", video: { ...WEBRTC_VIDEO, contentType: WEBRTC_H264 } },
});
registerTestCase({
  name: "decode-webrtc-video-av1",
  kind: "decode",
  worker: true,
  config: { type: "webrtc", video: { ...WEBRTC_VIDEO, contentType: "video/AV1" } },
});
registerTestCase({
  name: "decode-webrtc-audio-opus",
  kind: "decode",
  worker: true,
  config: { type: "webrtc", audio: { contentType: "audio/opus" } },
});
registerTestCase({
  name: "decode-webrtc-audio-g722",
  kind: "decode",
  worker: true,
  config: { type: "webrtc", audio: { contentType: "audio/G722" } },
});
registerTestCase({
  name: "decode-webrtc-audio-pcmu",
  kind: "decode",
  worker: true,
  config: { type: "webrtc", audio: { contentType: "audio/PCMU" } },
});
registerTestCase({
  name: "decode-webrtc-audio-pcma",
  kind: "decode",
  worker: true,
  config: { type: "webrtc", audio: { contentType: "audio/PCMA" } },
});

registerTestCase({
  name: "encode-webrtc-video-vp8",
  kind: "encode",
  worker: true,
  config: { type: "webrtc", video: { ...WEBRTC_VIDEO, contentType: "video/VP8" } },
});
registerTestCase({
  name: "encode-webrtc-video-vp9",
  kind: "encode",
  worker: true,
  config: { type: "webrtc", video: { ...WEBRTC_VIDEO, contentType: "video/VP9" } },
});
registerTestCase({
  name: "encode-webrtc-video-h264",
  kind: "encode",
  worker: true,
  config: { type: "webrtc", video: { ...WEBRTC_VIDEO, contentType: WEBRTC_H264 } },
});
registerTestCase({
  name: "encode-webrtc-video-av1",
  kind: "encode",
  worker: true,
  config: { type: "webrtc", video: { ...WEBRTC_VIDEO, contentType: "video/AV1" } },
});
registerTestCase({
  name: "encode-webrtc-audio-opus",
  kind: "encode",
  worker: true,
  config: { type: "webrtc", audio: { contentType: "audio/opus" } },
});
registerTestCase({
  name: "encode-webrtc-audio-g722",
  kind: "encode",
  worker: true,
  config: { type: "webrtc", audio: { contentType: "audio/G722" } },
});
registerTestCase({
  name: "encode-webrtc-audio-pcmu",
  kind: "encode",
  worker: true,
  config: { type: "webrtc", audio: { contentType: "audio/PCMU" } },
});
registerTestCase({
  name: "encode-webrtc-audio-pcma",
  kind: "encode",
  worker: true,
  config: { type: "webrtc", audio: { contentType: "audio/PCMA" } },
});

// The file and media-source video paths create a real decoder, so they are far
// slower and use fewer iterations. Only one (AVC) also runs in a worker.
registerTestCase({
  name: "decode-file-video-avc",
  kind: "decode",
  iterations: 10,
  worker: true,
  config: { type: "file", video: { ...FILE_VIDEO, contentType: AVC_MP4 } },
});
registerTestCase({
  name: "decode-file-video-vp9",
  kind: "decode",
  iterations: 10,
  config: { type: "file", video: { ...FILE_VIDEO, contentType: VP9_WEBM } },
});
registerTestCase({
  name: "decode-file-video-vp8",
  kind: "decode",
  iterations: 10,
  config: { type: "file", video: { ...FILE_VIDEO, contentType: VP8_WEBM } },
});
registerTestCase({
  name: "decode-file-video-av1",
  kind: "decode",
  iterations: 10,
  config: { type: "file", video: { ...FILE_VIDEO, contentType: AV1_MP4 } },
});
registerTestCase({
  name: "decode-file-video-hevc",
  kind: "decode",
  iterations: 10,
  config: { type: "file", video: { ...FILE_VIDEO, contentType: HEVC_MP4 } },
});
registerTestCase({
  name: "decode-file-audio-aac",
  kind: "decode",
  config: { type: "file", audio: { contentType: AAC_MP4 } },
});
registerTestCase({
  name: "decode-file-audio-opus",
  kind: "decode",
  config: { type: "file", audio: { contentType: OPUS_WEBM } },
});
registerTestCase({
  name: "decode-file-audio-mp3",
  kind: "decode",
  config: { type: "file", audio: { contentType: MP3_MP4 } },
});
registerTestCase({
  name: "decode-file-audio-flac",
  kind: "decode",
  config: { type: "file", audio: { contentType: FLAC_MP4 } },
});
registerTestCase({
  name: "decode-file-audio-vorbis",
  kind: "decode",
  config: { type: "file", audio: { contentType: VORBIS_WEBM } },
});
registerTestCase({
  name: "decode-file-audio-pcm",
  kind: "decode",
  config: { type: "file", audio: { contentType: WAV_PCM } },
});
registerTestCase({
  name: "decode-media-source-video-avc",
  kind: "decode",
  iterations: 10,
  config: { type: "media-source", video: { ...FILE_VIDEO, contentType: AVC_MP4 } },
});
registerTestCase({
  name: "decode-media-source-video-vp9",
  kind: "decode",
  iterations: 10,
  config: { type: "media-source", video: { ...FILE_VIDEO, contentType: VP9_WEBM } },
});
registerTestCase({
  name: "decode-media-source-video-vp8",
  kind: "decode",
  iterations: 10,
  config: { type: "media-source", video: { ...FILE_VIDEO, contentType: VP8_WEBM } },
});
registerTestCase({
  name: "decode-media-source-video-av1",
  kind: "decode",
  iterations: 10,
  config: { type: "media-source", video: { ...FILE_VIDEO, contentType: AV1_MP4 } },
});
registerTestCase({
  name: "decode-media-source-video-hevc",
  kind: "decode",
  iterations: 10,
  config: { type: "media-source", video: { ...FILE_VIDEO, contentType: HEVC_MP4 } },
});
registerTestCase({
  name: "decode-media-source-audio-aac",
  kind: "decode",
  config: { type: "media-source", audio: { contentType: AAC_MP4 } },
});
registerTestCase({
  name: "decode-media-source-audio-opus",
  kind: "decode",
  config: { type: "media-source", audio: { contentType: OPUS_WEBM } },
});
registerTestCase({
  name: "decode-media-source-audio-mp3",
  kind: "decode",
  config: { type: "media-source", audio: { contentType: MP3_MP4 } },
});
registerTestCase({
  name: "decode-media-source-audio-flac",
  kind: "decode",
  config: { type: "media-source", audio: { contentType: FLAC_MP4 } },
});
registerTestCase({
  name: "decode-media-source-audio-vorbis",
  kind: "decode",
  config: { type: "media-source", audio: { contentType: VORBIS_WEBM } },
});
