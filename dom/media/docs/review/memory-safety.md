# Memory safety — dom/media review guidance

> Media input (containers, bitstreams, codec data) is **attacker-controlled** —
> treat every value derived from it as untrusted until validated.

## General Gecko memory-safety

A confirmed use-after-free / out-of-bounds / overflow is the highest-priority
class of finding. The subsections below group the recurring shapes by failure
mode; check every changed line against the ones that apply to it.

### Bounds, sizes & arithmetic

- **Integer overflow/underflow on sizes/counts/offsets.** Arithmetic that feeds an
  allocation, index, or pointer offset must be overflow-checked — use
  `CheckedInt<T>` rather than raw `+`/`*` on values that can come from input.
  Watch element-count × element-size (`a * b`) and `end - start` underflow. A
  fixed-point left-shift (`dim << 16`) is the same hazard: the accepted input
  range must **exclude** the boundary value that overflows the signed result — a
  guard rejecting only `> N` still admits `N`, and `N << 16` can wrap negative.
- **Checked arithmetic is the operation, not a wrapper on the result.**
  `CheckedInt`/`SafeMul` only helps if the multiply/add runs in the checked type;
  wrapping an already-computed native product is too late. Every `unwrap()` needs
  an `isOk`/`isSome` guard, and fixing one means sweeping its siblings.
- **A cast is not a bounds check.** Sign and range must be established before a
  value becomes a length or index — including at every narrowing conversion
  (`uint64_t` -> `uint32_t`/`int`, a 64->32 truncation of an OS-reported length).
  An "asserted" cast whose assertion compiles out is a bare `static_cast` in
  release. Clamp in the *wider* type — `std::min<Narrow>(a, narrowing_cast(b))`
  truncates before it compares. A value bounded only from above must also be
  proven `>= 0` at the conversion.
- **Out-of-bounds access.** Every index/length is validated against the actual
  buffer size *before* use. Check `memcpy`/`memmove`/`memset`/`memcmp` lengths,
  off-by-one (`<=` vs `<`), and `Span`/`nsTArray` views that must not exceed their
  backing store.
- **Unit consistency in bounds checks.** Both operands of a size comparison must be
  in the same unit — samples vs. bytes, elements vs. bytes, pixels vs. stride. A
  check that is "coincidentally correct" for a 1-byte format admits an overrun for
  a multi-byte one. A picture/crop sub-rect must be proven to fit its frame
  (`x + w <= frameW`), not merely each dimension against an absolute cap.
- **A count validated against a stream limit is not validated against your array.**
  A fixed-size array dimensioned by a format maximum must be indexed by a count
  checked against *that* extent (`<` vs `<=`), and every parallel array the index
  walks must be at least as long. For an inline array in an OS/third-party struct,
  check whether the API switches to a heap "extended" accessor past capacity.
- **When a size has more than one source, cross-check them.** An iteration extent
  and its backing store that come from *different* sources (two IPC replies; a
  metadata field vs. a producer-reported geometry) must be validated against each
  other wherever both are known — each being self-consistent is not enough. And
  where the same quantity is readable from two places but only one is
  authoritative (e.g. a per-sample IV size as both a track default and a
  sample-group value), reading the wrong one over-reads.
- **External sizes are untrusted.** A length an OS/COM read/stat API reports can
  over-report — clamp it against the buffer you actually allocated, and handle the
  empty-buffer case (`&arr[0]` at length 0). A shared-memory region is only sealed
  against resize once it has been frozen read-only, so an unfrozen mapping's size
  is not a standing guarantee: revalidate it in each consumer rather than caching
  it (see `ipc.md` for the trust-boundary framing).
- **A safety limit is only enforced where its initializer actually ran.** A global
  cap (max surface/texture size, a limit config) relied on for bounds enforcement
  is unset — hence effectively unbounded — in any process that skips the
  platform-init path that populates it. Confirm that init runs in every process
  performing the bounded operation, or the guard silently passes everything.

### Lifetime, ownership & refcounting

- **Use-after-free / dangling.** A pointer, reference, iterator, or `Span` must not
  outlive its backing buffer. Raw pointers that should be `RefPtr`/`WeakPtr`/
  `UniquePtr`; an object destroyed before a callback/runnable/lambda fires; a
  lambda capturing `this` or a raw ref that outlives the owner.
- **Ownership & refcounting.** `already_AddRefed` consumed exactly once; no
  over-/under-release; RAII rather than manual `new`/`delete`; no leak on an
  early-return/error path.
- **Releasing a self-reference destroys `this`.** Clearing the member that may hold
  the last strong reference makes every later member access and virtual call a
  UAF. Require it to be the final statement, or a local strong ref covering the
  rest.
- **An ownership transfer invalidates its source, including on failure.** An alias
  into a smart-pointer-owned object dangles once that owner is moved into a
  by-value sink, which destroys it on *every* return. A fallible take/steal is the
  same: the failure can be what emptied the source, so a fallback that re-reads it
  must re-validate.
- **A refcount-leak fix can unmask a use-after-free.** A removed redundant `AddRef`
  or added `Release` may have been the only thing keeping the object alive on some
  path — enumerate the paths that now free earlier.
- **Destroy-order & opaque-handle validity.** An owning resource (device, context,
  allocator) must outlive teardown of every child that dispatches through it. A
  `!= NULL_HANDLE` check does not prove an OS/driver handle still refers to a live
  object across a teardown boundary — only lifetime/ordering does.
- **Freeing a handle, slot, or id another consumer may still use is a
  confidentiality bug.** The allocator reissues the same number immediately, so a
  stale consumer reads a *different, valid* resource — possibly another origin's.
  Ask what the stale id now names, not whether it crashes.

### Cycle collection & registrations

- **Reference cycles & cycle collection.** For a class using
  `NS_IMPL_CYCLE_COLLECTION*`, every member that can join a cycle or holds an
  external registration — including `MozPromise` request/holder members — must
  appear in **both** `Traverse` **and** `Unlink`. A member in `Traverse` but
  missing from `Unlink` is a classic leak/UAF.
- **`Unlink` and the destructor must each be complete alone.** An object can hit
  refcount zero outside a cycle and never run `Unlink`, so cleanup living only
  there (or only in `Shutdown()`) is skipped. Conversely `Unlink` that unregisters
  from the GC holder map must null every reflector it stops tracing and clear the
  data driving lazy re-creation — the object may still be script-reachable.
- **Self-registration with a back-reference.** When an object registers *itself*
  into a longer-lived manager that holds it by strong `RefPtr`, and keeps a
  raw/weak back-pointer to a shorter-lived owner, confirm it is unregistered — or
  its back-pointer cancelled — on **every** path that drops *or replaces* that
  reference: destructor, every error/cancel/shutdown path, a reseat that swaps in
  a new owner, and CC `Unlink` — not only on a happy-path callback that may never
  fire.
- **Debug-only enforcement is no enforcement.** A destructor or assignment operator
  that only `MOZ_ASSERT`s the disconnect/revoke/unregister already happened leaves
  the registration live in shipping builds; `= default` on a class holding a
  registration token is the smell. A null check before dereferencing a
  back-pointer is worthless unless some teardown path clears it.

### Uninitialized, stale & disclosed memory

- **Uninitialized memory.** A field/member read before it is set; a struct passed
  to an OS/codec API without full initialization. A prepare/fill/convert helper
  with a fallback or early-out must not return success leaving its output buffer
  unwritten, and a row copy that writes `width` but advances by `stride` must zero
  the padding, or it leaks when the plane is read as packed data.
- **A recycled buffer is not a zeroed buffer.** Pool/free-list output holds the
  previous tenant's bytes, so every readable byte must be written or zeroed — a
  first allocation on fresh zero pages hides this until reuse. Likewise,
  normalizing a layout descriptor after a conversion must be backed by having
  written every byte it now declares valid.
- **A write that bypasses the constructor must re-establish its invariants.** A
  field set post-construction from an untrusted source must re-prove the class
  invariant against the real allocation, and every field derived from the old
  value must be recomputed or invalidated at the same site — a path that re-derives
  geometry from in-band parameter sets leaves a container-sourced picture/crop
  rectangle that can now exceed the frame. An accessor that short-circuits on
  "value unchanged" returns the stale derivative.
- **An over-read reaching a script-readable sink is information disclosure.**
  Decoded audio, frame pixels, canvas readback, shared textures and copy-out APIs
  are content-observable, so any declared-but-unproduced extent — over-read tail,
  unwritten padding, recycled contents — is exfiltrable heap. Size the exposure
  from what was actually produced; zero-fill or reject the rest.

### Where the check goes, and what counts as one

- **Put the check at the shared sink; the odd sibling out is the defect.** When
  branches (fast/slow, hardware/software, read-directly vs. derived) converge on
  one copy or allocation, move the validation into that chokepoint rather than the
  branch you happened to audit. Where parallel implementations of the same hook
  exist, diff them: the one missing a step its siblings perform is the finding.
- **Do not infer success from a proxy signal.** A non-null data pointer does not
  mean non-empty (empty containers return a shared static sentinel). A clean error
  state does not mean success when the callee opens its own nested error scope. A
  "has X" predicate whose `false` conflates "absent" with "malformed" sends the
  caller into a branch assuming a parsed object. Check the return value and length.

## dom/media specifics

- **`MediaData` family & buffers.** `MediaRawData`/`AudioData`/`VideoData`,
  `AlignedBuffer`, `MediaByteBuffer` — verify capacity vs. length and never read
  past the valid range; never mutate a buffer that is shared/immutable; and a
  buffer handed to another thread/TaskQueue must be kept alive for the whole
  hand-off (strong `RefPtr`), or it is a UAF when the producer releases it.
- **Bound a pixel/format-conversion copy by the mapped surface, not a logical
  size.** A CPU copy/convert helper must clamp its source read to the extent of
  the surface it actually mapped/locked, never to `Image::GetSize()` or a
  configured destination size — a zero-copy/GPU-backed image can legitimately map
  a surface smaller than its logical size.

## Parser / demuxer deep-dive

> This section can later be split into its own doc loaded only for high-risk
> parser directories (`dom/media/mp4/**`, `dom/media/webm/**`, platform demuxers).
> It is the densest source of media memory-safety bugs.

- **Box/atom/element sizes are hostile.** MP4 box sizes, EBML/WebM element sizes,
  Matroska lace counts, sample-table (`stsz`/`stco`/`stsc`) entry counts — never
  trust the declared size; validate it against the remaining bytes in the parent
  container before reading or allocating.
- **Bitstream reads.** NAL/OBU lengths, LEB128/Exp-Golomb reads, SEI payload
  sizes — every read must be bounds-checked against the reader's remaining length;
  a bit reader must refuse to read past its end rather than wrap.
- **A length trusted twice.** A length validated on read but then re-derived or
  re-cast before use (signed/unsigned, 64->32) is a common regression — verify the
  checked value is the one actually used.
- **Accumulated container values.** A value summed across boxes/fragments (e.g. a
  running fragment decode time) is accumulated in `CheckedInt` and the fragment
  rejected on overflow — never allowed to silently wrap.
- **Signedness of "unsigned" fields.** A field the spec declares unsigned can carry
  a two's-complement negative in practice (some encoders write pre-roll as
  `2^64 - N`); handle the intended signedness deliberately rather than trusting the
  raw unsigned value.
