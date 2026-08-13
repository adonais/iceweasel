# Memory safety — dom/media review guidance

> Media input (containers, bitstreams, codec data) is **attacker-controlled** —
> treat every value derived from it as untrusted until validated.

## General Gecko memory-safety

A confirmed use-after-free / out-of-bounds / overflow is the highest-priority
class of finding. Check every changed line against these.

- **Integer overflow/underflow on sizes/counts/offsets.** Arithmetic that feeds an
  allocation, index, or pointer offset must be overflow-checked — use
  `CheckedInt<T>` rather than raw `+`/`*` on values that can come from input.
  Watch element-count × element-size (`a * b`), `end - start` underflow, and
  narrowing casts (`uint64_t` -> `uint32_t`/`int`).
- **Out-of-bounds access.** Every index/length is validated against the actual
  buffer size *before* use. Check `memcpy`/`memmove`/`memset`/`memcmp` lengths,
  off-by-one (`<=` vs `<`), and `Span`/`nsTArray` views that must not exceed their
  backing store.
- **Use-after-free / dangling.** A pointer, reference, iterator, or `Span` must not
  outlive its backing buffer. Raw pointers that should be `RefPtr`/`WeakPtr`/
  `UniquePtr`; an object destroyed before a callback/runnable/lambda fires; a
  lambda capturing `this` or a raw ref that outlives the owner.
- **Ownership & refcounting.** `already_AddRefed` consumed exactly once; no
  over-/under-release; RAII rather than manual `new`/`delete`; no leak on an
  early-return/error path.
- **Reference cycles & cycle collection.** For a class using
  `NS_IMPL_CYCLE_COLLECTION*`, every member that can join a cycle or holds an
  external registration — including `MozPromise` request/holder members — must
  appear in **both** `Traverse` **and** `Unlink`. A member in `Traverse` but
  missing from `Unlink` is a classic leak/UAF.
- **Self-registration with a back-reference.** When an object registers *itself*
  into a longer-lived manager that holds it by strong `RefPtr`, and keeps a
  raw/weak back-pointer to a shorter-lived owner, confirm it is unregistered on
  **every** teardown path — destructor, every error/cancel/shutdown path, and CC
  `Unlink` — not only on a happy-path callback that may never fire.
- **Uninitialized memory.** A field/member read before it is set; a struct passed
  to an OS/codec API without full initialization.

## dom/media specifics

- **`MediaData` family & buffers.** `MediaRawData`/`AudioData`/`VideoData`,
  `AlignedBuffer`, `MediaByteBuffer` — verify capacity vs. length and never read
  past the valid range; never mutate a buffer that is shared/immutable; and a
  buffer handed to another thread/TaskQueue must be kept alive for the whole
  hand-off (strong `RefPtr`), or it is a UAF when the producer releases it.

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
- **A size with more than one source.** When the same quantity is available from
  two places (e.g. a per-sample IV size as both a track default and a sample-group
  value), read it from the correct source — the wrong one over-reads.
