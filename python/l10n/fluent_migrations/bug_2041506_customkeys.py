# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2041506 - Migrate about:keyboard Fluent strings to attribute form, part {index}."""

    source = "browser/browser/customkeys.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
customkeys-key-clear =
    .aria-label = { COPY_PATTERN(from_path, "customkeys-clear") }
    .tooltiptext = { COPY_PATTERN(from_path, "customkeys-clear") }

customkeys-key-new =
    .label = { COPY_PATTERN(from_path, "customkeys-new-key") }

customkeys-category-navigation-2 =
    .heading = { COPY_PATTERN(from_path, "customkeys-category-navigation") }
""",
            from_path=source,
        ),
    )
