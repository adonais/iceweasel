# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Organize Tabs Toolbar Button

smartwindow-organize-tabs-button =
    .label = Organize Tabs
    .tooltiptext = Organize Tabs

## Organize Tabs Panel
## The panel opened from the "Organize Tabs" toolbar button, which suggests
## groups for the window's open tabs and creates the ones the user picks.

smartwindow-group-tabs-panel-heading = Organize Tabs
# Shown while the on-device model clusters the open tabs into suggestions. It is
# forming new groups from these tabs, not searching for tab groups that already
# exist.
smartwindow-group-tabs-loading = Checking tabs for useful groups…
# Shown when clustering produced no group worth suggesting.
smartwindow-group-tabs-empty = No tab groups to suggest right now. Check again later.
# Shown in place of suggestions when every group the model found has already
# been created.
smartwindow-group-tabs-all-sorted = Nice work organizing your tabs
smartwindow-group-tabs-create-all = Create Groups
smartwindow-group-tabs-suggested-heading = Suggested groups
# Accessible name for the flyout that lists the tabs of one suggested group.
# Activating a tab in the list switches to it. $groupLabel is the suggested
# group's name.
smartwindow-group-tabs-flyout-list =
    .aria-label = Tabs in { $groupLabel }
# Accessible name for a suggested-group row. Activating the row creates the
# group. $groupLabel is the suggested group's name, $tabCount the number of
# tabs it would contain.
smartwindow-group-tabs-suggestion =
    .aria-label =
        { $tabCount ->
            [one] Create group { $groupLabel }, { $tabCount } tab
           *[other] Create group { $groupLabel }, { $tabCount } tabs
        }
# Heading for the list of groups the user just created (and can still undo).
smartwindow-group-tabs-just-created-heading = Just created
# Action that dissolves every group in the "Just created" list. The tabs stay
# open; only the grouping is removed.
smartwindow-group-tabs-ungroup = Ungroup Tabs
# Action that closes this window's duplicate tabs, keeping the most recently
# used tab of each set. Only shown when there are duplicates to close, and
# $tabCount is exactly how many tabs activating it closes.
smartwindow-group-tabs-close-duplicates =
    { $tabCount ->
        [one] Close { $tabCount } Duplicate Tab
       *[other] Close { $tabCount } Duplicate Tabs
    }
