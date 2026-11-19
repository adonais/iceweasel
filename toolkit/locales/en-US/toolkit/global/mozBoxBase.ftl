# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

moz-box-link-anchor =
    .title = Opens in a new tab

moz-box-link-opens-in-new-tab = Opens in a new tab

moz-box-item-reorder-handle =
    .aria-label = Reorder item using Ctrl+Shift+ArrowUp or Ctrl+Shift+ArrowDown

# Variables:
#   $item (string) - The label of the moz-box-item being reordered.
moz-box-item-reorder-handle-named =
    .aria-label = Reorder { $item } using Ctrl+Shift+ArrowUp or Ctrl+Shift+ArrowDown

## Screen reader announcements made after an item in a reorderable list is moved.
## Variables:
##   $position (number) - The new position of the item in the list, starting at 1.
##   $total (number) - The total number of items in the list.

moz-box-group-reorder-announcement = Item moved to position { $position } of { $total }
