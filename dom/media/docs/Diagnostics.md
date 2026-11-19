# Diagnosing media bug reports

This page tells which data in a media bug report shows the cause, and how to
capture a media profile and log.

## about:support

### Important Modified Preferences

Look for `media.*`, `gfx.*` and `layers.*` prefs that are not at their default.
Read the value, not only the name: some of these prefs are normal user choices
in Settings.

The prefs that most often explain a media bug control hardware decoding
(`media.hardware-video-decoding.*`), the GPU (`layers.acceleration.disabled`,
`gfx.webrender.software`), the decoders and the CDMs (`media.ffmpeg.*`,
`media.ffvpx-hw.enabled`, `media.wmf.*`, `media.eme.*`, `media.gmp-*`) and
autoplay (`media.autoplay.default`). To learn what a pref does and what its
default is, read its entry in `modules/libpref/init/StaticPrefList.yaml`,
`modules/libpref/init/all.js` or `browser/app/profile/firefox.js`. A pref that
none of these files has is no longer used, so its value has no effect.

A pref with `mirror: once` in `modules/libpref/init/StaticPrefList.yaml` takes
effect only after a restart. A pref with `mirror: always` takes effect at once.
A restart after a pref reset applies all of them.

### Decision Log

The Decision Log is in the "Graphics" section. The `HARDWARE_VIDEO_DECODING`
and `HARDWARE_VIDEO_ENCODING` entries tell if hardware decoding and encoding
are available. If they are not, the entry gives the reason (blocklist, pref,
driver, missing capability) and a failure code.

### Media

The "Media" section has the "Codec Support Information" and the "Content
Decryption Modules Information" subsections.

#### Codec Support Information

This subsection shows software and hardware decode and encode support for each
codec (H.264, VP9, AV1, HEVC and more). A codec with no support at all shows a
missing decoder, not a configuration problem.

#### Content Decryption Modules Information

This subsection lists the installed CDMs (Widevine, OpenH264, the Media
Foundation CDMs such as PlayReady) and their versions. For an EME bug, it shows
if the CDM for the key system is present.

## Media logs

In a media log, these signals point to the cause. The log module is in
parentheses.

- `NS_ERROR_DOM_MEDIA_*` and other `NS_ERROR_*` codes (all modules).
- The decoder that Firefox chose, for example WMF, AppleMedia, FFmpeg, ffvpx or
  VPX (`MediaFormatReader`, `PlatformDecoderModule`).
- State changes of Media Source Extensions (`MediaSource`,
  `MediaSourceSamples`).
- State changes of `MediaDecoderStateMachine` (`MediaDecoder`).
- Network stalls (`MediaResource`, `MediaCache`).

## Profiles

A media profile records the threads and markers of the `media` profiler
preset. It has threads such as `MediaDecoderStateMachine`, `MediaSupervisor`,
`MediaPDecoder`, `MediaPEncoder` and the AudioIPC callback threads
(`AudioIPC Client Callback`, `AudioIPC Server Callback`). On Windows, it has
markers such as `WMFInit DXVA Status`, `WMFVDecoderCreation Success` and
`WMFVDecoderCreation Failure`. Log markers show text such as `DXVA failure` or
`NS_ERROR_DOM_MEDIA_*`. A generic CPU, JavaScript or networking profile does
not show the media pipeline.

For agents, the `profiler-analysis` skill reads a Firefox Profiler link, and
the `profile-capture` skill records a new profile. Both skills are in the tree.

### Read every media thread

Read all media threads, not only `MediaDecoderStateMachine #1`: each
`MediaSupervisor #N`, each `MediaPDecoder #N`, the `Renderer` thread in the
GPU process, and `GeckoMain`. `MediaPDecoder` threads are in the RDD process.
On Windows, hardware decoding is only in the GPU process, so `MediaPDecoder`
threads are also in the GPU process. Read the CPU use and the
wait state. A decoder thread that waits (for example in
`NtWaitForMultipleObjects` or `ZwWaitForAlertByThreadId`) with large gaps
between frames does not get work. That is a different bug from a thread that
uses all of its CPU.

### Hardware decode failure pattern

Repeated `DXVA failure:` or `NS_ERROR_DOM_MEDIA_*` entries on Windows can have
these causes:

1. DXVA has no free decoder slot. The log shows `DXVA failure: Too many DXVA
   videos playing`. `media.wmf.dxva.max-videos` sets the limit, and sites with
   a feed of videos can keep many videos alive.
2. `CanUseDXVA()` returns false for the parameters of this video.
3. Firefox cannot create the D3D11 device, for example after a driver problem
   or a GPU reset.

`WMFDecoderModule::Supports()`, which `MediaCapabilities.decodingInfo()` uses,
does not check the free DXVA slots. So Firefox can report hardware decode
support while new decoders fail.

In WMF, H.264 has a software fallback. HEVC, VP9, AV1 and VP8 do not: the
decoder returns `NS_ERROR_DOM_MEDIA_FATAL_ERR` when hardware acceleration is
not available.

## A hang in the RDD or GPU process

To find out if the sandbox causes a hang or a failure in the RDD or GPU process,
start Firefox once with `MOZ_DISABLE_RDD_SANDBOX=1` or
`MOZ_DISABLE_GPU_SANDBOX=1` in the environment. Then start Firefox again
without the variable.

## What a useful report has

| Bug type                     | Data                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Playback failure             | The media URL or a sample file, the codec or container, about:support, the platform          |
| Recording                    | Device information, the `getUserMedia` constraints, a page or snippet that shows the problem |
| Web Audio                    | A minimal snippet that shows the problem, the `AudioContext` configuration, about:support    |
| WebCodecs                    | A minimal snippet that shows the problem, the codec configuration, about:support             |
| Performance or audio quality | An about:logging capture with the "Media playback" preset, the platform, the steps           |
| GMP or EME                   | The key system, the platform, about:support                                                  |

## Capture a media profile and log

about:logging records the media log modules and a profile in one capture. The
capture is a profile, not a `.moz_log` file, and it does not start from
profiler.firefox.com.

1. Open `about:logging`.
2. Under "Log module selection", choose "Media playback" in the
   "Logging preset:" drop-down.
3. Under "Logging output", select "Logging to the Firefox Profiler".
4. Click "Start Logging".
5. Reload the page, then do the steps that show the problem.
6. Click "Stop Logging".

On desktop, the profile then opens on profiler.firefox.com. Its "Upload Local
Profile" button gives a share URL. On Android,
`toolkit.aboutLogging.uploadProfileToCloud` is `true`, so about:logging itself
offers to save or upload the profile, and shows a "Share URL" after the upload.

Use the "Graphics" preset in place of, or with, "Media playback" when the
problem is in the GPU, compositor or overlay path. Use the "WebRTC" preset for
calls and the "WebCodecs" preset for WebCodecs.

{doc}`/xpcom/logging` tells how about:logging, its presets and `MOZ_LOG` work.
{doc}`/performance/reporting_a_performance_problem` tells how to capture and
share a profile from the profiler toolbar button.
