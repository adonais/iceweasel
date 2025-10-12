# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1987191 - Add label variants for focus timer play/pause buttons, part {index}"""

    source = "browser/browser/newtab/newtab.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
newtab-widget-timer-label-play =
    .label = { COPY_PATTERN(from_path, "newtab-widget-timer-play.title") }

newtab-widget-timer-label-pause =
    .label = { COPY_PATTERN(from_path, "newtab-widget-timer-pause.title") }
""",
            from_path=source,
        ),
    )
