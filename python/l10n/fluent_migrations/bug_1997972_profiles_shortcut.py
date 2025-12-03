# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1997972 - Add aria-label to profiles desktop shortcut toggle, part {index}."""
    source = "browser/browser/profiles.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
edit-profile-page-desktop-shortcut-toggle =
    .aria-label = {COPY_PATTERN(from_path, "edit-profile-page-desktop-shortcut-header")}
""",
            from_path=source,
        ),
    )
