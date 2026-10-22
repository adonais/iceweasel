# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2073889 - Drop the accesskeys of the content context menu's navigation items, part {index}."""

    path = "browser/browser/browserContext.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
main-context-menu-back-3 =
    .tooltiptext = {COPY_PATTERN(from_path, "main-context-menu-back-2.tooltiptext")}
    .aria-label = {COPY_PATTERN(from_path, "main-context-menu-back-2.aria-label")}
navbar-tooltip-back-3 =
    .value = {COPY_PATTERN(from_path, "main-context-menu-back-2.tooltiptext")}
toolbar-button-back-3 =
    .label = {COPY_PATTERN(from_path, "main-context-menu-back-2.aria-label")}
main-context-menu-forward-3 =
    .tooltiptext = {COPY_PATTERN(from_path, "main-context-menu-forward-2.tooltiptext")}
    .aria-label = {COPY_PATTERN(from_path, "main-context-menu-forward-2.aria-label")}
navbar-tooltip-forward-3 =
    .value = {COPY_PATTERN(from_path, "main-context-menu-forward-2.tooltiptext")}
toolbar-button-forward-3 =
    .label = {COPY_PATTERN(from_path, "main-context-menu-forward-2.aria-label")}
main-context-menu-reload-2 =
    .aria-label = {COPY_PATTERN(from_path, "main-context-menu-reload.aria-label")}
toolbar-button-reload-2 =
    .label = {COPY_PATTERN(from_path, "main-context-menu-reload.aria-label")}
main-context-menu-stop-2 =
    .aria-label = {COPY_PATTERN(from_path, "main-context-menu-stop.aria-label")}
toolbar-button-stop-2 =
    .label = {COPY_PATTERN(from_path, "main-context-menu-stop.aria-label")}
toolbar-button-stop-reload-2 =
    .title = {COPY_PATTERN(from_path, "main-context-menu-reload.aria-label")}
main-context-menu-bookmark-page-2 =
    .aria-label = {COPY_PATTERN(from_path, "main-context-menu-bookmark-page.aria-label")}
    .tooltiptext = {COPY_PATTERN(from_path, "main-context-menu-bookmark-page.tooltiptext")}
main-context-menu-bookmark-page-with-shortcut-2 =
    .aria-label = {COPY_PATTERN(from_path, "main-context-menu-bookmark-page-with-shortcut.aria-label")}
    .tooltiptext = {COPY_PATTERN(from_path, "main-context-menu-bookmark-page-with-shortcut.tooltiptext")}
main-context-menu-edit-bookmark-2 =
    .aria-label = {COPY_PATTERN(from_path, "main-context-menu-edit-bookmark.aria-label")}
    .tooltiptext = {COPY_PATTERN(from_path, "main-context-menu-edit-bookmark.tooltiptext")}
main-context-menu-edit-bookmark-with-shortcut-2 =
    .aria-label = {COPY_PATTERN(from_path, "main-context-menu-edit-bookmark-with-shortcut.aria-label")}
    .tooltiptext = {COPY_PATTERN(from_path, "main-context-menu-edit-bookmark-with-shortcut.tooltiptext")}
""",
            from_path=path,
        ),
    )
