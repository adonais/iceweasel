# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2035736 - [devtools] Make about:debugging UI consistent with the Nova style, part {index}."""

    path = "devtools/client/aboutdebugging.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
about-debugging-message-close-icon2 =
    .tooltiptext = {COPY_PATTERN(from_path, "about-debugging-message-close-icon.alt")}
""",
            from_path=path,
        ),
    )
