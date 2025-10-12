# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1971434 - Migrate string for updated additional protections preferences section, part {index}."""
    source = "browser/browser/preferences/preferences.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
do-not-track-removal2 =
    .label = {COPY_PATTERN(from_path, "do-not-track-removal")}
""",
            from_path=source,
        ),
    )
