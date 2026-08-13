# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2051641 - Show remove checklist button after onboarding checklist is complete, part {index}."""

    path = "browser/browser/newtab/onboarding.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
onboarding-checklist-remove-2 = {COPY_PATTERN(from_path, "onboarding-checklist-remove.label")}
""",
            from_path=path,
        ),
    )
