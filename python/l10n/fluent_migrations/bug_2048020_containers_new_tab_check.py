# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2048020 - Containers: remove description in the about:preferences#containers for the '+' policy, part {index}."""

    source = "browser/browser/preferences/preferences.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
containers-new-tab-check3 =
    .label = { COPY_PATTERN(from_path, "containers-new-tab-check2.label") }
    .accesskey = { COPY_PATTERN(from_path, "containers-new-tab-check2.accesskey") }
""",
            from_path=source,
        ),
    )
