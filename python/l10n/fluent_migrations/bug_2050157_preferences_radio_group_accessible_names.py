# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2050157 - Add accessible names to preferences radio groups, part {index}."""

    source = "browser/browser/preferences/preferences.ftl"
    target = source
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
update-application-radio-group =
    .aria-label = {COPY_PATTERN(from_path, "update-application-installation.label")}

history-mode-radio-group =
    .aria-label = {COPY_PATTERN(from_path, "history-group.label")}

preferences-doh-radio-group =
    .aria-label = {COPY_PATTERN(from_path, "preferences-doh-group-message2")}

preferences-etp-level-radio-group =
    .aria-label = {COPY_PATTERN(from_path, "preferences-etp-status-header.label")}
""",
            from_path=source,
        ),
    )

    source = "browser/browser/aiFeatures.ftl"
    target = source
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
smart-window-model-radio-group =
    .aria-label = {COPY_PATTERN(from_path, "smart-window-model-section.label")}
""",
            from_path=source,
        ),
    )
