# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2066334 - Sort newtab widget lists alphabetically, part {index}."""
    source = "browser/browser/newtab/newtab.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
newtab-custom-widget-crossword-toggle =
    .label = {COPY_PATTERN(from_path, "home-prefs-crossword-widget-header.label")}
""",
            from_path=source,
        ),
    )
