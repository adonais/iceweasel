# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2080569 - Migrate viewSource.properties to Fluent, part {index}."""

    source = "toolkit/chrome/global/viewSource.properties"
    target = "toolkit/toolkit/global/viewSource.ftl"
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
view-source-go-to-line-title = {COPY(from_path, "goToLineTitle")}
view-source-go-to-line-text = {COPY(from_path, "goToLineText")}
view-source-invalid-input-title = {COPY(from_path, "invalidInputTitle")}
view-source-invalid-input-text = {COPY(from_path, "invalidInputText")}
view-source-out-of-range-title = {COPY(from_path, "outOfRangeTitle")}
view-source-out-of-range-text = {COPY(from_path, "outOfRangeText")}
view-source-selection-title = {COPY(from_path, "viewSelectionSourceTitle")}
view-source-context-go-to-line =
    .label = {COPY(from_path, "context_goToLine_label")}
    .accesskey = {COPY(from_path, "context_goToLine_accesskey")}
view-source-context-wrap-long-lines =
    .label = {COPY(from_path, "context_wrapLongLines_label")}
view-source-context-highlight-syntax =
    .label = {COPY(from_path, "context_highlightSyntax_label")}
""",
            from_path=source,
        ),
    )
