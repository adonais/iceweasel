# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Batching strategies that change the cadence performance tests run at on
autoland. Performance tasks are optimized through the perf-cadence-* aliases
(registered in gecko_taskgraph.optimize and assigned by the perf transforms),
which by default behave exactly like the strategies they wrap. The batching
strategies are currently only referenced by the shadow schedulers defined in
taskcluster/kinds/source-test/shadow-scheduler.yml, which override those
aliases to evaluate alternative cadences without affecting what production
schedules.
"""

import json
import logging
import os

from taskcluster.exceptions import TaskclusterRestFailure
from taskgraph.optimize.base import OptimizationStrategy
from taskgraph.util.taskcluster import find_task_id, get_artifact

logger = logging.getLogger(__name__)

# The optimization aliases through which performance tasks are optimized:
# raptor uses `perf-cadence-expanded` or `perf-cadence-backstop` depending on
# tier, mobile browsertime uses `perf-cadence-android`, mozperftest uses
# `perf-cadence-backstop` and talos/awsy use `perf-cadence-default`.
PERF_CADENCE_STRATEGIES = (
    "perf-cadence-android",
    "perf-cadence-backstop",
    "perf-cadence-default",
    "perf-cadence-expanded",
)

# Stateful strategies chain state through the shadow scheduler tasks
# themselves: each run loads the state artifact of the same shadow
# scheduler's last successful run through the Taskcluster index, and records
# an updated one for the next run to find.
STATE_INDEX = "gecko.v2.{project}.latest.source.shadow-scheduler-{state_name}"
STATE_ARTIFACT = "public/shadow-scheduler-state/state.json"
STATE_PATH_ENVVAR = "SHADOW_SCHEDULER_STATE_PATH"


def load_state(project, state_name):
    """Load the state recorded by the last successful run of the
    ``state_name`` shadow scheduler on ``project``, or None when no usable
    state exists (first run, expired, previous runs failed)."""
    index = STATE_INDEX.format(project=project, state_name=state_name)
    try:
        return get_artifact(find_task_id(index), STATE_ARTIFACT)
    except TaskclusterRestFailure:
        logger.warning(f"no previous state found via {index}")
        return None


def save_state(state):
    """Write ``state`` as JSON to the path named by the
    SHADOW_SCHEDULER_STATE_PATH environment variable, where the worker picks
    it up as an artifact. No-op when the variable is unset (local runs, try
    pushes)."""
    path = os.environ.get(STATE_PATH_ENVVAR)
    if not path:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(state, fh, indent=2, sort_keys=True)


class SkipUnlessTimeSinceLastBatch(OptimizationStrategy):
    """Always removes tasks unless at least ``hours`` have passed since the
    last batch recorded by a previous run of the same shadow scheduler.

    Tasks are kept when no previous state can be found (first run, state
    expired, broken chain); the recorded state marks this as a cold start so
    evaluation can discount it. The decision is computed and recorded once
    per push and reused for every task.

    Args:
        hours (float): Minimum time between batches.
        state_name (str): Name of the shadow scheduler task whose runs carry
            this strategy's state, as used in its index job-name.
    """

    def __init__(self, hours, state_name):
        self.hours = hours
        self.state_name = state_name
        self._decisions = {}

    @property
    def description(self):
        """Human-readable label shown in optimization log messages."""
        return f"skip-unless-{self.hours}h-since-last-batch"

    def should_remove_task(self, task, params, _):
        """Remove the task unless this push is a batch push. The batch
        decision is per-push, so it is computed once and cached for all the
        tasks of the same push."""
        pushlog_id = params["pushlog_id"]
        if pushlog_id not in self._decisions:
            self._decisions[pushlog_id] = self._batch_and_record(params)
        return not self._decisions[pushlog_id]

    def _batch_and_record(self, params):
        """Decide whether this push batches, and record the updated state
        for the strategy's next run to load."""
        state = load_state(params["project"], self.state_name) or {}
        last_batch = state.get("last_batch")
        pushdate = int(params["pushdate"])

        cold_start = last_batch is None
        batch = cold_start or pushdate - int(last_batch["pushdate"]) >= int(
            self.hours * 3600
        )
        if batch:
            last_batch = {
                "pushlog_id": params["pushlog_id"],
                "pushdate": pushdate,
                "head_rev": params["head_rev"],
            }

        save_state({
            "version": 1,
            "strategy": self.state_name,
            "batched": batch,
            "cold_start": cold_start,
            "pushlog_id": params["pushlog_id"],
            "pushdate": pushdate,
            "head_rev": params["head_rev"],
            "last_batch": last_batch,
        })
        return batch


def perf_batch_overrides(base_overrides, batch_strategy):
    """Build a strategy override dict that applies ``batch_strategy`` to all
    performance tasks while keeping the behavior of ``base_overrides`` for
    everything else.
    """
    overrides = dict(base_overrides)
    for name in PERF_CADENCE_STRATEGIES:
        overrides[name] = batch_strategy
    return overrides
