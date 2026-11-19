# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

sanitize-prefs2 =
    .title = Settings for Clearing History
    .style = min-width: 34em

sanitize-prefs-style =
    .style = width: 17em

sanitize-dialog-title2 =
    .title = Clear browsing data and cookies
    .style = min-width: 34em

sanitize-dialog-title =
    .title = Clear Recent History
    .style = min-width: 34em

# When "Time range to clear" is set to "Everything", this message is used for the
# title instead of dialog-title.
sanitize-dialog-title-everything =
    .title = Clear All History
    .style = min-width: 34em

# Title used whenever this dialog is opened to delete data, whichever entry
# point it was opened from. sanitize-dialog-title2 is still used for the clear
# on shutdown context, which saves preferences rather than deleting anything.
# Keep the .style in sync with it.
sanitize-dialog-delete-title =
    .title = Delete browsing data
    .style = min-width: 34em

clear-data-settings-label = When closed, { -brand-short-name } should automatically clear all

sanitize-on-shutdown-description = Automatically clear all checked items when { -brand-short-name } closes.

## clear-time-duration-prefix is followed by a dropdown list, with
## values localized using clear-time-duration-value-* messages.
## clear-time-duration-suffix is left empty in English, but can be
## used in other languages to change the structure of the message.
##
## This results in English:
## Time range to clear: (Last Hour, Today, etc.)

clear-time-duration-prefix =
    .value = Time range to clear:{ " " }
    .accesskey = T

clear-time-duration-prefix2 =
    .value = When:
    .accesskey = W

clear-time-duration-value-last-hour =
    .label = Last hour

clear-time-duration-value-last-2-hours =
    .label = Last two hours

clear-time-duration-value-last-4-hours =
    .label = Last four hours

# Variables:
#   $midnightTime (String) - Time of midnight (00:00 hours) - to inform the user that history will be cleared after midnight
clear-time-duration-value-since-midnight =
    .label = Since { $midnightTime }

clear-time-duration-value-today =
    .label = Today

clear-time-duration-value-all-time =
    .label = All time

clear-time-duration-suffix =
    .value = { "" }

## These strings are used as section comments and checkboxes
## to select the items to remove

history-section-label = History

item-history-and-downloads2 =
    .label = Browsing and downloads history
    .accesskey = B

# Description for the "Browsing and downloads history" item, which can be selected for deletion
item-history-and-downloads-description3 = Visited sites and downloads list

item-cookies =
    .label = Cookies
    .accesskey = C

# Variables:
#   $amount (Number) - Amount of site data currently stored on disk
#   $unit (String) - Abbreviation of the unit that $amount is in, e.g. "MB"
item-cookies-site-data-with-size =
    .label = Cookies and site data ({ $amount } { $unit })
    .accesskey = e

item-cookies-site-data =
    .label = Cookies and site data
    .accesskey = e

# Description for the "Cookies and site data" item, which can be selected for deletion
item-cookies-site-data-description2 = Signs you out and may clear shopping carts

item-active-logins =
    .label = Active logins
    .accesskey = l

item-cache =
    .label = Cache
    .accesskey = a

# Variables:
#   $amount (Number) - Amount of cached data
#   $unit (String) - Abbreviation of the unit that $amount is in, e.g. "MB"
item-cached-content-with-size2 =
    .label = Temporary files ({ $amount } { $unit })
    .accesskey = f

item-cached-content2 =
    .label = Temporary files
    .accesskey = f

# Description for the "Temporary files" item, which can be selected for deletion
item-cached-content-description2 = Helps sites load faster

item-form-search-history =
    .label = Form & search history
    .accesskey = F

item-site-prefs =
    .label = Site settings
    .accesskey = i

item-formdata-prefs =
    .label = Saved form info
    .accesskey = o

# Description for the "Saved form info" item, which can be selected for deletion
item-formdata-description2 = Names, emails, and form entries

# Description for the "Site settings" item, which can be selected for deletion
item-site-prefs-description2 = Website permissions and preferences

data-section-label = Data

item-site-settings =
    .label = Site settings
    .accesskey = S

item-offline-apps =
    .label = Offline website data
    .accesskey = O

sanitize-everything-undo-warning2 = This can’t be undone.

window-close =
    .key = w

sanitize-button-ok =
    .label = Clear Now

sanitize-button-ok-on-shutdown =
    .label = Save Changes

# Confirm button used whenever this dialog is opened to delete data, whichever
# entry point it was opened from.
sanitize-button-delete =
    .label = Delete

# Icon-only button in the dialog's top right corner. Dismisses the dialog
# without deleting anything, the same as the Cancel button.
sanitize-dialog-close-button =
    .title = Close

# The label for the default button between the user clicking it and the window
# closing.  Indicates the items are being cleared.
sanitize-button-clearing =
    .label = Clearing

# Warning that appears when "Time range to clear" is set to "Everything" in Clear
# Recent History dialog, provided that the user has not modified the default set
# of history items to clear.
sanitize-everything-warning = All history will be cleared.

# Warning that appears when "Time range to clear" is set to "Everything" in Clear
# Recent History dialog, provided that the user has modified the default set of
# history items to clear.
sanitize-selected-warning = All selected items will be cleared.

# Label shown next to the loading spinner while calculating the size of cached data
# and cookies in the clear data dialog.
sanitize-calculating-size = Calculating…
