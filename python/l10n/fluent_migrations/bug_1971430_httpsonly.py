# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1971430 - Migrate string for https only preferences section, part {index}."""
    source = "browser/browser/preferences/preferences.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
httpsonly-label =
    .aria-label = { httpsonly-header }
    .description = {COPY_PATTERN(from_path, "httpsonly-description3")}
""",
            from_path=source,
        ),
    )
