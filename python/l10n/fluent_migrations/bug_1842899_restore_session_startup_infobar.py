# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1842899 - Move the session restore startup infobar into the messaging system, part {index}."""

    source = "browser/browser/browser.ftl"
    target = "browser/browser/newtab/asrouter.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
restore-session-startup-suggestion-message = {COPY_PATTERN(from_path, "restore-session-startup-suggestion-message")}
restore-session-startup-suggestion-button = {COPY_PATTERN(from_path, "restore-session-startup-suggestion-button")}
""",
            from_path=source,
        ),
    )
