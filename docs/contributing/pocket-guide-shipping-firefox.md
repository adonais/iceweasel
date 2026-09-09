# Pocket Guide: Shipping Firefox

*Estimated read time:* 15min

## Introduction

The purpose of this document is to provide a high level understanding of
how Mozilla ships Firefox. With the intention of helping new Mozillians
(and those who would like a refresher) understand the basics of our
release process, tools, common terms, and mechanisms employed in
shipping Firefox to our users. Often this document will introduce a
concept, explain how it fits into the process, and then provide a link
to learn more if interested.

## Repositories & Channels

Shipping Firefox follows a software release {ref}`train model <train-model>`
along 3 primary code branches; firefox-main (aka “f-m” or “m-c”),
firefox-beta, and firefox-release. Each of these branches are updated within
a defined cadence and built into one of our Firefox products which are released
through what is commonly referred to as {ref}`Channels <channel>`:
Firefox Nightly, Firefox Beta, and Firefox Release.

[Firefox Nightly](https://whattrainisitnow.com/release/?version=nightly) offers access
to the latest feature work still under active development. Released every 12 hours with all
the changes that have {ref}`landed <landing>` on firefox-main for Desktop and Android.

Every [2 weeks](https://whattrainisitnow.com/calendar/), we {ref}`merge <merge>` the code
for Desktop and Android builds from firefox-main to the firefox-beta branch. New code or
features can be added to firefox-beta outside of this 2 week cadence but are required to land
on firefox-main before being {ref}`uplifted <uplift>` to firefox-beta.

[Firefox Beta](https://whattrainisitnow.com/release/?version=beta) is for developers and early
adopters who want to see and test what’s coming next in Firefox. We ship new Desktop and Android
Beta builds three times a week.

:::{note}
The first beta build of a new cycle is shipped to a subset of our Beta population.
:::

:::{note}
**Firefox Developer Edition** is a separate Desktop-only product based on
the firefox-beta branch and is specifically tailored for Web Developers.
:::

[Firefox Release](https://whattrainisitnow.com/release/?version=release) is updated every 2 weeks
when a given version reaches the end of its Beta cycle. This is the primary product we ship to end users.
While a release is live, interim updates (dot releases) are used to ship important bug fixes prior to
the next major release. These can happen on an as-needed basis when there is an important-enough
{ref}`driver <dot-release-drivers>` to do so (such as a critical bug severely impairing the usability
of the product for some users). In order to provide better predictability, there is also a planned
dot release scheduled for one week after the initial go-live for less-critical fixes and other
{ref}`ride-along fixes <ride-alongs>` deemed low-risk enough to include.

:::{note}
[Firefox ESR (Extended Support Release)](https://whattrainisitnow.com/release/?version=esr) is
a separate product intended for enterprise use. Major updates are rolled out once per year to maintain
stability and predictability. ESR also contains a number of enterprise policy options not available on
the standard Firefox Release channel. Minor updates are shipped in sync with the Firefox Release
schedule and generally only contain security and select quality fixes.
:::

Further Reading/Useful links:

- [Firefox Trains](https://whattrainisitnow.com/)
- [Release Calendar](https://whattrainisitnow.com/calendar/)
- [Firefox Release Process](https://wiki.mozilla.org/Release_Management/Release_Process)
- [Firefox Delivery dashboard](https://mozilla.github.io/delivery-dashboard/)

## Landing Code and Shipping Features

Mozillians (those employed by MoCo and the broader community) land lots of code in
the Mozilla repositories: fixes, enhancements, compatibility, new features, etc. which are
managed by git. All code development is tracked in
{ref}`Bugzilla <bugzilla>`, reviewed in {ref}`Phabricator <phabricator>`, and then checked
into the Firefox repository using {ref}`Lando <lando>`.

:::{note}
Some teams use separate {ref}`GitHub <github>` repositories during development but are
still required to use Phabricator (tracked in Bugzilla) to check their code into the
main Firefox git repository.
:::

The standard process for code to be delivered to our users is by ‘riding the trains’, meaning that
it’s landed in firefox-main to ship in Nightly builds while it waits for the next Beta cycle to
begin. After merging to Beta, the code stabilizes over a 2 week period (along with everything else
that merged from firefox-main from that development cycle). At the end of the Beta cycle, a
release candidate ({ref}`RC <rc>`) build is generated, tested thoroughly, and eventually is released
as the next major version of Firefox.

Further Reading/Useful links:

- [Phabricator and why we use it](https://wiki.mozilla.org/Phabricator)
- [Firefox Release Notes Process](https://wiki.mozilla.org/Release_Management/Release_Notes)
- [Firefox Release Notes Nomination](https://wiki.mozilla.org/Release_Management/Release_Notes_Nomination)

### An exception to this process

Not all code can simply wait for the normal train model to be included in a Firefox build.
There are a variety of reasons for this; critical fixes, security concerns, stabilizing a feature
that’s already in Beta, and so on.

In these situations, an uplift can be requested to take a recent landing in firefox-main and
merge specific bits to the Beta or Release repository outside the standard train model. After the
request is made, {ref}`Release Management <release-management>` will assess the potential risk and
make a decision on whether it will be accepted or not.

With Firefox shipping every two weeks, the next train is almost always close. As a
result, uplift criteria are applied strictly and most fixes should simply ride the next
release rather than being uplifted. Before requesting an uplift, ask two questions:

- Can it wait one cycle? The next major release is rarely more than two weeks out. If
  waiting is acceptable, ride the train.
- Can it be disabled instead of fixed? If the problem can be mitigated by turning a
  feature off via a pref or feature flag, that is preferred to uplifting a fix. This is
  lower-risk and often needs no uplift at all.

Uplifts are generally not the preferred way to ship new feature work. New or risky work
should be gated behind a pref / feature flag and ride the trains, not accelerated to
"catch" a release. Where a genuine business need exists, requests are handled case by
case, reach out to Release Management in the `#release-coordination` channel on Slack
or `@relman`.

Factors that will need to be taken into account include:

- Size and scope of patches to be uplifted
- Whether the change has baked on firefox-main and is verified
- QA availability to test prior to shipping and during development
- If the feature could instead be disabled or the reverting the regressor
- Engineering resources to resolve any conflicts between different development branches
- String additions/changes which may impact available locales

Further Reading/Useful links:

- [Patch uplifting rules](https://wiki.mozilla.org/Release_Management/Uplift_rules)
- [Requesting an uplift](https://wiki.mozilla.org/Release_Management/Requesting_an_Uplift)

### Ensuring build stability

Throughout the process of landing code in firefox-main to riding the trains to Firefox Release,
there are many milestones and quality checkpoints from a variety of teams. This process is designed
to ensure a quality and compelling product will be consistently delivered to our users with each new
version. See below for a detailed list of those milestones.

```{eval-rst}
===================================================== ================ ================= =======================================================================================
Milestone                                             Week             Day of Week
----------------------------------------------------- ---------------- ----------------- ---------------------------------------------------------------------------------------
QA Request & Feature technical documentation deadline Nightly W-1      Thursday          QA feature testing should be requested prior to the start of the Nightly cycle
Merge Day                                             Nightly W0       Thursday          Day 1 of the new Nightly Cycle
Feature Complete Milestone                            Nightly W1       Friday            Last day to land risky patches and/or enable new features
QA Test Plan approval due                             Nightly W1       Friday            Last day to provide QA with feature Test Plan sign-offs
Nightly features Go/No-Go decisions                   Nightly W2       Wednesday
String freeze                                         Nightly W2       Wednesday         Modification or deletion of strings exposed to the end-users is not allowed
Beta release notes draft                              Nightly W2       Thursday
Nightly QA sign-off.                                  Nightly W2       Wednesday
Merge Day                                             Nightly W2       Thursday          Day 1 of the new Beta cycle
User affecting changes identified & provided to SUMO  Beta W1          Thursday
Deadline for security-approval requests               Beta W2          Wednesday
Release note submission deadline                      Beta W2          Wednesday
What’s new page & release notes ready                 Beta W2          Thursday
Firefox Release Candidate build creation              Beta W2          Thursday          End of the current Beta cycle in preparation for the upcoming Firefox Release
Firefox go-live @ 6am PT                              Release W1       Tuesday           Day 1 of the new Firefox Release to 25% of Release users
Firefox Release bump to 100%                          Release W1       Thursday          Increase deployment of new Firefox Release to 100% of Release users
Scheduled dot release 1 approval requests due         Release W1       Friday            All requests required by EOD
Scheduled dot release 1 go-live                       Release W2       Tuesday           By default, ships when ready. Specific time available upon request.
===================================================== ================ ================= =======================================================================================
```

The Release Management team (aka “Relman”) monitors and enforces this process to protect the
stability of Firefox. Each member of Relman rotates through end-to-end ownership of a given
{ref}`release cycle <release-cycle>`. The Relman owner of a cycle will focus on the overall release,
blocker bugs, risks, backout rates, stability/crash reports, etc. Go here for a complete overview of
the [Relman Release Process Checklist](https://wiki.mozilla.org/Release_Management/Release_Process_Checklist_Documentation).

:::{note}
While Relman continually monitors the overall health of each release, it is the responsibility
of the engineering organization to ensure that the code they are landing is of high quality and the
potential risks are understood. Every release has an assigned {ref}`Regression Engineering
Owner <reo>` (REO) to ensure a decision is made about each regression reported in the release.
:::

Further Reading/Useful links:

- [Release Tracking Rules](https://wiki.mozilla.org/Release_Management/Tracking_rules)
- [Commonly used Bugzilla queries for all Channels](https://trainqueries.herokuapp.com/)

### Enabling/Disabling code (Prefs)

Within Firefox we allow the ability to enable/disable bits of code or entire features using
{ref}`Preferences <pocket-guide-preferences>`. There are many reasons why this is useful. For example:

- Continual development over multiple release cycles without exposing partially-completed
  features to our users
- Provide the ability to quickly disable a feature if there is a problem found during the
  release process
- Control features which are experimental or not ready to be shown to a specific channel
  population (e.g. enabled for Beta but disabled for Release)
- A/B testing via {ref}`telemetry <telemetry>` experiments

:::{note}
{ref}`Nimbus <nimbus>` Pref Rollout is a feature that allows Mozilla to change the state of a
preference for a targeted set of users, without deploying an update to Firefox. This is
especially useful when conducting experiments or a gradual rollout of high risk features
to our Release population.

A Pref Rollout can also be used to mitigate an incident, see [Incident Response Pref Flips](https://experimenter.info/desktop-incident-response) for details.
:::

Further Reading/Useful links:

- [Mozilla preferences documentation](https://firefox-source-docs.mozilla.org/modules/libpref/index.html)
- [Nimbus documentation](https://experimenter.info/)

### Release & Feature QA

The Desktop Test Engineering team is responsible for testing all critical browser areas,
core and new. Organized in two-week sprints its primary goals are:

- qualifying builds for release,
- new feature testing based on Jira request,
- smoke, functional, exploratory and other recurring testing activities conducted each release cycle,
- bug work (such as bug fix verification and investigation),
- various process improvement initiatives,
- and community engagement.

Features that can have significant impact and/or pose risk to the code base should be
nominated for QA support by the {ref}`feature owner <feature-owner>` in its intended
release by submitting a new request in Jira. This process is kicked off by filing a new
Jira ticket [here](https://mozilla-hub.atlassian.net/jira/software/c/projects/QA/boards/261)
(detailed steps in [How to file a QA
request](https://docs.google.com/document/d/1oz1YyaaBI-oHUDsktWA-dLtX7WzhYqs7C121yOPKo2w/edit?usp=sharing)).
These are due by Nightly W-1 (the Thursday before the start of the Nightly cycle in which the feature needs testing).

Further Reading/Useful links:

- [DTE team overview](https://mozilla-hub.atlassian.net/wiki/spaces/FDPDT/pages/10617155/Desktop+Test+Engineering)
- [DTE feature testing process](https://docs.google.com/document/d/1AIgAs78HWAPA3ROOdHzVW8fwRqfj8mog0sutaxp3Xfw/edit?usp=sharing)
- [How to file a QA request](https://docs.google.com/document/d/1oz1YyaaBI-oHUDsktWA-dLtX7WzhYqs7C121yOPKo2w/edit?usp=sharing)

### Experiments

As we deliver new features to our users, we continually ask ourselves about the potential impacts,
both positive and negative. For many new features, we will run an experiment to gather data around
these impacts. A simple definition of an experiment is a way to measure how a change to our product
affects how people use it.

An experiment has three parts:

1. A new feature that can be selectively enabled
2. A group of users to test the new feature
3. Telemetry to measure how people interact with the new feature

Experiments are managed by an in-house tool called [Experimenter](https://experimenter.services.mozilla.com/).

Further Reading/Useful links:

- [More about experiments and Experimenter](https://github.com/mozilla/experimenter)
- [Requesting a new Experiment](https://experimenter.services.mozilla.com/experiments/new/)
  (Follow the ‘help’ links to learn more)
- [Telemetry](https://wiki.mozilla.org/Telemetry)

### Train-Hop

Extensions in browser/extensions/ can run inside of Firefox as a “built-in addon”.
Unlike traditional WebExtensions, these add-ons ship with Firefox and run with the same privilege level as the rest of the browser code.

When a built-in add-on is packaged up as an XPI and deployed to Beta or Release clients, it is referred to as a “train-hop”.
A train-hop supplements the default Firefox train release model by allowing teams to ship code changes without requiring a dot release.

By default, the code for built-in add-ons rides the standard Firefox release train.
A train-hop only occurs when the extension is intentionally packaged and shipped off-train.

The extensions that currently support train-hops are New Tab and Web Compatibility.

Further Reading/Useful links:

- [Web Compatibility Release Process](https://wiki.mozilla.org/Compatibility/System_Addon/Release_Process#Shipping_interventions_with_an_out-of-band_System_Addon_Update)
- [Train-hopping for New Tab](https://firefox-source-docs.mozilla.org/browser/extensions/newtab/docs/v2-system-addon/train_hopping.html)

## Definitions

(approval-flag)=

**Approval Flag** - A flag that represents a security approval or uplift
request on a patch.

(bugzilla)=

**Bugzilla** - Web-based general purpose bug tracking system and testing
tool.

(channel)=

**Channel** - Development channels producing concurrent releases of
Firefox for Windows, Mac, Linux, and Android.

(chemspill)=

**Chemspill** - Short for Chemical Spill. A chemspill is a rapid
security-driven or critical stability dot release of our product.

(channel-meeting)=

**Channel Meeting** - A twice weekly time to check in on the status
of the active releases with the release team.

(dot-release-drivers)=

**Dot Release Drivers** - Issues/Fixes that are significant enough to
warrant a minor dot release to the Firefox Release Channel. Usually to
fix a stability (top-crash) or Security (Chemspill) issue.

(feature-owner)=

**Feature Owner** - The person who is ultimately responsible for
developing a high quality feature. This is typically an Engineering
Manager or Product Manager.

(github)=

**Github** - Web-based version control and collaboration platform for
software developers

(gtb)=

**GTB** - Acronym for Go to build. Mostly used in the release schedule
communication ("Go to build on March 18"), this means that we initiate the
building of a specific release.

(landing)=

**Landing** - A general term used for when code is merged into a
particular source code repository

(lando)=

**Lando** - Automated code lander for Mozilla. It is integrated with
our [Phabricator instance](https://phabricator.services.mozilla.com)
and can be used to land revisions to various repositories.

(merge)=

**Merge** - General term used to describe the process of integrating and
reconciling file changes within the mozilla repositories

(nimbus)=

**Nimbus** - Nimbus is a collection of servers, workflows, and
Firefox components that enables Mozilla to remotely control Firefox
clients in the wild based on precise criteria

(nucleus)=

**Nucleus** - Name of the internal application used by release managers
to prepare and publish release notes. The data in this application is
fetched by mozilla.org.

(orange-factor)=

**Orange** - Also called flaky or intermittent tests. Describes a state
when a test or a testsuite can intermittently fail.

(phabricator)=

**Phabricator** - Mozilla’s instance of the web-based software
development collaboration tool suite. Read more about [Phabricator as a
product](https://phacility.com/phabricator/).

(pocket-guide-preferences)=

**Preferences** - A preference is any value or defined behavior that can
be set (e.g. enabled or disabled). Preference changes via user interface
usually take effect immediately. The values are saved to the user’s
Firefox profile on disk (in prefs.js).

(rc)=

**Release Candidate** - Beta version with potential to be a final
product, which is ready to release unless significant bugs emerge.

(rc-week)=

**RC Week** - The week prior to release go-live is known as RC week.
During this week an RC is produced and tested.

(release-cycle)=

**Release Cycle** - The sum of stages of development and maturity for
the Firefox Release Product.

(reo)=

**Regression Engineering Owner** - A partner for release management
assigned to each release. They both keep a mental state of how we are
doing and ensure a decision is made about each regression reported in
the release. AKA *REO*.

(release-engineering)=

**Release engineering** - Team primarily responsible for maintaining
the build pipeline, the signature mechanisms, the update servers, etc. aka *releng*

(release-management)=

**Release Management** - Team primarily responsible for the process of
managing, planning, scheduling and controlling a software build through
different stages and environments. aka *relman*.

(relnotes)=

**Relnotes** - Short for release notes. Firefox Nightly, Beta, and Release each ship
with release notes.

(repository)=

**Repository** - a collection of stored data from existing databases
merged into one so that it may be shared, analyzed or updated throughout
an organization.

(ride-alongs)=

**Ride Alongs** - Bug fixes that are impacting release users but not
considered severe enough to ship without an identified dot release
driver.

(rollout)=

**Rollout** - Shipping a release to a percentage of the release population.

(status-flags)=

**Status Flags** - A flag that represents the status of the bug with
respect to a Firefox release.

(string-freeze)=

**String Freeze** - Period during which the introduction, modification, or
deletion of strings exposed to the end-users is not allowed so as to allow our
localizers to translate our product.

(taskcluster)=

**taskcluster** - Our execution framework to build, run tests on multiple
operating system, hardware and cloud providers.

(telemetry)=

**Telemetry** - Firefox measures and collects non-personal information,
such as performance, hardware, usage and customizations. This
information is used by Mozilla to improve Firefox.

(train-model)=

**Train model** - a form of software release schedule in which a number
of distinct series of versioned software releases are released as a
number of different "trains" on a regular schedule.

(tracking-flags)=

**Tracking Flags** - A Bugzilla flag that shows whether a bug is being investigated
for possible resolution in a Firefox release. Bugs marked tracking-Firefox XX are
bugs that must be resolved one way or another before a particular release ship.

(throttle-unthrottle)=

**Throttle/Unthrottle a rollout** - Throttle is restricting a release rollout to 0%
of the release population, users can still choose to update but are not updated
automatically. Unthrottle is removing the release rollout restriction.

(uplift)=

**Uplift** - the action of taking parts from a newer version of a
software system (firefox-main or firefox-beta) and porting them to an
older version of the same software (firefox-beta, firefox-release or ESR)
