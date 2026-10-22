# Triaging without the CLIs: the Treeherder REST API

`treeherder-cli` and `profiler-cli` are convenience wrappers, not prerequisites. When one
is missing, everything step 1 through step 3 needs is available from the Treeherder REST
API, which returns plain JSON and needs no auth for reads. Do not use `WebFetch` for this:
it is the `treeherder.mozilla.org` *UI* URLs that return an empty shell, and the `/api/`
paths below are what the UI itself calls.

Offer to install the CLI as well — `npm install -g @firefox-devtools/profiler-cli@latest`
for the profiler one — but do not block the triage on it.

## Quoting

Every URL here carries a query string, so it has to be quoted or the shell treats `?` as a
glob and `&` as a background operator. Quote with **single quotes, immediately after
`curl -s`**:

```
curl -s 'https://treeherder.mozilla.org/api/performance/alertsummary/?id=<ALERT_ID>'
```

The skill's `allowed-tools` entry is the prefix `Bash(curl -s
'https://treeherder.mozilla.org/api/:*)`. That prefix includes the opening quote, so
double quotes or a rearranged command do not match it and each read prompts for permission.

## The alert summary

This is the one request worth making first. It carries, in one payload, most of what step 1
asks you to scrape out of the bug:

```
curl -s 'https://treeherder.mozilla.org/api/performance/alertsummary/?id=<ALERT_ID>'
```

The summary object gives `revision` and `prev_push_revision` (the alert's new and base
revisions — the same pair as PerfCompare's `newRev`/`baseRev`), `push_id` and
`prev_push_id`, `repository`, `framework`, `bug_number`, `status`, and `assignee_email`.

Each entry in its `alerts` array gives `amount_pct`, `amount_abs`, `prev_value`,
`new_value`, `is_regression`, `t_value`, `noise_profile`, the Before/After profile links as
`prev_profile_url` and `profile_url`, and `taskcluster_metadata.task_id` for the job that
produced it. Its `series_signature` names the test: `suite`, `test`, `machine_platform`,
`extra_options`, `lower_is_better`, and `measurement_unit`.

`lower_is_better` is worth reading rather than assuming. Combined with the sign of
`amount_pct` it is what tells you whether an alert is a regression or an improvement, and
`is_regression` already encodes that conclusion.

### Two filters that are silently ignored

**`?revision=` and `?push_id=` do nothing on this endpoint.** They are not rejected: the
response is the complete unfiltered set — over 6200 summaries — and the `next` link even
echoes the parameter back, so a caller that trusts them reads whichever summary happens to
be first and gets a plausible-looking wrong answer.

Filter by `?id=<ALERT_ID>` instead, which is honored. There is no
`/alertsummary/<id>/` detail route; it returns 404. If all you have is a revision, go
through the push endpoint below and match `push_id` yourself, paging with `?page=N`.

`?framework=<N>` and `?status=<N>` are honored too. `?repository=` wants the numeric
repository id, not a name, and answers a bare name with `{"repository":["Enter a
number."]}`. Framework ids: 1 talos, 4 awsy, 6 platform_microbench, 11 js-bench,
12 devtools, 13 browsertime, 15 mozperftest.

### Checking whether a filter took effect

Two habits catch this class of bug generally:

- Compare the `count` against the same request with the filter removed. Equal counts mean
  the filter was dropped.
- Prefer endpoints that echo what they applied. The push endpoint below returns
  `meta.filter_params`, so you can see the filter was understood; `alertsummary` returns
  bare DRF pagination and tells you nothing.

## The culprit push

Step 1 needs the list of patches in the culprit push. This replaces
`treeherder-cli <rev> --repo autoland` and is better than reading the pushlog HTML:

```
curl -s 'https://treeherder.mozilla.org/api/project/autoland/push/?revision=<CULPRIT_REV>'
```

`results[0].revisions` is the patch list, each entry with `revision`, `author`, and
`comments` whose first line is the commit subject — enough to spot which patch is the
user's and which other candidates share the push. `results[0].id` is the `push_id` that
matches the alert summary's. `?id=<PUSH_ID>` is honored here as well, and both echo into
`meta.filter_params`.

Swap `autoland` for `try` to inspect a try push, or `mozilla-central` for a
merged revision.

## Job state for a push

This replaces `treeherder-cli <try-revision> --perf` when checking on a confirmation or
verification push. Resolve the try revision to a push id with the push endpoint above,
using `try` as the repository, then list its jobs:

```
curl -s 'https://treeherder.mozilla.org/api/project/try/jobs/?push_id=<PUSH_ID>&count=2000'
```

**Always pass `count`.** The default page is 10 jobs, and `meta` carries only `offset` and
`count`, never a total, so a truncated list looks complete. 2000 is the cap; page past it
with `&offset=N`. Unknown filters are silently ignored here as well, and unlike the push
endpoint `meta` does not echo them.

Each entry in `results` gives `job_type_name` (the full task label), `job_type_symbol`,
`job_group_symbol`, `platform`, `state` (`unscheduled`, `pending`, `running`,
`completed`), `result` (`success`, `testfailed`, `busted`, `exception`, `retry`,
`usercancel`, or `unknown` until the job completes), and `task_id`. Filter on
`job_type_name` for the perf tasks, and count `state == "completed"` against the total to
see how far the retriggers have got.

The numbers themselves are not in this payload. Compare them in the PerfCompare link that
`mach try perf` printed.

## Profiles

The Before/After profile links from `profile_url` and `prev_profile_url` are the same ones
the bug's alert table links. Hand them to the **profiler-analysis** skill, which owns
profiler-cli. That skill is the fallback path's limit: analyzing a profile genuinely wants
profiler-cli, so if it is not installed, say so rather than downloading a profile into
context.
