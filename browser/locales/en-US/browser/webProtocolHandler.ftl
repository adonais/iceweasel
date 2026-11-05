# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#  $host (String): The domain of the web application registering as a protocol handler.
#  $protocol (String): The type of protocol (e.g. "web+example").
protocolhandler-add-handler-message = Add “{ $host }” as an application for { $protocol } links?
protocolhandler-add-handler-button =
    .label = Add application
    .accesskey = A

protocolhandler-mailto-os-handler-yes-button = Set as default
protocolhandler-mailto-os-handler-no-button = Not now

# Button in the notification bar shown when a website asks to register as an
# application handler, for example for email links. Blocks the website from
# asking again.
protocolhandler-never-allow-button =
    .label = Never allow
    .accesskey = N

## Variables:
##  $url (String): The url of a webmailer, but only its full domain name.

protocolhandler-mailto-handler-set = Use <strong>{ -brand-short-name } to open { $url }</strong> every time you click a link that opens your email?
protocolhandler-mailto-handler-confirm = <strong>{ -brand-short-name } will open { $url }</strong> every time you click a link that sends email.

##
