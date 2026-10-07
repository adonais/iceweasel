# Rebuilding the intermediates of a fold-resplit

Fold-resplit (`SKILL.md`, Phase 3) discards the review history of every commit
whose leaf boundary moves, so it is reserved for a whole model that was
built-then-replaced. Plan the leaves first, then watch for two things that go
wrong while rebuilding them. The commands are in the mechanics reference for
your VCS, under "Fold-resplit".

## Plan the leaves from the final state

Plan from the final state's concerns, not the input commits' units; a boundary
between two of them that the input also drew is a candidate leaf boundary even
where the fold erased it. A leaf no input commit held is the tip minus the
leaves above it: restore its paths whole, take out what the later leaves add,
and let the leaf above be the plain restore. Text that describes the tree
(docs, comments) has to describe the tree at that depth; where an input commit
described the same state, reuse its words, read off that commit's version of
the file, since the file that held them may exist nowhere in the new series. A
mechanical reverse apply of the input commit's hunks is not an option there:
once the file has moved on, the hunks land at false matches and report
success.

## A prior split experiment is a blueprint, not a replay

A validated split branch **drifts** as its base advances (upstream lands,
commits sink or get rebased), so replaying it usually conflicts from the first
leaf. Characterize the drift first: a stable **symbol/member set** means the
design and the leaf boundaries still hold; a large **body diff** means the
content moved on. If the set is stable but the bodies drifted, take only the
leaf boundaries from the old branch and rebuild the leaves against the current
end-state; the final leaf is still free, the whole-tree restore of the
end-state.

## Delegate the grind, then verify it

A long, mechanical, many-intermediate build is worth handing to a subagent
under an explicit contract: the leaf plan, each commit's **full message**
(subject always, plus a body for the leaves that warrant one, since a subagent
writes only what you specify), the per-leaf validation gates, and the hard
invariant that the final tree equals the end-state.

Then **verify it independently**: re-check the tree invariant and spot-check
the hardest leaf yourself. Don't trust the report.

## Messages, trailers and bugs

A leaf whose concern equals one input commit's keeps that commit's message and
`Differential Revision` trailer, copied from that commit. A merged leaf gets
a new message and no trailer; harvest into it what the folded messages explain
that the diff cannot show, and give it the bug whose title names what the leaf
does; a bug none of the leaves fits is left with no commit. The revisions of
commits that no longer exist are abandoned on the re-push (`SKILL.md`,
Review-tool side), and a bug whose only commit was folded away is left with
none: report it with the bugs the user has to file or close.
