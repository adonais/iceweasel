# IPC & remote decoding — dom/media review guidance

> Posture: the process on the other end of an actor is untrusted — a
> less-privileged content/GPU process may be compromised, so the receiver
> validates everything.

## General actor correctness

- **Validate on the receiving side.** Every new/changed message validates its
  inputs where it is received (a parent treats child input as hostile; validate
  the reverse direction too where a less-trusted peer sends to a more-trusted
  one). Do not assume a size/index/handle from the peer is in range.
- **Peer-supplied identity is not just a value to range-check.** When a message
  scopes a security-sensitive resource (storage, key, origin id, capability)
  from an identity the peer supplied, validate it against what the sending
  process is entitled to represent, and lock any arbitrary-string arm to known
  sentinels. An actor that holds no reference to the sender's principal cannot do
  that validation at all — that absence is itself the finding.
- **Message flow / ordering.** Do not assume the peer sends messages in a
  particular order, or at all; handle missing and late messages. A *repeat* is a
  separate obligation: IPDL encodes no state machine, so where a message may
  legally arrive only once (a construct/init/attach for per-actor singleton
  state), the handler must reject the second arrival and fail the actor rather
  than tolerate it — an assertion is not a rejection. Cover the in-flight window,
  and do not tear down the live state being refused.
- **Actor lifetime.** No `Send*` after `ActorDestroy`/`__delete__`; managed actors
  are torn down in the correct order; no dangling reference to a destroyed actor;
  `ActorDestroy` cleans up cleanly (including when the peer crashed).
- **IPDL annotations.** `nested`/`compress`/`[Async]`/`[Sync]` and message
  direction/side are correct for how the message is actually used.
- **The abnormal-teardown handler must do everything the graceful one does.** Diff
  an `ActorDestroy`/channel-error handler against the explicit destroy handler
  statement by statement: promises rejected, back-pointers held elsewhere
  invalidated, the sub-object's destroy hook run, the destroyed guard set. Peer
  crash and OOM-kill make it attacker-reachable, not rare.
- **A callback registered over one channel guarantees nothing about objects owned
  by another.** A service requested over a channel independent of the one owning
  the object's lifetime can complete after that owner is gone. Cancel the pending
  operation, or invalidate its captured pointers, on the owning channel's
  teardown; "it completes quickly" is not a lifetime argument.
- **Guard on the pointer you dereference, not on a flag believed to imply it.** A
  shutdown/state boolean and a raw owner pointer are rarely updated atomically,
  and recovery paths leave the flag stale while the pointer is dead. Null-check
  the pointer in *every* handler that dereferences it; when sibling handlers share
  a precondition guard and one lacks it, that one is the defect.
- **Apply a hardening property at the creation choke point, not only the
  specialized variant.** When only the read-only/frozen path carries a guarantee,
  confirm the general path's omission is deliberate. Where the guarantee depends
  on an untrusted peer *not* making a mutating syscall, confirm the sandbox policy
  denies it — resource-management syscalls are often granted broadly.

## dom/media specifics

- **Remote decoding actors.** `RemoteMediaManagerChild`/`Parent` (formerly
  `RemoteDecoderManager*`) and the per-decoder `RemoteVideoDecoderChild`/
  `RemoteAudioDecoderChild` (under `PRemoteMediaManager`) run the decode in the RDD
  (or GPU/utility) process. Review new `Recv*`/`Send*` for input validation and
  correct actor thread affinity (the manager runs on its own thread — messages
  must be sent/received there).
- **Trust boundary on decoded output.** Frame descriptors, buffer sizes, strides,
  and `Shmem`/GPU handles coming back from the decoder process are untrusted —
  validate before mapping, indexing, or allocating against them, and re-check
  dimensions against the receiver's **own** configured/expected size, since a
  bound enforced only in the sending process is not an invariant here. (The
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
