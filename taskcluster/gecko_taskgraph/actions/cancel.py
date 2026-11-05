# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


from taskgraph.actions.cancel import cancel_action

from .registry import register_callback_action

register_callback_action(
    title="Cancel Task",
    name="cancel",
    symbol="cx",
    description=("Cancel the given task"),
    order=350,
    context=[{}],
)(cancel_action)
