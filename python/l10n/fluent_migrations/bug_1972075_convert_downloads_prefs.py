# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1972075 - Convert Downloads to config-based prefs, part {index}."""

    target = "browser/browser/preferences/preferences.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
downloads-header-2 =
    .label = {COPY_PATTERN(from_path, "download-header")}
download-save-where-2 =
    .label = {COPY_PATTERN(from_path, "download-save-where")}
    .accesskey = {COPY_PATTERN(from_path, "download-save-where.accesskey")}
""",
            from_path=target,
        ),
    )
