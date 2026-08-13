# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2056382 - Migrate the browser shortcut description to Fluent, part {index}."""

    source = "browser/installer/custom.properties"
    target = "browser/browser/browser.ftl"
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
browser-shortcut-description = {COPY(from_path, "BRIEF_APP_DESC")}
""",
            from_path=source,
        ),
    )
