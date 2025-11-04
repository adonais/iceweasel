# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1971439 - Migrate string for updated cookies and site data preferences section, part {index}."""
    source = "browser/browser/preferences/preferences.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
sitedata-delete-on-close-private-browsing3 =
    .message = {COPY_PATTERN(from_path, "sitedata-delete-on-close-private-browsing2")}
""",
            from_path=source,
        ),
    )
