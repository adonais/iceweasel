# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2068721 - Re-order newtab settings in about:preferences, part {index}"""

    source = "browser/browser/newtab/newtab.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
home-prefs-manage-widgets-link =
    .label = {COPY_PATTERN(from_path, "newtab-widget-manage-widget-button.label")}
""",
            from_path=source,
        ),
    )
