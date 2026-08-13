# IPC & remote decoding — dom/media review guidance

> Posture: the process on the other end of an actor is untrusted — a
> less-privileged content/GPU process may be compromised, so the receiver
> validates everything.

## General actor correctness

- **Validate on the receiving side.** Every new/changed message validates its
  inputs where it is received (a parent treats child input as hostile; validate
  the reverse direction too where a less-trusted peer sends to a more-trusted
  one). Do not assume a size/index/handle from the peer is in range.
- **Message flow / ordering.** Do not assume the peer sends messages in a
  particular order, or at all. Handle missing/late/duplicate messages.
- **Actor lifetime.** No `Send*` after `ActorDestroy`/`__delete__`; managed actors
  are torn down in the correct order; no dangling reference to a destroyed actor;
  `ActorDestroy` cleans up cleanly (including when the peer crashed).
- **IPDL annotations.** `nested`/`compress`/`[Async]`/`[Sync]` and message
  direction/side are correct for how the message is actually used.

## dom/media specifics

- **Remote decoding actors.** `RemoteMediaManagerChild`/`Parent` (formerly
  `RemoteDecoderManager*`) and the per-decoder `RemoteVideoDecoderChild`/
  `RemoteAudioDecoderChild` (under `PRemoteMediaManager`) run the decode in the RDD
  (or GPU/utility) process. Review new `Recv*`/`Send*` for input validation and
  correct actor thread affinity (the manager runs on its own thread — messages
  must be sent/received there).
- **Trust boundary on decoded output.** Frame descriptors, buffer sizes, strides,
  and `Shmem`/GPU handles coming back from the decoder process are untrusted —
  validate before mapping, indexing, or allocating against them. (The
  bounds/overflow mechanics of that validation are the memory-safety aspect; here
  the concern is that the check exists at the boundary at all.)
- **Shmem / handle lifetime.** A `Shmem` or GPU/texture handle shared across the
  boundary is released exactly once and not used after the owning actor is gone.
  Cross-process video images are ref-counted through a holder (`RemoteImageHolder`)
  that signals the decoder process to release when the last content-process
  reference drops — check that release path is not broken or double-run.
- **Peer-crash handling.** If the RDD/GPU process crashes, `ActorDestroy` must
  drive a clean recovery (surface an error / recreate), not a use-after-free or a
  hang on a promise that will never resolve.
