---
name: cl-description
description: Craft, improve, and properly format WebRTC and Chromium Change List (CL) descriptions and Git commit messages following project style guidelines.
---

# CL Description Skill

This skill guides generating, refining, and formatting high-quality Change List
(CL) descriptions and Git commit messages for WebRTC contributions.

CL descriptions serve as the permanent historical record for a change. A good
description must clearly explain the intent ("why") and implementation ("what"),
adhering to Chromium and WebRTC commit guidelines.

## Requirements and Style Guide

### 1. Title (Subject Line)

- **Imperative Mood:** Use the imperative mood (e.g., "Add ...", "Fix ...",
  "Simplify ...", "Refactor ..."). Do not use past tense ("Added") or third
  person ("Adds").
- **Length:** Aim for 50 characters or fewer to avoid Gerrit warnings; 72
  characters is the hard limit before truncation.
- **Capitalization:** Start with a capital letter (sentence case).
- **No Punctuation:** Do not end the title with a period.
- **Clarity:** Accurately summarize the primary change.

### 2. Body

- **Explain Why First:** Describe the problem, motivation, or architectural
  context before describing code changes. Explain *why* the change is needed.
- **Explain What Second:** Detail *what* was modified to achieve the goal,
  including design choices, trade-offs, and non-obvious details.
- **Line Wrapping:** Wrap lines to approximately 72 characters.
- **Formatting:** Separate paragraphs with a blank line. Use bullet points for
  multi-part changes or enumerated component modifications.
- **Omit Noise and Test Details:** Do not include testing information, test
  execution details, developer chatter, or hypothetical musings. Focus strictly
  on the intent and impact of the change.

### 3. Footers

- **Preceding Blank Line:** Always precede the footer block with a blank line.
- **Contiguous Block:** Do not place blank lines between footers (e.g., between
  `Bug:` and `Change-Id:`). Git and Gerrit trailer parsers require footers to
  form a single contiguous block.
- **Bug Footer (Mandatory):** Include a `Bug:` footer specifying the tracking
  issue (e.g., `Bug: webrtc:11993`, `Bug: chromium:123456`, `Bug: b/12345678`).
  If no issue exists, use `Bug: none`.
- **Change-Id:** Preserve existing `Change-Id:` footers when amending or
  updating an existing CL.
- **Do Not Overwrite:** Never erase existing CL descriptions or footers on
  already-uploaded Gerrit changes without explicit intent.

## Step-by-Step Workflow

1. **Analyze the Patch / Diff:**

   - Examine the diff against upstream (e.g., `git diff @{u}`).
   - Identify key modifications, affected subsystems, threading/ownership
     implications, and overall intent.
   - Summarize complex diffs concisely.

2. **Review Context & Existing Description:**

   - Read any existing commit message or bug report summary.
   - Note strengths, weaknesses, missing rationale, or poor formatting.
   - Paraphrase bug reports to describe the underlying problem rather than
     copy-pasting raw ticket text.

3. **Craft the Title:**

   - Write a concise summary in imperative mood, aiming for 50 characters or
     fewer (max 72).
   - Ensure it captures the core purpose of the patch.

4. **Develop the Body:**

   - Start with 1–2 sentences explaining the problem or rationale ("Why").
   - Follow with details of the approach ("What"), using bullet points if
     multiple files/components were modified.
   - Ensure hard-wrapping at approximately 72 characters.

5. **Format Footers:**

   - Add a blank line after the body.
   - Add `Bug: <issue-id>` (or `Bug: none`).
   - Retain `Change-Id:` if present.
   - Keep all footers in a contiguous block without blank lines.

6. **Review and Verify Compliance:**

   - Check title length (\<= 50 chars recommended, max 72) and imperative mood.
   - Check body line length (~72 chars) and paragraph spacing.
   - Verify exclusion of testing information, execution logs, and noise.
   - Ensure clear separation between title, body, and footers, and contiguous
     footer block.

7. **Apply / Output:**

   - Output formatted commit message, or apply to Git via:
     ```bash
     git commit --amend
     ```
   - For an active CL on Gerrit, update using `git cl description` or amend and
     upload.

## Example Format

```text
Simplify frame drop handling in VideoStreamEncoder

VideoStreamEncoder currently hops to the worker thread when notifying
registered frame drop observers. Because observer registration and
media pipeline reconfiguration now run directly on the encoder task
queue, hopping threads introduces unnecessary latency and complexity.

- Eliminate TaskQueue hop in VideoStreamEncoder::OnFrameDropped.
- Guard observer collection with encoder queue thread checker.
- Invoke SinkInterface::OnFrameDropped directly in encoder sequence.
- Remove obsolete PendingTaskSafetyFlag instance from encoder state.

Bug: webrtc:12345
Change-Id: I0123456789abcdef0123456789abcdef01234567
```
