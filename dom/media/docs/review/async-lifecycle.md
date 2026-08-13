# Async lifecycle (MozPromise & shutdown) — dom/media review guidance

> This covers the async-object lifetime idioms that are the most common source of
> media use-after-free and hangs.

## General patterns

- **A `MozPromise` is resolved OR rejected exactly once, on every path.** Check
  every early-return, error, and cancel path — a path that returns without
  settling the promise leaks/hangs the waiter; a path that can settle it twice is
  a bug.
- **`Then` runs on the intended thread.** The resolve/reject callback is dispatched
  to the queue/thread the code assumes, and it only touches state that is valid on
  that thread.
- **Request holders are tracked and disconnected.** A pending `->Then(...)` tracked
  by a `MozPromiseRequestHolder` (or a `MozPromiseHolder` on the producer side)
  must be `Disconnect()`/`DisconnectIfExists()`-ed during teardown, so a late
  resolution does not fire a callback into a destroyed object.
- **No raw `this` in a promise callback.** A `Then` callback (or lambda) that
  captures `this`/a raw pointer without holding a strong `RefPtr` is a
  use-after-free the moment it resolves after the owner is gone. Either hold a
  strong ref or disconnect the request on teardown.
- **Shutdown ordering.** Nothing is dispatched or started after `Shutdown()`;
  in-flight async work is completed or cancelled before the object tears down; a
  shutdown blocker is not satisfied until that teardown actually finishes.

## dom/media specifics

- **Promise-chained pipeline.** Decoders, demuxers, and the MDSM chain
  `MozPromise`s heavily (Init, Decode, Seek, Flush, Shutdown). A chain that can be
  abandoned mid-flight (seek/flush/error/shutdown) must disconnect its request
  holders so a stale resolution does not run against a reset or destroyed stage.
- **`MediaShutdownManager` / shutdown blockers.** The MDSM/decoder registers a
  shutdown blocker; confirm the blocker is only released after the async teardown
  (flushing queues, shutting down the decoder, releasing the task queue)
  completes — not on a happy-path callback that may not run.
- **Init vs Shutdown ordering.** A pending Init/Decode promise that resolves after
  a Shutdown has begun must be handled (disconnected or made a no-op), not allowed
  to touch torn-down state.
- **Error paths settle the promise.** On a decode/demux error, the corresponding
  promise is rejected (not dropped) so the state machine does not hang waiting.
- **One in-flight request per resource.** Do not issue a new request for a resource
  (e.g. `RequestVideoData`/`RequestAudioData` for a track) while a prior request for
  the same resource is still pending.
- **Resolve waiting/retry promises on every transition.** A "waiting for data"
  promise must be resolved on every transition to data-available (and any paired
  start-time state cleared with it); a missed resolution is a permanent stall, not
  just a delay.
