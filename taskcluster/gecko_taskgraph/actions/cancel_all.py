# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


from taskgraph.actions.cancel_all import cancel_all_action

from .registry import register_callback_action

register_callback_action(
    title="Cancel All",
    name="cancel-all",
    symbol="cAll",
    description=(
        "Cancel all running and pending tasks created by the decision task "
        "this action task is associated with."
    ),
    order=400,
    context=[],
)(cancel_all_action)
