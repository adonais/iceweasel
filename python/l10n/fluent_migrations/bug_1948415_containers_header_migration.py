# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1948415 - Migrate containers-header to containers-section-header with .heading attribute, part {index}"""
    source = "browser/browser/preferences/preferences.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
containers-section-header =
    .heading = {COPY_PATTERN(from_path, "containers-header")}
""",
            from_path=source,
        ),
    )
