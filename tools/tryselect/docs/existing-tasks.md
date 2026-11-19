# Reusing Existing Tasks

The `fuzzy`, `chooser` and `release` selectors can reuse tasks from an earlier push instead of
running them again. Tasks like toolchains and docker images are already reused when their inputs
haven't changed, but this also allows reusing tasks that aren't, such as builds, or tasks whose
inputs your change modifies in a way that doesn't matter for what you're testing.

## Using Tasks From a Previous Push

`-E/--use-existing-tasks` reuses the tasks of a previous push:

```shell
# reuse the tasks of your most recent try push
./mach try fuzzy -E

# reuse the tasks of the try push with head revision <revision>
./mach try fuzzy -E rev=<revision>

# reuse the tasks of the latest push to <project>, e.g. mozilla-central
./mach try fuzzy -E project=<project>

# reuse the tasks of the push whose Decision task is <task id>, on any branch
./mach try fuzzy -E task-id=<task id>
```

This reads the `label-to-taskid.json` artifact of that push's Decision task and passes it as
the `existing_tasks` {doc}`parameter </taskcluster/parameters>`. Any task of your push with one
of those labels uses the earlier task instead of running again, whether or not that task
succeeded.

The tasks you select are never reused: they always run, and only their dependencies can be
reused.

If the builds are reused, most test tasks also run the tests packaged with those builds, so they
don't pick up changes to the tests or their harnesses
([bug 1878157](https://bugzilla.mozilla.org/show_bug.cgi?id=1878157)). Only tasks that run from a
source checkout see your changes.

## Filtering Reused Tasks

`--existing-tasks-include REGEX` only reuses the tasks from `-E` whose label matches `REGEX`, and
`--existing-tasks-exclude REGEX` never reuses the tasks whose label matches `REGEX`. Both can be
given several times, and labels excluded by one pattern aren't reused even if they match an
included one.

## Using Indexed Tasks

`--use-indexed-tasks LABEL=INDEX_PATH` replaces the task `LABEL` with the task at `INDEX_PATH` in
the Taskcluster index, e.g. the latest signed mozilla-central build. It can be given several
times, and takes precedence over `-E` for the same label.

## Dependencies

A task is only reused if every one of its dependencies is reused too, or optimized away. A task
whose dependency runs again also runs again, so that it doesn't use outputs from a different
revision than its dependency.

For example, toolchain tasks depend on the docker image they run in. If your change modifies
that image, the image is rebuilt, and the toolchain tasks run again even if they are in
`existing_tasks`.

As an example, a change to `resourcemonitor.py` rebuilds every docker image that includes
`run-task`, and so every fetch and toolchain task. To only rebuild the images the Linux tests run
in, reuse the other images along with the fetch and toolchain tasks:

```shell
./mach try fuzzy -E project=mozilla-central \
    --existing-tasks-include '^(docker-image|fetch|toolchain)-' \
    --existing-tasks-exclude '^docker-image-ubuntu2404-'
```
