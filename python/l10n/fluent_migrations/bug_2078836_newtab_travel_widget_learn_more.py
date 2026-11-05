# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2078836 - Add the travel widget strings, part {index}."""
    source = "browser/browser/newtab/newtab.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
newtab-travel-menu-learn-more = {COPY_PATTERN(from_path, "newtab-weather-menu-learn-more")}
""",
            from_path=source,
        ),
    )
