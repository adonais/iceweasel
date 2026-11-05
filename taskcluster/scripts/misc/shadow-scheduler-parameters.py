# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Write the parameters a decision task ran with to a file, with the target tasks
method replaced, so that `mach taskgraph optimized -p <file>` re-runs its
scheduling over a different set of targeted tasks.
"""

import argparse
import sys

# Sets the production Taskcluster root URL used when TASKCLUSTER_ROOT_URL
# isn't set, like `mach taskgraph` does.
import gecko_taskgraph  # noqa: F401
import yaml
from taskgraph.util.taskcluster import get_artifact


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--decision-task-id",
        required=True,
        help="Decision task whose parameters are used as the base.",
    )
    parser.add_argument(
        "--target-tasks-method",
        required=True,
        help="Value of the target_tasks_method parameter to write.",
    )
    parser.add_argument("output", help="Path of the parameters file to write.")
    args = parser.parse_args(argv)

    parameters = get_artifact(args.decision_task_id, "public/parameters.yml")
    parameters["target_tasks_method"] = args.target_tasks_method
    with open(args.output, "w") as fh:
        yaml.safe_dump(parameters, fh, allow_unicode=True, default_flow_style=False)


if __name__ == "__main__":
    main(sys.argv[1:])
