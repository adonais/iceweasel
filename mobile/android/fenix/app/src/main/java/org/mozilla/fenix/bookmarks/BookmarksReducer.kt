/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks

import mozilla.appservices.places.BookmarkRoot

/**
 * Function for reducing a new bookmarks state based on the received action.
 */
internal fun bookmarksReducer(state: BookmarksState, action: BookmarksAction) = when (action) {
    is InitEditLoaded -> state.copy(
        currentFolder = action.folder,
        bookmarksEditBookmarkState = BookmarksEditBookmarkState(
            bookmark = action.bookmark,
            folder = action.folder,
        ),
    )
    is BookmarksLoaded -> state.copy(
        currentFolder = action.folder,
        bookmarkItems = action.bookmarkItems.sortedWith(state.sortOrder.comparator),
        isLoading = false,
    )
    is SearchClicked -> state.copy(isSearching = true)
    is SearchDismissed -> state.copy(isSearching = false)
    is RecursiveSelectionCountLoaded -> state.copy(recursiveSelectedCount = action.count)
    is BookmarkLongClicked -> state.toggleSelectionOf(action.item)
    is FolderLongClicked -> state.toggleSelectionOf(action.item)
    is FolderClicked -> when {
        state.selectedItems.isNotEmpty() && action.item.isDesktopFolder -> state.copy(
            bookmarksSnackbarState = BookmarksSnackbarState.CantEditDesktopFolders,
        )
        state.selectedItems.isNotEmpty() -> state.toggleSelectionOf(action.item)
        else -> state
    }
    is EditBookmarkClicked -> state.copy(
        bookmarksEditBookmarkState = BookmarksEditBookmarkState(
            bookmark = action.bookmark,
            folder = state.currentFolder,
        ),
    )
    is BookmarkClicked -> if (state.selectedItems.isNotEmpty()) {
        state.toggleSelectionOf(action.item)
    } else {
        state
    }
    AddFolderClicked -> state.copy(
        bookmarksAddFolderState = BookmarksAddFolderState(
            parent = state.currentFolder,
            folderBeingAddedTitle = "",
        ),
    )
    is SelectFolderAction -> state.handleSelectFolderAction(action)
    BackClicked -> state.respondToBackClick()
    is EditBookmarkAction -> state.handleEditBookmarkAction(action)
    is AddFolderAction -> state.handleAddFolderAction(action)
    is EditFolderAction -> state.handleEditFolderAction(action)
    is BookmarksListMenuAction -> state.handleListMenuAction(action)
    is SnackbarAction -> state.handleSnackbarAction(action)
    is DeletionDialogAction -> state.handleDeletionDialogAction(action)
    is OpenTabsConfirmationDialogAction -> state.handleOpenTabsConfirmationDialogAction(action)
    is ReceivedSyncSignInUpdate -> {
        state.copy(isSignedIntoSync = action.isSignedIn)
    }
    CloseClicked,
    FirstSyncCompleted,
    ViewDisposed,
    SelectFolderAction.ViewAppeared,
    SignIntoSyncClicked,
    is InitEdit,
    Init,
    PrivateBrowsingAuthorized,
    -> state
}

private fun BookmarksState.handleOpenTabsConfirmationDialogAction(
    action: OpenTabsConfirmationDialogAction,
): BookmarksState {
    return when (action) {
        OpenTabsConfirmationDialogAction.CancelTapped,
        OpenTabsConfirmationDialogAction.ConfirmTapped,
            -> this.copy(openTabsConfirmationDialog = OpenTabsConfirmationDialog.None)

        is OpenTabsConfirmationDialogAction.Present -> this.copy(
            openTabsConfirmationDialog = OpenTabsConfirmationDialog.Presenting(
                guidToOpen = action.guid,
                numberOfTabs = action.count,
                isPrivate = action.isPrivate,
            ),
        )
    }
}

private fun BookmarksState.handleSelectFolderAction(action: SelectFolderAction): BookmarksState {
    return when (action) {
        is SelectFolderAction.ItemClicked -> updateSelectedFolder(action.folder)
        is SelectFolderAction.FoldersLoaded -> copy(
            bookmarksSelectFolderState = bookmarksSelectFolderState?.copy(
                folders = action.folders,
            ) ?: BookmarksSelectFolderState(
                folders = action.folders,
                outerSelectionGuid = BookmarkRoot.Mobile.id,
            ),
        )
        is SelectFolderAction.SortMenu -> this.handleSortMenuAction(action)

        SelectFolderAction.ViewAppeared -> this
    }
}

private fun BookmarksState.handleEditBookmarkAction(action: EditBookmarkAction): BookmarksState {
    return when (action) {
        EditBookmarkAction.FolderClicked -> copy(
            bookmarksSelectFolderState = BookmarksSelectFolderState(
                outerSelectionGuid = bookmarksEditBookmarkState?.folder?.guid ?: currentFolder.guid,
            ),
        )

        EditBookmarkAction.DeleteClicked -> this.copy(
            bookmarksSnackbarState = bookmarksEditBookmarkState?.let {
                bookmarksSnackbarState.addGuidToDelete(it.bookmark.guid)
            } ?: BookmarksSnackbarState.None,
            bookmarksEditBookmarkState = null,
        )

        is EditBookmarkAction.TitleChanged -> this.copy(
            bookmarksEditBookmarkState = bookmarksEditBookmarkState?.let {
                it.copy(
                    bookmark = it.bookmark.copy(title = action.title),
                    edited = true,
                )
            },
        )

        is EditBookmarkAction.URLChanged -> this.copy(
            bookmarksEditBookmarkState = bookmarksEditBookmarkState?.let {
                it.copy(
                    bookmark = it.bookmark.copy(url = action.url),
                    edited = true,
                )
            },
        )
    }
}

private fun BookmarksState.handleAddFolderAction(action: AddFolderAction): BookmarksState {
    return when (action) {
        is AddFolderAction.ParentFolderClicked -> this.copy(
            bookmarksSelectFolderState = bookmarksSelectFolderState?.copy(
                innerSelectionGuid = bookmarksAddFolderState?.parent?.guid ?: currentFolder.guid,
            ) ?: BookmarksSelectFolderState(
                outerSelectionGuid = bookmarksAddFolderState?.parent?.guid ?: currentFolder.guid,
            ),
        )

        is AddFolderAction.FolderCreated -> this.copy(
            bookmarksSelectFolderState = null,
            bookmarksEditBookmarkState = bookmarksEditBookmarkState?.copy(
                folder = action.folder,
            ),
        )

        is AddFolderAction.TitleChanged -> this.copy(
            bookmarksAddFolderState = bookmarksAddFolderState?.copy(
                folderBeingAddedTitle = action.updatedText,
            ),
        )
    }
}

private fun BookmarksState.handleEditFolderAction(action: EditFolderAction): BookmarksState {
    return when (action) {
        is EditFolderAction.TitleChanged -> this.copy(
            bookmarksEditFolderState = bookmarksEditFolderState?.let {
                it.copy(
                    folder = it.folder.copy(title = action.updatedText),
                )
            },
        )

        is EditFolderAction.ParentFolderClicked -> this.copy(
            bookmarksSelectFolderState = bookmarksSelectFolderState?.copy(
                innerSelectionGuid = bookmarksEditFolderState?.parent?.guid ?: currentFolder.guid,
            ) ?: BookmarksSelectFolderState(
                outerSelectionGuid = bookmarksEditFolderState?.parent?.guid ?: currentFolder.guid,
            ),
        )

        is EditFolderAction.DeleteClicked -> bookmarksEditFolderState?.folder?.guid?.let {
            this.copy(
                bookmarksDeletionDialogState = DeletionDialogState.LoadingCount(
                    listOf(bookmarksEditFolderState.folder.guid),
                ),
            )
        } ?: this
    }
}

private fun BookmarksState.handleSnackbarAction(action: SnackbarAction): BookmarksState {
    return when (action) {
        SnackbarAction.Undo -> {
            this.copy(
                bookmarksSnackbarState = BookmarksSnackbarState.None,
                bookmarksDeletionSnackbarQueueCount = 0,
            )
        }

        SnackbarAction.Dismissed -> {
            if (bookmarksDeletionSnackbarQueueCount > 1) {
                this.copy(bookmarksDeletionSnackbarQueueCount = bookmarksDeletionSnackbarQueueCount - 1)
            } else {
                withDeletedItemsRemoved()
                    .copy(
                        bookmarksSnackbarState = BookmarksSnackbarState.None,
                        bookmarksDeletionSnackbarQueueCount = 0,
                    )
            }
        }
    }
}

private fun BookmarksState.handleDeletionDialogAction(action: DeletionDialogAction): BookmarksState {
    return when (action) {
        is DeletionDialogAction.CountLoaded -> this.copy(
            bookmarksDeletionDialogState = DeletionDialogState.Presenting(
                guidsToDelete = bookmarksDeletionDialogState.guidsToDelete,
                recursiveCount = action.count,
            ),
        )

        DeletionDialogAction.CancelTapped -> this.copy(bookmarksDeletionDialogState = DeletionDialogState.None)
        DeletionDialogAction.DeleteTapped -> {
            withDeletedItemsRemoved().copy(bookmarksDeletionDialogState = DeletionDialogState.None)
        }
    }
}

private fun BookmarksState.withDeletedItemsRemoved(): BookmarksState = when {
    bookmarksDeletionDialogState is DeletionDialogState.Presenting -> copy(
        bookmarkItems = bookmarkItems.filterNot { bookmarksDeletionDialogState.guidsToDelete.contains(it.guid) },
    )
    bookmarksSnackbarState is BookmarksSnackbarState.UndoDeletion -> copy(
        bookmarkItems = bookmarkItems.filterNot { bookmarksSnackbarState.guidsToDelete.contains(it.guid) },
    )
    else -> this
}

private fun BookmarksState.updateSelectedFolder(folder: SelectFolderItem): BookmarksState = when {
    bookmarksSelectFolderState?.innerSelectionGuid != null -> {
        // we can't have both an add and edit folder at the same time, so we will just try to update
        // both of them.
        copy(
            bookmarksEditFolderState = bookmarksEditFolderState?.copy(parent = folder.folder),
            bookmarksAddFolderState = bookmarksAddFolderState?.copy(parent = folder.folder),
            bookmarksSelectFolderState = bookmarksSelectFolderState.copy(innerSelectionGuid = folder.guid),
        )
    }
    bookmarksSelectFolderState?.outerSelectionGuid != null -> {
        val alwaysTryUpdate = copy(
            bookmarksMultiselectMoveState = bookmarksMultiselectMoveState?.copy(destination = folder.guid),
            bookmarksSelectFolderState = bookmarksSelectFolderState.copy(outerSelectionGuid = folder.guid),
        )
        if (bookmarksEditBookmarkState == null) {
            alwaysTryUpdate.copy(
                bookmarksEditFolderState = bookmarksEditFolderState?.copy(parent = folder.folder),
                bookmarksAddFolderState = bookmarksAddFolderState?.copy(parent = folder.folder),
            )
        } else {
            alwaysTryUpdate.copy(
                bookmarksEditBookmarkState = bookmarksEditBookmarkState.copy(folder = folder.folder, edited = true),
            )
        }
    }

    else -> this
}

private fun BookmarksState.toggleSelectionOf(item: BookmarkItem): BookmarksState =
    if (selectedItems.any { it.guid == item.guid }) {
        copy(selectedItems = selectedItems - item)
    } else {
        copy(selectedItems = selectedItems + item)
    }

private fun BookmarksState.respondToBackClick(): BookmarksState = when {
    // we check select folder state first because it can be the most deeply nested, e.g.
    // select -> add -> select
    bookmarksSelectFolderState != null -> {
        when {
            bookmarksSelectFolderState.innerSelectionGuid != null -> {
                copy(
                    bookmarksSelectFolderState = bookmarksSelectFolderState.copy(innerSelectionGuid = null),
                )
            }
            bookmarksAddFolderState != null && bookmarksEditBookmarkState != null -> {
                copy(bookmarksAddFolderState = null)
            }
            else -> copy(
                bookmarksMultiselectMoveState = null,
                bookmarksSelectFolderState = null,
            )
        }
    }
    bookmarksAddFolderState != null -> {
        copy(bookmarksAddFolderState = null)
    }
    bookmarksEditFolderState != null -> copy(bookmarksEditFolderState = null)
    bookmarksEditBookmarkState != null -> copy(bookmarksEditBookmarkState = null)
    selectedItems.isNotEmpty() -> copy(selectedItems = listOf())
    else -> this
}

private fun BookmarksState.handleSortMenuAction(action: BookmarksAction): BookmarksState =
    when (action) {
        BookmarksListMenuAction.SortMenu.SortMenuButtonClicked,
        SelectFolderAction.SortMenu.SortMenuButtonClicked,
            -> copy(
            sortMenuShown = !sortMenuShown,
        )
        BookmarksListMenuAction.SortMenu.SortMenuDismissed,
        SelectFolderAction.SortMenu.SortMenuDismissed,
            -> copy(
            sortMenuShown = false,
        )
        BookmarksListMenuAction.SortMenu.CustomSortClicked,
        SelectFolderAction.SortMenu.CustomSortClicked,
            -> copy(
            sortOrder = BookmarksListSortOrder.Positional,
        )
        BookmarksListMenuAction.SortMenu.NewestClicked,
        SelectFolderAction.SortMenu.NewestClicked,
            -> copy(
            sortOrder = BookmarksListSortOrder.Created(true),
        )
        BookmarksListMenuAction.SortMenu.OldestClicked,
        SelectFolderAction.SortMenu.OldestClicked,
            -> copy(
            sortOrder = BookmarksListSortOrder.Created(false),
        )
        BookmarksListMenuAction.SortMenu.AtoZClicked,
        SelectFolderAction.SortMenu.AtoZClicked,
            -> copy(
            sortOrder = BookmarksListSortOrder.Alphabetical(true),
        )

        BookmarksListMenuAction.SortMenu.ZtoAClicked,
        SelectFolderAction.SortMenu.ZtoAClicked,
            -> copy(
            sortOrder = BookmarksListSortOrder.Alphabetical(false),
        )
        else -> copy(sortOrder = BookmarksListSortOrder.Positional)
    }.let {
        it.copy(
            bookmarkItems = it.bookmarkItems.sortedWith(it.sortOrder.comparator),
        )
    }

@Suppress("CyclomaticComplexMethod")
private fun BookmarksState.handleListMenuAction(action: BookmarksListMenuAction): BookmarksState =
    when (action) {
        is BookmarksListMenuAction.Bookmark.EditClicked -> this.copy(
            bookmarksEditBookmarkState = BookmarksEditBookmarkState(
                bookmark = action.bookmark,
                folder = currentFolder,
            ),
        )
        is BookmarksListMenuAction.Folder.EditClicked -> copy(
            bookmarksEditFolderState = BookmarksEditFolderState(
                parent = currentFolder,
                folder = action.folder,
            ),
        )
        BookmarksListMenuAction.MultiSelect.DeleteClicked -> {
            if (this.selectedItems.size > 1 || this.selectedItems.any { it is BookmarkItem.Folder }) {
                copy(
                    bookmarksDeletionDialogState = DeletionDialogState.LoadingCount(this.selectedItems.map { it.guid }),
                )
            } else {
                copy(
                    bookmarksSnackbarState = bookmarksSnackbarState.addGuidsToDelete(
                        guids = this.selectedItems.map { it.guid },
                    ),
                )
            }
        }
        is BookmarksListMenuAction.MultiSelect.EditClicked ->
            selectedItems.firstOrNull()?.let { selectedItem ->
                if (selectedItem is BookmarkItem.Bookmark) {
                    copy(
                        bookmarksEditBookmarkState = BookmarksEditBookmarkState(
                            bookmark = selectedItem,
                            folder = currentFolder,
                        ),
                    )
                } else {
                    this // TODO
                }
            } ?: this
        is BookmarksListMenuAction.Bookmark.DeleteClicked -> copy(
            bookmarksSnackbarState = bookmarksSnackbarState.addGuidToDelete(action.bookmark.guid),
            bookmarksDeletionSnackbarQueueCount = bookmarksDeletionSnackbarQueueCount + 1,
        )
        is BookmarksListMenuAction.Folder.DeleteClicked -> copy(
            bookmarksDeletionDialogState = DeletionDialogState.LoadingCount(listOf(action.folder.guid)),
        )
        BookmarksListMenuAction.MultiSelect.MoveClicked -> copy(
            bookmarksSelectFolderState = BookmarksSelectFolderState(
                outerSelectionGuid = currentFolder.guid,
            ),
            bookmarksMultiselectMoveState = MultiselectMoveState(
                guidsToMove = selectedItems.map { it.guid },
                destination = currentFolder.guid,
            ),
        )
        is BookmarksListMenuAction.SelectAll -> copy(selectedItems = bookmarkItems)
        is BookmarksListMenuAction.SortMenu -> handleSortMenuAction(action)
        else -> this
    }.let { updatedState ->
        when (action) {
            is BookmarksListMenuAction.MultiSelect -> updatedState.copy(
                selectedItems = listOf(),
                recursiveSelectedCount = null,
            )
            else -> updatedState
        }
    }
