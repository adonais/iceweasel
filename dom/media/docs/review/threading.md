# Threading & concurrency — dom/media review guidance

> Posture is **adversarial about scheduling** — assume any other thread can run at
> the worst possible moment between two of your instructions. A confirmed data race
> or cross-thread use-after-free is the highest-priority class of finding.

## General Gecko threading

- **Right-thread assertions.** Operations run on the thread they require, and the
  code asserts it (`MOZ_ASSERT(NS_IsMainThread())` / `AssertIsOnMainThread()` /
  the object's own `AssertOnTaskQueue()`), accurately.
- **Prefer compile-time thread-safety annotations.** For lock-guarded state,
  Gecko's Clang thread-safety analysis catches misuse at build time: annotate the
  member `MOZ_GUARDED_BY(mMutex)` and functions `MOZ_REQUIRES(...)` /
  `MOZ_EXCLUDES(...)`. New shared state that relies only on a runtime assert (or
  nothing) where a static annotation would fit is worth flagging.
- **Shared state is synchronized.** Any field read on one thread and written on
  another is protected by a mutex/monitor or is atomic. A read/write pair with no
  synchronization is a **data race**.
- **Race / TOCTOU.** A value checked and then used after the lock is dropped; a
  "check-then-act" where the state can change in between; a non-atomic
  read-modify-write on shared state.
- **Re-entrancy.** A call that can re-enter the same object or lock — via a
  listener, observer, callback, or an event-loop/`SpinEventLoop` — and corrupt
  half-updated state or self-deadlock.
- **Lock discipline.** Lock acquisition order is consistent (no inversion ->
  deadlock); a lock is not held across a re-entrant call, a dispatch, or a
  blocking wait.
- **Dispatch correctness.** Runnables target the right queue/thread; captured
  state is kept alive and is safe to touch on the target thread; nothing is
  dispatched to (or run on) a thread/TaskQueue after it has been shut down.
- **`MozPromiseHolder<T>` is single-thread-only, and nothing tells you when you
  break that.** Its state is a plain non-atomic `RefPtr`: `Ensure()` may construct
  it and takes a reference, `Resolve`/`Reject` clear it, so touching one holder
  from two threads is a data race. Every accessor calls a `Check()` hook, and
  `MozPromiseHolder` defines it as a no-op — the misuse asserts nothing, even in
  debug. `Ensure()` on the current thread before arming any settle callback that
  can fire elsewhere; where a holder is genuinely cross-thread, use
  `MozMonitoredPromiseHolder`, whose `Check()` asserts monitor ownership.

## dom/media specifics

- **TaskQueue / `AbstractThread` model.** Most of the media pipeline runs off the
  main thread on TaskQueues (the decoder task queue, the MDSM task queue, the
  demuxer task queue). A method that must run on a specific queue should assert it
  (`AssertOnTaskQueue()` / `MOZ_ASSERT(OnTaskQueue())`), and members owned by one
  queue must not be touched from another without dispatching. For *compile-time*
  queue/thread affinity, dom/media uses `EventTargetCapability<T>` (a
  `MOZ_CAPABILITY`): annotate queue-affine members `MOZ_GUARDED_BY(mThread)` and
  methods `MOZ_REQUIRES(mThread)` (as in `AudioSinkWrapper` and
  `TrackBuffersManager`), so a cross-queue access fails to compile rather than
  only tripping a runtime assert. Prefer it for new queue-affine state.
- **MediaDecoderStateMachine.** State reads/writes and transitions happen on the
  MDSM's own queue; watch for logic that inspects or mutates MDSM state from a
  different thread, and for re-entrancy through watchers/mirrors.
- **Single-TaskQueue decoders.** Decoders are wrapped in `MediaDataDecoderProxy`,
  which enforces single-TaskQueue use — decoder calls must all stay on that one
  queue.
- **Real-time audio threads.** Work on the cubeb audio callback and on the
  `GraphRunner` (which drives the MediaTrackGraph) must be real-time-safe — no
  locks that can be held by other threads, no allocation, no blocking. Flag
  locking/allocation introduced on either path.
- **No blocking the main thread.** Synchronous waits on a media operation from the
  main thread (or main-thread I/O) are a finding.
