---
name: recomp-frontend-review
description: Review reusable-component and design-system frontend changes in automated patch reviews or standalone Phabricator and local jj/Git reviews, using bundled domain checks.
---

# Recomp Frontend Review

## Choose the review mode

**Injected review:** An automated review system supplies this skill alongside a patch.
Injected review takes precedence over standalone review.
Do not load the standalone workflow in this mode.
Treat the supplied patch and metadata as the target.
Do not discover a checkout, select another diff, or reacquire the patch.
Apply the shared scope and domain decisions below.
Perform applicable checks directly with the available source tools.
Subagents, local artifacts, VCS commands, and runtime execution are not required.
Use the host system's response format, not the standalone Phabricator comment template.

**Standalone review:** Otherwise, for Phabricator revisions or local jj/Git changes, read [Standalone workflow](references/standalone-workflow.md) before acquiring the selected diff.
Resolve this reference against the installed skill directory, not the reviewed patch's version.
That procedure owns acquisition, early triage, frozen evidence, conceptual summary, domain delegation, consolidation, and the final comment.

## Load the required checks

Before substantive scoped checks, obtain the [Runsheet](references/runsheet.md).
In injected review, reuse separately supplied runsheet content when available.
When injected runsheet content is absent, use host-provided overview provenance to retrieve the runsheet from that same instruction source and version.
Use the host's supported retrieval capability for `.claude/skills/recomp-frontend-review/references/runsheet.md`.
If overview provenance or matching retrieval is unavailable, report the missing reference rather than mixing instruction versions or discovering a checkout.
Record instruction provenance separately from implementation evidence, which must remain at the reviewed version.
In standalone review, read the runsheet bundled with the installed skill, resolving its path against that skill directory.
Read every applicable domain section and the shared evidence requirements before evaluating checks.
Retrieve the complete runsheet when section retrieval is unavailable.
If retrieval cannot supply a required reference, identify missing evidence and unperformed checks in the review's follow-up section.
Use the host's follow-up format in injected review and Required Testing and Follow-up in standalone review.
Do not claim complete coverage or issue an unqualified clean verdict when required evidence is missing.

## Shared scope and domains

Normalize changed paths to repository-relative forward slashes and use this scope filter:

```text
/?(toolkit/content/(tests/)?widgets/|toolkit/themes/shared/design-tokens-.*.css$|toolkit/themes/shared/design-system/)
```

Build matched and excluded inventories across the selected diff and any explicitly selected range commits.
Disclose every excluded changed file as `out of filter scope`.
Inspect outside-scope dependencies and callers only to establish effects of scoped changes, not to review unrelated changes.

Determine applicable domains independently of whether review is direct or delegated:

1. Apply reusable-component checks to every patch with matched changes.
2. Also apply design-system checks when matched changes touch CSS, tokens, or design-system files.
3. Also apply design-system checks when component changes affect styling or token use.
4. Also apply design-system checks when explicitly requested and the patch contains scoped changes.

Document each domain decision and its assigned files.
For no matched changes, report `No scoped changes to review` and the excluded inventory.
Identify this as a scope determination, not patch approval, and state that no substantive domain checks ran.
For unsupported or backend-only changes outside the filter, report the limitation without a clean whole-patch verdict.
Do not launch empty subagents or replace domain checks with an accessibility checklist.

## Evidence required in either mode

Read complete deciding source at the reviewed version.
Inspect consumers when needed to establish compatibility or a claimed consequence.
Explain why additional consumer inspection is unnecessary when the complete change preserves the relevant contract.
Use the host's supported source-expansion capability when the needed source is absent.
An empty search-index result does not establish that a named file is unavailable.
Use checkout source only when its version agrees with the reviewed version.
Keep check results and deciding evidence under the runsheet's reporting contract.
Before reporting a defect, establish its contract violation or consumer consequence and evaluate an independent falsifier against deciding source.
A falsifier names an observation that would disprove the claim, not a restatement of it.
Keep consequences with missing deciding source, unrun falsifiers, and unsettled claims in follow-up, not inline defect comments or downgraded nits.
Distinguish source-supported behavior from supplied runtime evidence and unexecuted expectations.
Do not claim parallel review, complete coverage, or runtime verification without evidence.
