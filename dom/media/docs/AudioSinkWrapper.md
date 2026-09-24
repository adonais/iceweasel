# AudioSinkWrapper

`AudioSinkWrapper` wraps an `AudioSink` behind the `MediaSink` interface and owns
the media playback clock that `MediaDecoderStateMachine` (MDSM) reads through
`GetPosition()`. This page documents that clock behaviour, which is where most of
the class's complexity lives. The video sink displays each frame when that clock
reaches the frame's timestamp, so the accuracy of this clock *is* audio/video
synchronisation: if the reported clock runs ahead of the sound actually coming
out of the speakers, the video leads the audio.

Leading is the worse direction. In the physical world sound arrives after light,
so a small audio lag reads as natural while audio arriving before the picture is
jarring. The aim is still tight synchronisation, but if the clock must err, it
should err behind the audio, never ahead of it.

The clock logic looks simple but has to serve several situations that each need
a different clock source. This page describes the model and lists those
situations; `dom/media/gtest/TestAudioSinkWrapper.cpp` is the executable
specification of the exact behaviour.

## The clock model

The reported position comes from one of three sources:

- **Audio-stream clock** — `anchor + played`, where the *anchor* is the audio
  sink's start time and *played* is the stream's play cursor. This is the normal
  source while audio is being heard.
- **System clock** — wall-clock time elapsed since playback started, added to a
  stored datum. Used while there is no audio being rendered (muted, or no audio
  track), or briefly while an audio stream is starting up.
- **Constant** — a fixed position, reported while paused.

### Output latency: play cursor vs write cursor

A backend's *play cursor* lags its *write cursor* by the device's output
latency, and the gap between them is audio handed over but not yet heard. The
audio-stream clock follows the play cursor, so it reflects what is *heard*, not
what has merely been written. On built-in speakers the latency is tens of
milliseconds; on Bluetooth or a remoted backend it can be hundreds.

[AudioStream](AudioStream.md) defines both cursors and that gap in full, and
owns the arithmetic that maps a play-cursor value to a media time.

## Invariants

1. **Never lead the audible audio.** The reported clock must not get ahead of
   the play cursor, otherwise the video leads the sound.
2. **Never go backwards.** The reported clock must be monotonic
   non-decreasing; `MediaDecoderStateMachine::GetClock` guards this with a debug
   assertion, `GetMediaTime() <= clockTime`.

The seek-resume modes below are where these two invariants pull in opposite
directions.

## Clock behaviour by playback mode

Each way playback starts or resumes picks one of the three clock sources above.
The audible seek-resume modes are the subtle ones and are given as timelines; the
rest are short.

### Audible start

Playback starts unmuted from stopped. The audio sink is created synchronously, so
it exists before the clock is first read, and the audio-stream clock drives from
the start time. This is the ordinary case and needs no system-clock phase.

### Muted start, or no audio track

No audio sink is created, because `NeedAudioSink()` is false while muted or when
there is no audio track. The system clock drives from the start time. A muted
element that is later unmuted moves to the "Unmute" mode below; a track-less
element stays here.

### Audible seek resume, stream reused

The stashed stream was never stopped across the seek pause, so its callback is
still running. After `Start(SeekResume)`:

1. `ResumeStashedAudioSink` runs synchronously; the running stream is rebased to
   the seek target, so a sink exists immediately.
2. The first `GetPosition` follows the audio stream from the target; the callback
   is already running, so the seek-resume hold clears on that first read.
3. Thereafter it is the plain audio clock, `target + play cursor`.

There is no system-clock phase: the clock naturally sits at the target while the
play cursor is still inside the output-latency window, then climbs as audio
becomes audible.

### Audible seek resume, stream recreated

There is no stashed stream, so a new one is created asynchronously and there is
an init window. Through it the clock is held at the target rather than advanced
on the system clock. After `Start(SeekResume)`:

1. Asynchronous creation starts; there is no sink yet.
2. `GetPosition` reports the seek target, frozen.
3. Creation completes; the sink starts at the target with no forward re-anchor.
4. `GetPosition` follows the audio stream from the target, still at the target
   while the play cursor is inside the output-latency window.
5. Once the callback runs, the hold clears and the plain audio clock drives.

### Seek while muted

No sink is created. The system clock drives, and although `Start(SeekResume)`
sets the seek-resume hold, the muted system-clock path clears it, so a later
unmute takes the normal handoff rather than snapping back to the stale seek
target.

### Unmute

A muted element is unmuted mid-playback. The sink is created asynchronously; the
system clock drives until the callback starts, then the audio clock takes over,
re-anchored forward to the system position, because the muted time was real
playback progress.

### Paused

A constant position is reported.

## Why seek resume and unmute are treated differently

Both start an audio stream while the system clock has been driving, and both must
avoid a backward jump when the audio clock takes over. It is tempting to give
them the same treatment, but they diverge on what the elapsed wall-clock time
*meant*, and that changes what the clock should do.

The system-clock path (used by unmute) advances the clock to the current
wall-clock position and pairs that with dropping the decoded audio behind it, via
`DropAudioPacketsIfNeeded`. In effect it says "time moved on, so skip the
now-past audio and let the sink catch up to the clock." Whether that is right
depends on whether time really did move on:

- **Unmute:** while muted, playback genuinely continued; the position advanced,
  only silently. The skipped audio already played, so dropping it and advancing
  the clock to the current position is correct — the user should not re-hear it.
- **Seek resume:** the wall time is only the stream (re)starting; nothing played.
  The audio at the seek target has *not* played, so it is not outdated — it is
  exactly what the user asked to hear. Applying the same treatment would go wrong
  two ways: dropping that audio makes the seek land late (the user seeks to `T`
  but starts hearing from `T + gap`), and advancing the clock still leaves it
  ahead of the audible audio, because the play cursor lags the write cursor by
  the output latency no matter what — that lag is physical and cannot be dropped
  away.

So seek resume does the opposite: it holds the clock at the target and then lets
it follow the play cursor — "catch the clock up to the audio" rather than "catch
the audio up to the clock." The user hears from exactly the seek target, and the
reported clock equals what is audible.

Conflating the two is what caused the seek-resume A/V desync on high-latency
output devices: advancing on the system clock left the reported clock ahead of
the audible audio by the output latency, which is negligible on built-in speakers
but clearly visible on Bluetooth.

## Stream reuse across a seek

`media.audio.reuse-stream-on-seek` selects between the two seek-resume paths.
When enabled, the audio stream is kept alive across the seek pause and reused on
resume, avoiding a fresh cubeb stream initialisation; when disabled, the stream
is torn down and a new one is created. Both paths reach the same seek-resume
clock behaviour and differ only in whether a stream is created.

### Silence while the sink is stopped for the seek

A reused stream is never stopped, so its callback keeps running while the sink is
stopped for the seek. The audio still queued at that point belongs to the
position being left behind, so it is dropped as the seek begins and the stream
outputs silence until the resume.

Three things follow from emptying the buffer on purpose, and all three are load
bearing:

- The reported position holds at the seek target rather than advancing, because
  the missing frames are accounted as underrun and the position is clamped to the
  frames actually serviced. Handing back a full buffer of explicit silence
  instead would count as played audio and put the clock ahead of what is heard.
- The stream is held out of its ended state for that window, so a seek issued
  once the audio queue has already finished does not drain it and cost the reuse.
- The shortfall is not reported as a glitch. It is deliberate, and a run of
  underrun markers across an ordinary seek would mislead anyone reading a profile
  for a real one.

## Verifying the behaviour

`dom/media/gtest/TestAudioSinkWrapper.cpp` exercises these situations and is the
source of truth for the exact behaviour; keep it and this page in sync.
