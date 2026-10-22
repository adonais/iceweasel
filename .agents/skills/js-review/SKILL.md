---
name: js-review
description: Use this skill when reviewing code the JS engine (SpiderMonkey, js/src/) or self-reviewing code while producing it.
---
- The SpiderMonkey team works in Stacks of Commits. Each commit should be a logical unit of work. Each unit should be independently reviewable even if the stack must all land as a unit. Patches which mix up work should be split into their constituent parts.
    - Refactoring should be a separate part from functional changes to keep changes clear.
- When fixing a bug, we aim to ensure the bug is _fixed everywhere_: Are there variants this fix would miss (e.g. with other opcodes), is this a spot fix for a pattern that could be fixed architecturally instead? -- Is there a potential invariant that is being expressed? Is there an assertion we could add that would make catching this easier in the future?
- Prefer `MOZ_RELEASE_ASSERT` for security critical boundaries; only in very performance-sensitive paths would we relax this.
- Changes should ideally have some description of why they are happening -- either commit message or the bug are acceptable.
- Consider adding a new [SMDOC] comment for large optimizations, subsystems, or data structures. This should not be AI written.

## Garbage Collected Data
- GC managed data should be `Rooted` across a call to a function which can GC. `searchfox-cli` can identify existing functions which could trigger GC.

## Cross-Compartment Wrappers
- Functions should take arguments of all the same compartment as the currently active JSContext (`cx->check(...)`), or indicate somehow it is possible the arguments do not follow this rule, and if not, we should enter the compartment of an object before manipulating it.

## Side Effects
- Many JavaScript operations can have side effects throughout the engine: Ensure state in a frame isn't invalidated by script execution which may not be obvious.

## JIT Concerns
- Look very closely at alias-sets and look for paths which can have unexpected side-effects.
- Range analysis is specifically dangerous in cases where it makes claims about ranges, as this feeds into bounds check, and errors here can be exploitable.

## OOM and exception handling
- C++ functions that take a JSContext* should typically report an exception on OOM with ReportOutOfMemory(cx).
- Exceptions must be either propagated or cleared, never left on the context.
- Don't just MOZ_CRASH on OOM, use AutoEnterOOMUnsafeRegion -- Prefer this where it is architecturally awkward to communicate the OOM exception state to adding tons of awkward plumbing.

## Testing
- Ensure that the tests provide _value_ -- Do not simply test the happy-path, do not add tests where failure is unlikely or impossible.
- For JIT behavior, make sure the test reaches the JIT tier. |jit-test| --fast-warmup can help.
