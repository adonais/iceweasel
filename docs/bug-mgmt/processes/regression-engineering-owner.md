# Regression Engineering Owner (REO)

A Regression Engineering Owner (REO) watches over the regressions in the
components owned by their director's organization. An REO can be an engineer or
a manager.

The role is organized along the Mozilla Corporation engineering org chart:
"director" here means a MoCo engineering director, and the set of components an
REO covers is the set owned by the teams reporting to that director. The
director-to-components mapping is the one recorded in the
[REO rotation by director](https://docs.google.com/spreadsheets/d/1zpoWa7pTPkL_nz8jVMH4TyIX-pjFdljMcyOt8PYmQhA/edit?gid=1873841622#gid=1873841622)
sheet. Components that do not sit under a MoCo engineering director are not
covered by an REO; their regressions are handled by their
[Bugzilla triage owner](https://bugzilla.mozilla.org/page.cgi?id=triage_owners.html)
together with release management.

There is one REO per director. Each director nominates the REO for their
organization and decides how long the assignment lasts; the term is measured in
months rather than in releases, so the same person follows regressions across
several Firefox versions.

## Goal

The point of the role is to move some of the key responsibilities that release
management has been carrying onto the engineering organizations. Deciding what
happens to a regression - who fixes it, whether it is backed out, whether we
ship with it - belongs to the teams who own the code, because they are the ones
with the context to judge the risk and the impact.

Release management stays in the loop and remains accountable for the release
itself, but it should not be the one chasing engineers bug by bug. The REO is
the person inside the organization who does that work, so that regressions are
handled where the code lives.

## Time commitment

This is a real, recurring commitment, not a token one. It includes the weekly
regression triage meeting plus the time needed to go through Bugzilla, chase
owners, and follow up on the bugs that are not moving.

How much time that adds up to depends heavily on the components covered: a quiet
area may only need a couple of hours a week, while a large or churn-heavy
organization can take significantly more, with peaks around merge days and at
the beginning of a Beta cycle. Directors should plan for the load and adjust the
scope, or split it across several REOs, if it does not fit.

Being able to attend the [weekly regression triage
meeting](https://wiki.mozilla.org/Platform#Weekly_Regression_Triage_Meeting) is
a requirement of being an REO.

## Responsibilities

- Monitor the regressions filed in the components under their director's
  responsibility
- Monitor the bugs tracked for the releases in flight (`tracking-firefoxNN`
  and `status-firefoxNN` flags), and make sure each of them is moving:
  - push for the responsible team to fix it
  - back the offending changes out
  - ship with it
  - delay shipping
- Ping the engineering managers and the engineers who own the affected code when
  a regression is stalled, unassigned, or missing information
- Keep a picture of how the organization is doing with regressions in the
  current releases
- Propose tool and process changes to improve the quality, based on the patterns
  seen while triaging regressions
- Be a partner for release management's
  [Release Manager](https://wiki.mozilla.org/Release_Management/Release_owners)
- Pay close attention to the
  [release-drivers](https://groups.google.com/a/mozilla.org/g/release-drivers)
  mailing list
- Attend the [weekly regression triage
  meeting](https://wiki.mozilla.org/Platform#Weekly_Regression_Triage_Meeting)

## Tools

- [BugDash regression triage](https://bugdash.moz.tools/#tab.reo) to go through
  the regressions of a release
- [Release Health Dashboard](https://mozilla.github.io/releasehealth/) to follow
  the overall numbers
- [Triage owners per Bugzilla
  component](https://bugzilla.mozilla.org/page.cgi?id=triage_owners.html) to
  find who to ping

## Assignments

REOs are tracked internally on the
[REO rotation by director](https://docs.google.com/spreadsheets/d/1zpoWa7pTPkL_nz8jVMH4TyIX-pjFdljMcyOt8PYmQhA/edit?gid=1873841622#gid=1873841622)
sheet.

## Related documentation

- [How to Mark Regressions](regressions.md)
- [Regressions in GitHub-hosted code](../policies/regressions-github.md)
