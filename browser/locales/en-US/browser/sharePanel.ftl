# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## The share panel, opened from the share button in the address bar.

# Address bar button that opens the share panel.
urlbar-share-button =
  .tooltiptext = Share this page
  .aria-label = Share this page

share-panel-heading = Share Page

share-panel-copy-link =
  .label = Copy Link
# Confirmation hint shown near the share button after the user copies the
# current page URL from the share panel.
confirmation-hint-link-copied = Link copied

# Share with Windows/Mac means to pass a given link to the native OS sharing
# system so that a given link can be shared with native apps
share-panel-os-share-2 =
  .label = { PLATFORM() ->
    [windows] Share with Windows…
    [macos] Share with Mac…
    *[other] Share with…
  }

share-panel-mail =
  .label = Send Email
share-panel-screenshot =
  .label = Take a Screenshot
share-panel-qr-code-2 =
  .label = Create QR Code

# This string is shown when the user has more than 1 device signed in to their account.
# Clicking this will bring them to a subview where all of their devices are listed.
share-panel-send-to-device =
  .label = Send to Device
# This string is shown when the user has no other devices signed in to their account.
# Clicking this will bring them to a place where they can connect other devices.
share-panel-send-to-mobile =
  .label = Send to Mobile

share-panel-device-subview =
  .title = All Devices

# Shown below the device list in the share panel's device subview. Clicking it
# opens the flow to connect another device to the user's account.
share-panel-connect-device-2 =
  .label = Add a Device
# Shown below the device list in the share panel's device subview. Clicking it
# opens a support article about devices missing from the list.
share-panel-missing-device =
  .label = Don’t See Your Device?
