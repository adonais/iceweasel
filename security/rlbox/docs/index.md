# RLBox sandboxing

Firefox uses [RLBox](https://rlbox.dev/) to isolate several third-party
libraries. Each library is compiled to WebAssembly, translated back to C by
wasm2c, and linked into Gecko, so that a memory-safety bug in the library
cannot corrupt the rest of the process. The libraries sandboxed this way are
graphite, ogg, hunspell, expat, woff2 and soundtouch; the set is defined by
`--with-wasm-sandboxed-libraries` and defaults to all of them on little-endian
targets.

Builds that opt out, and big-endian targets, substitute the **noop sandbox**:
the library is linked in as ordinary native code and every RLBox operation
becomes a pass-through. Code that is correct under wasm sandboxing is not
automatically correct under the noop sandbox, and the rest of this page
describes the one pattern where that difference has repeatedly caused trouble.

## Callbacks into Gecko from sandboxed libraries

When a sandboxed library needs to call back into Gecko -- to read a file,
decompress a buffer, look up a font table -- the glue code registers a callback
with `sandbox.register_callback(...)` and hands the resulting pointer to the
library. There are two ways libraries accept such a pointer, and the difference
matters more than it looks. The library can hold it in **per-object state**
(graphite stores our table accessors in a `gr_face_ops` struct attached to each
face; expat stores handlers on each `XML_Parser`), or the library can expose a
**global setter** that parks the pointer in a file-scope variable
(`RegisterWOFF2Callback`, `RegisterHunspellCallbacks`). The first form is
inherently safe. The second form is a trap.

The trap is that the global setter is correct under wasm sandboxing and quietly
wrong without it. When the library is compiled to wasm and instantiated through
wasm2c, every sandbox instance gets its own copy of the library's data segment,
so a "global" in the library is really per-instance state -- that is precisely
why the pattern was adopted. Under the noop sandbox the library's globals are
one set of variables shared by every sandbox instance in the process. If two
instances can exist at once -- and they usually can, since expat and woff2 use
pools, graphite creates a sandbox per font entry, ogg per demuxer, soundtouch
per stream, and hunspell per loaded dictionary -- then every construction writes
the same shared globals.

Two distinct failure modes hide here, and it is worth keeping them separate when
auditing. The first is a plain **data race**: concurrent unsynchronized writes
to the same pointer variable. The second, much worse, is **cross-instance
leakage**: if the registered value were specific to one sandbox instance, the
last instance to register would silently redirect the other instances' callbacks
to its own state. The first is reportable by a thread sanitizer; the second is a
real bug that produces wrong behaviour or a boundary violation.

In practice Firefox has only ever hit the benign end of this, because of two
properties of the noop sandbox that are easy to miss when reading glue code.
First, `register_callback` under noop does not hand the library a pointer to
your function; it hands over `callback_trampoline<N, ...>`, a static template
instantiated on the **callback slot index**, not on the sandbox instance. Two
sandboxes that register the same callbacks in the same order land in the same
slots and produce identical pointers, so the shared global is overwritten with
the value it already held. Second, the trampoline recovers the live instance at
call time from thread-local state: `impl_invoke_with_func_ptr` sets
`thread_data.sandbox = this` on entry and restores the previous value on exit,
and the trampoline dispatches through `thread_data.sandbox->callbacks[N]`. The
callback therefore reaches the sandbox currently executing *on this thread*, not
whichever one registered last. That is the mechanism that saves us, and nothing
at the registration site says so.

Because that safety net is invisible and conditional, treat these as the
invariants to check whenever you see a library-side global setter:

- Every instance registers the **same callbacks in the same order**, so slot
  indices -- and therefore trampoline pointers -- coincide. Divergent
  registration between instances breaks the "writes the same value" property
  immediately.
- Registration and teardown are **serialized**, either by being main-thread-only
  or by explicit locking. Main-thread-only is the easiest thing to state and to
  check.
- Every call into the sandbox happens on the thread that will service the
  resulting callback, since instance recovery is thread-local.
- **Nothing instance-specific** is stored in a library global at registration
  time: no sandbox pointer, no handle, no per-instance context. The moment
  someone adds such a parameter to a `Register*` function, the pattern goes from
  benign to broken.
- The library registers no more than the 64 callbacks a sandbox provides
  (`MAX_CALLBACKS`).

For prevention, in order of preference: plumb callbacks through per-object
library state rather than a global setter, which removes the problem instead of
managing it. Failing that, if the noop configuration does not need the callback
at all, skip registration under `#ifdef MOZ_IN_WASM_SANDBOX` and call the host
function directly -- this is what `modules/woff2/RLBoxWOFF2Sandbox.cpp` does,
and its comment is a good model to copy. If the noop build genuinely needs the
callback, as hunspell does because those callbacks are the only way sandboxed
hunspell can read dictionary files, then registration cannot be elided:
document the invariants above at the registration site, and assert the threading
requirement on the Gecko side where XPCOM is available.

One last structural point, because it explains why such defects survive for
years. Every little-endian target enables wasm sandboxing for all six libraries
by default, so the noop path is exercised only on big-endian builds and by
developers passing `--without-wasm-sandboxed-libraries`. The dangerous
configuration is the one with no CI coverage. Do not rely on tests to find these;
read the `Register*` functions directly. For empirical confirmation, build with
sandboxing disabled and run the relevant tests under a thread sanitizer, which is
the only setup where the race becomes visible.

## Auditing this quickly

Search for `invoke_sandbox_function` calls whose target name begins with
`Register`, then for each one open the library-side definition and ask two
questions: does it write a file-scope variable, and can two instances of this
sandbox coexist? That pair of questions is the whole audit. As of this writing it
takes the six sandboxed libraries down to two candidates -- woff2, which guards
the write, and hunspell, which does not but is protected by the main-thread
restriction described above.
