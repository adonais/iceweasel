# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2049709 - Make visual updates to the create/edit profile page to match Nova specs, part {index}."""

    source = "browser/browser/profiles.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
edit-profile-page-desktop-shortcut-toggle-2 =
    .label = {COPY_PATTERN(from_path, "edit-profile-page-desktop-shortcut-toggle.aria-label")}
""",
            from_path=source,
        ),
    )
