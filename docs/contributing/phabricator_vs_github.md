# Phabricator vs GitHub

Firefox uses git for version control, and the source code is hosted on [GitHub](https://github.com/mozilla-firefox/firefox/). However, reviewing code happens on [Phabricator](https://phabricator.services.mozilla.com/) and landing code happens with an integration from [Lando](https://lando.moz.tools/). Phabricator is a different review and development workflow from GitHub. In GitHub your local git branch is reflected as a Pull Request based off of the commits that are different from some base commit, usually `main`. In contrast Phabricator works off of arbitrary patches (called diffs internally) that can be turned into {ref}`stacks of patches <Working with stack of patches Quick Reference>` using parent/child relationships. [`moz-phab`](https://github.com/mozilla-conduit/review) is the tool that Mozilla has built to make it easy to turn your local commits into these series of patches.

## GitHub Workflow

When working on a feature using the GitHub workflow, you create a feature branch locally, commit freely, merge freely, and then push it up to your PR. You can also use a rebase to rewrite your history, although this is less common, and GitHub can easily lose your review comments if you force push. If you receive review feedback, you can easily add more commits to the branch until it's ready to go. At the end of a PR, a common workflow is to squash the PR into a single commit referencing the PR number and merge it into main. This makes it easy to have a clean project history via `git blame`.

## Phabricator Workflow

When working on a feature using the Phabricator workflow, you create a feature branch locally, commit very carefully, and amend existing commits when you want to change things or apply review feedback. If you need to update your branch based off of main, then you do history rewriting actions such as `git rebase` or `git cherry-pick`. For new contributors you will work only in that single commit to start, and after figuring out the tooling you can create stacks of patches that are well-ordered and logical. Each patch can contain a chunk of reviewable work that is self contained and relatively small. `moz-phab` handles the particulars of mapping your local work to the work in Phabricator. Once your work is ready to land, you click on the `View Stack In Lando` button, and all of the commits get cleanly applied to `autoland` and eventually get applied to `main` if there are no issues.

## Where Things Go Wrong

Phabricator is not an industry standard tool, and has surprising footguns. It's easy for remote patches to drift compared to local ones, especially when collaborating with others. Some common error scenarios are:

* Basing a branch off of the wrong tree like `autoland`.
* Local commits getting reordered compared to remote patches.
* Pushing commits that are based off of local-only patches.

The command `moz-phab patch D123456 --apply-to main` can help, but it sometimes still doesn't apply cleanly. Here is why this happens.

### How Phabricator Tracks Patches

Git is built on a [Merkle tree](https://en.wikipedia.org/wiki/Merkle_tree)-like structure, where each commit is identified by a hash that depends on the commit before it. This means a commit's identity is tied to its entire history, so changing an earlier commit forces every commit after it to be recomputed, building an entirely new chain of commits.

Since the Phabricator workflow assumes you will be rewriting history, it's difficult to have stable references to work, since the hash will change at any history rewrite. To solve this problem, git has the concept of commit trailers where you can add metadata. Phabricator uses one to hold this stable identifier: `Differential Revision: https://phabricator.services.mozilla.com/D123456`. It's the full URL to your review. That review is only for a single patch.

### How Phabricator Creates Stacks

Stacks are created through internal relationships only tracked through the web interface. In the sidebar you can manually adjust these when the relationships get messed up. You click `"Edit Related Revisions..."` and then `Edit Parent Revisions...` or `Edit Child Revisions...`. This process is tedious and error prone, so `moz-phab` can help automate it. Take your clean local work and run `moz-phab reorg` to have the tool do the fiddly work for you. It can still be necessary to reorder work when things get too messy. For the exact commands to build and manipulate a stack, see the {ref}`Working with stack of patches Quick Reference`.

### autoland vs main

Autoland is where work lands. Sometimes it's hard to land work in the same area when there is a tight deadline as many people are touching the same code. In this case you can rebase your patches on top of `autoland`. However if you do this, it's easy to forget and have surprising behavior. `autoland` is the integration branch where work gets quickly added, then CI is run to vet the work, and finally it gets merged into `main`. If you happen to be sharing work with others, or pushing remote work that is on `autoland` it can be confusing.

### Commits disappearing on a rebase

When work gets backed out for an issue, it gets undone with a new commit (for example, via `git revert`). If you try to rebase your commits through this, commits can be dropped. A better workflow can be to `cherry-pick` your commits on top of main. This helps on a codebase that can change as quickly as Firefox.
