# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2080184 - Migrate bookmarkProperties.properties to Fluent, part {index}."""

    source = "browser/chrome/browser/places/bookmarkProperties.properties"
    target = "browser/browser/editBookmarkOverlay.ftl"
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
bookmark-properties-save-button =
  .label = {COPY(from_path, "dialogAcceptLabelSaveItem")}
bookmark-properties-title-add-bookmark = {COPY(from_path, "dialogTitleAddNewBookmark2")}
bookmark-properties-title-add-multiple-bookmarks = {COPY(from_path, "dialogTitleAddMulti")}
bookmark-properties-title-add-folder = {COPY(from_path, "dialogTitleAddBookmarkFolder")}
bookmark-properties-title-edit-bookmark = {COPY(from_path, "dialogTitleEditBookmark2")}
bookmark-properties-title-edit-folder = {COPY(from_path, "dialogTitleEditBookmarkFolder")}
bookmark-properties-default-name-all-tabs-folder = {COPY(from_path, "bookmarkAllTabsDefault")}
bookmark-properties-default-name-folder = {COPY(from_path, "newFolderDefault")}
bookmark-properties-default-name-bookmark = {COPY(from_path, "newBookmarkDefault")}
""",
            from_path=source,
        ),
    )
