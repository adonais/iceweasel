# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Variables
##   $count (number) - The number of tabs

content-sharing-modal-more-tabs =
    { $count ->
       *[other] +{ $count } more
    }

content-sharing-tabs-title =
    { $count ->
        [one] { $count } tab
       *[other] { $count } tabs
    }

content-sharing-modal-view-page =
  .label = View page

content-sharing-modal-copy-link =
  .label = Copy link

content-sharing-modal-generating-page =
  .label = Generating page…

content-sharing-modal-link-copied =
  .label = Link copied

content-sharing-modal-sign-in =
  .label = Sign in to share links

content-sharing-modal-title = Share this collection of links on any browser

content-sharing-modal-description = Create a public page for these links that’s easy to share. Once created, the page can’t be edited or deleted and expires in 7 days.

content-sharing-modal-policy = By sharing, you agree to our <a data-l10n-name="aup-link">Acceptable Use Policy</a>

# This is a warning to the user when they try to share more than the maximum
# number of links and that the first N links will be shared.
# The current max is 30.
content-sharing-modal-too-many-links =
  { $count ->
      *[other] Only a maximum of { $count } links will be included
  }

content-sharing-modal-generic-error =
  .heading = Something went wrong
  .message = Try again later.
