% taskcluster_index:

(taskcluster-task-graph-generation)=

# Firefox CI and Taskgraph

Firefox's [continuous integration] (CI) system is made up of three parts.

First there's [Taskcluster], a task execution framework developed by Mozilla.
Taskcluster is capable of building complex, scalable and highly customizable CI
systems. Taskcluster is more like a set of building blocks that can be used to
create CI systems, rather than a fully-fledged CI system itself.

The second part is the [Firefox CI] instance of Taskcluster. This is the
Taskcluster deployment responsible for running most of Mozilla's CI needs. This
component is comprised of a Kubernetes cluster to run the Taskcluster services
(maintained by SRE Services), some customizations to support Taskcluster
on `hg.mozilla.org` and access control in the [fxci-config] repo
(maintained by Release Engineering).

The third part is [Taskgraph]. Taskgraph is a Python library that can generate
a [DAG] of tasks and submit them to a Taskcluster instance. This is the
component that most Gecko and Mozilla developers will interact with when
working with tasks, and will be the focal point of the rest of this
documentation.

:::{note}
Historically Taskgraph started out inside `mozilla-central`. It was then
forked to standalone [Taskgraph] in order to support projects on Github.
Over time maintaining two forks grew cumbersome so they are in the process
of being merged back together.

Today the version of Taskgraph under `taskcluster/gecko_taskgraph` depends
on the upstream version, which is installed as part of
`taskcluster/requirements.txt`. There is still a lot of duplication
between these places, but `gecko_taskgraph` is slowly being re-written to
consume upstream Taskgraph.
:::

The `taskcluster` directory contains all the files needed to define the graph
of tasks that must be executed to build and test the Gecko tree. This is more
complex than you think! There are 30,000+ tasks and counting in Gecko's CI
graphs.

Taskgraph supports:

- A huge array of tasks
- Different behavior for different repositories
- "Try" pushes, with special means to select a subset of the graph for execution
- Optimization -- skipping tasks that have already been performed
- Extremely flexible generation of a variety of tasks using an approach of
  incrementally transforming job descriptions into task definitions.

The most comprehensive resource on Taskgraph is [Taskgraph's documentation]. These docs
will refer there when appropriate and expand on topics specific to `gecko_taskgraph`
where necessary.

If you are reading this with a particular goal in mind and would rather avoid
becoming a task-graph expert, check out the {doc}`how-to section <howto/index>`.

```{toctree}
taskgraph
howto/index
transforms/index
optimization/index
cron
try
release-promotion
versioncontrol
config
reference
```

[continuous integration]: https://en.wikipedia.org/wiki/Continuous_integration
[dag]: https://en.wikipedia.org/wiki/Directed_acyclic_graph
[firefox ci]: https://firefox-ci-tc.services.mozilla.com/
[fxci-config]: https://github.com/mozilla-releng/fxci-config
[taskcluster]: https://taskcluster.net/
[taskgraph]: https://github.com/taskcluster/taskgraph
[taskgraph's documentation]: https://taskcluster-taskgraph.readthedocs.io/en/latest/
