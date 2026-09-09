# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import logging

from .registry import register_callback_action
from .util import create_tasks, fetch_graph_and_labels

logger = logging.getLogger(__name__)

TASK_LABEL = "bhr-aggregate-cron"


@register_callback_action(
    title="BHR aggregation (custom date)",
    name="bhr-aggregate",
    symbol="bhr-custom",
    description=(
        "Run the Background Hang Reporter aggregation for a specific build date "
        "and/or sample size, rather than the daily cron's four-days-ago at 0.5. "
        "Used to backfill a historical day or re-run a day that failed."
    ),
    order=1000,
    context=[],
    # Its own permission rather than "generic": the task this creates carries
    # secrets:get on the production BigQuery credential, and the action task has
    # to hold that scope to grant it. Keeping it off action:generic means the
    # grant covers this action alone. Needs a matching role and hook in
    # fxci-config, as the cron itself did (bug 2056977).
    permission="bhr-aggregate",
    schema={
        "type": "object",
        "properties": {
            "date": {
                "type": "string",
                "pattern": "^[0-9]{8}$",
                "title": "Build date",
                "description": (
                    "Build date to aggregate, as YYYYMMDD. Leave empty to keep "
                    "the cron's behaviour of resolving the date at run time from "
                    "BHR_AGGREGATE_DATE_OFFSET_DAYS."
                ),
            },
            "sample_size": {
                "type": "number",
                "exclusiveMinimum": 0,
                "maximum": 1,
                "title": "Sample size",
                "description": (
                    "Fraction of pings to read, in (0, 1]. Leave empty to keep the "
                    "cron's production sampling. A small value is much cheaper and "
                    "is usually enough to check that a change behaves."
                ),
            },
        },
        "additionalProperties": False,
    },
    # The job reads production BigQuery with a stored credential granted only to
    # the level-3 mozilla-central cron, so it must not be reachable elsewhere.
    available=lambda parameters: parameters["project"] == "mozilla-central",
)
def bhr_aggregate_action(parameters, graph_config, input, task_group_id, task_id):
    decision_task_id, full_task_graph, label_to_taskid, _ = fetch_graph_and_labels(
        parameters, graph_config
    )

    if TASK_LABEL not in full_task_graph.tasks:
        raise Exception(f"{TASK_LABEL} was not found in the task-graph")

    date = input.get("date")
    sample_size = input.get("sample_size")

    def modifier(task):
        if task.label != TASK_LABEL:
            return task

        env = task.task["payload"]["env"]
        if date:
            # Pins the run to one build date. The script prefers this over
            # resolving an offset against the current time, so the task stays
            # reproducible however long after the fact it is triggered.
            env["BHR_AGGREGATE_DATE"] = date
        if sample_size is not None:
            env["BHR_AGGREGATE_SAMPLE_SIZE"] = str(sample_size)

        # Distinguish the one-off from the daily run on Treeherder.
        task.task["extra"]["treeherder"]["symbol"] += "-custom"
        return task

    logger.info(
        "Triggering %s with date=%s sample_size=%s",
        TASK_LABEL,
        date or "(cron default)",
        sample_size if sample_size is not None else "(cron default)",
    )
    create_tasks(
        graph_config,
        [TASK_LABEL],
        full_task_graph,
        label_to_taskid,
        parameters,
        decision_task_id,
        modifier=modifier,
    )
