# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### Import Logins Autocomplete

## Variables:
##   $host (String) - Host name of the current site.

autocomplete-import-logins-chrome =
    <div data-l10n-name="line1">Import your login from Google Chrome</div>
    <div data-l10n-name="line2">for { $host } and other sites</div>
autocomplete-import-logins-chromium =
    <div data-l10n-name="line1">Import your login from Chromium</div>
    <div data-l10n-name="line2">for { $host } and other sites</div>
autocomplete-import-logins-chromium-edge =
    <div data-l10n-name="line1">Import your login from Microsoft Edge</div>
    <div data-l10n-name="line2">for { $host } and other sites</div>

##

autocomplete-import-learn-more = Learn more

## Secondary actions shown on form autocomplete dropdown rows.
## Gated by the browser.autocomplete.removeRecords.enabled pref.

# aria-label and tooltip for the button that opens the edit/delete menu.
# Variables:
#   $entry (String) - The dropdown row the actions apply to, such as a username, an address, or a payment method.
autocomplete-more-actions2 = More actions for { $entry }

autocomplete-edit-password = Edit this password
autocomplete-delete-password = Delete this password
autocomplete-edit-address = Edit this address
autocomplete-delete-address = Delete this address
autocomplete-edit-payment-method = Edit this payment method
autocomplete-delete-payment-method = Delete this payment method

# aria-label and tooltip for the trash button on a form history entry.
# Variables:
#   $entry (String) - The text of the saved form history entry that would be deleted.
autocomplete-delete-form-history-entry2 = Delete { $entry } from form history

## Confirmation shown before a record is removed from the autocomplete dropdown.
## Gated by the browser.autocomplete.removeRecords.enabled pref.

autocomplete-remove-password-title = Remove password?
autocomplete-remove-address-title = Remove address?
autocomplete-remove-payment-method-title = Remove payment method?
autocomplete-remove-record-message = You cannot undo this action.
autocomplete-remove-record-button = Remove

## Device sign-in prompt shown before a password is removed from the autocomplete
## dropdown. The -win and -macosx variants are selected at runtime; other platforms
## do not support device sign-in and fall back to the Primary Password dialog.

autocomplete-remove-password-os-auth-dialog-message-win = To delete your password, enter your Windows login credentials. This helps protect the security of your accounts.
# The macOS strings are preceded by the operating system with "Firefox is trying to "
# and includes subtitle of "Enter password for the user "xxx" to allow this." These
# strings together will be presented by the operating system.
autocomplete-remove-password-os-auth-dialog-message-macosx = delete the saved password
autocomplete-remove-password-os-auth-dialog-caption = { -brand-full-name }
