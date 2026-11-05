# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate import COPY, REPLACE
from fluent.migrate.helpers import VARIABLE_REFERENCE, transforms_from


def migrate(ctx):
    """Bug 2080727 - Migrate customizableWidgets.properties to Fluent, part {index}."""

    source = "browser/chrome/browser/customizableui/customizableWidgets.properties"
    target = "browser/browser/browser.ftl"

    def replace_shortcut(key):
        return REPLACE(source, key, {"%1$S": VARIABLE_REFERENCE("shortcut")})

    def shortcut_button(message_id, label_key, tooltip_key):
        return FTL.Message(
            id=FTL.Identifier(message_id),
            attributes=[
                FTL.Attribute(
                    id=FTL.Identifier("label"),
                    value=COPY(source, label_key),
                ),
                FTL.Attribute(
                    id=FTL.Identifier("tooltiptext"),
                    value=replace_shortcut(tooltip_key),
                ),
            ],
        )

    ctx.add_transforms(
        target,
        target,
        [
            shortcut_button(
                "toolbar-button-history",
                "history-panelmenu.label",
                "history-panelmenu.tooltiptext2",
            ),
            shortcut_button(
                "toolbar-button-find",
                "find-button.label",
                "find-button.tooltiptext3",
            ),
            shortcut_button(
                "toolbar-button-developer",
                "developer-button.label",
                "developer-button.tooltiptext2",
            ),
            shortcut_button(
                "toolbar-button-zoom-out",
                "zoom-out-button.label",
                "zoom-out-button.tooltiptext2",
            ),
            FTL.Message(
                id=FTL.Identifier("toolbar-button-zoom-reset-tooltip"),
                value=replace_shortcut("zoom-reset-button.tooltiptext2"),
            ),
            shortcut_button(
                "toolbar-button-zoom-in",
                "zoom-in-button.label",
                "zoom-in-button.tooltiptext2",
            ),
            shortcut_button(
                "toolbar-button-cut",
                "cut-button.label",
                "cut-button.tooltiptext2",
            ),
            shortcut_button(
                "toolbar-button-copy",
                "copy-button.label",
                "copy-button.tooltiptext2",
            ),
            shortcut_button(
                "toolbar-button-paste",
                "paste-button.label",
                "paste-button.tooltiptext2",
            ),
        ],
    )

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
toolbar-button-forget =
    .label = { COPY(from_path, "panic-button.label") }
    .tooltiptext = { COPY(from_path, "panic-button.tooltiptext") }
toolbar-zoom-controls =
    .label = { COPY(from_path, "zoom-controls.label") }
    .title = { COPY(from_path, "zoom-controls.tooltiptext2") }
toolbar-edit-controls =
    .label = { COPY(from_path, "edit-controls.label") }
    .title = { COPY(from_path, "edit-controls.tooltiptext2") }
""",
            from_path=source,
        ),
    )

    target = "browser/browser/customizeMode.ftl"
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
customize-mode-toolbarspring =
    .title = { COPY(from_path, "toolbarspring.label") }
customize-mode-toolbarseparator =
    .title = { COPY(from_path, "toolbarseparator.label") }
customize-mode-toolbarspacer =
    .title = { COPY(from_path, "toolbarspacer.label") }
""",
            from_path=source,
        ),
    )
