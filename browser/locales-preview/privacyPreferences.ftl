# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

security-privacy-status-ok-header = { -brand-short-name } is on guard

# This is the header above a section telling the user about problems in their settings
# Variables:
#   $problemCount (Number) - Number of problems we have discovered in the user`s settings
security-privacy-status-problem-header = { $problemCount ->
      [one] { $problemCount } issue affecting your security and privacy
      *[other] { $problemCount } issues affecting your security and privacy
  }
security-privacy-status-ok-label = Your security and privacy are protected
security-privacy-status-problem-label = Some of your settings are affecting your security and privacy
security-privacy-status-problem-helper-label = See warnings below
security-privacy-status-pending-trackers-label = Looking up how many trackers we blocked over the last month

# This label tells the user how many trackers we have blocked for them.
# Variables:
#   $trackerCount (Number) - Number of trackers we have blocked in the last month
security-privacy-status-trackers-label = { $trackerCount ->
      [one] { $trackerCount } tracker blocked over the last month
      *[other] { $trackerCount } trackers blocked over the last month
  }
security-privacy-status-strict-enabled-label = You have <a data-l10n-name="strict-tracking-protection">strict tracking protection</a> enabled
security-privacy-status-up-to-date-label = { -brand-short-name } is up to date
security-privacy-status-update-needed-label = A new version of { -brand-short-name } is available.
security-privacy-status-update-error-label = { -brand-short-name } is having trouble updating itself
security-privacy-status-update-checking-label = { -brand-short-name } is checking for updates
security-privacy-status-update-needed-description = Update { -brand-short-name } to get the latest security updates
security-privacy-status-update-button-label =
  .label = Update { -brand-short-name }

security-privacy-image-warning =
  .alt = The { -brand-short-name } mascot, expressing concern over your security warnings
security-privacy-image-ok =
  .alt = The { -brand-short-name } mascot, pleased that you have no outstanding security issues

security-privacy-issue-card =
  .heading = Security warnings
issue-card-reset-button =
  .label = Fix
issue-card-dismiss-button =
  .tooltiptext = Dismiss
  .aria-label = Dismiss

security-privacy-issue-warning-test =
  .label = A testing setting is enabled
  .description = This causes { -brand-short-name } to show this spurious warning, and nothing else

security-privacy-issue-warning-fingerprinters =
  .label = Known fingerprinters are not blocked
  .description = Fingerprinters can track you across websites without using cookies

security-privacy-issue-warning-third-party-cookies =
  .label = Third-party cookies are enabled
  .description = Third-party cookies are often used to track you across sites

security-privacy-issue-warning-password-manager =
  .label = Password manager is disabled
  .description = Strong, unique passwords for all of your online accounts are harder to maintain

security-privacy-issue-warning-popup-blocker =
  .label = Popup blocker is disabled
  .description = Annoying and deceptive windows can appear unexpectedly

security-privacy-issue-warning-extension-install =
  .label = Websites can install extensions
  .description = Extensions are powerful and should not be installed by most websites without your permission

security-privacy-issue-warning-safe-browsing =
  .label = Dangerous and deceptive content is not blocked
  .description = Some websites are known to serve malware or phishing pages, and we are not blocking them for you

security-privacy-issue-warning-doh =
  .label = DNS over HTTPS is disabled
  .description = Your network provider can see what websites you visit

security-privacy-issue-warning-ech =
  .label = Encrypted Client Hello is disabled
  .description = Your network provider can see what websites you visit

security-privacy-issue-warning-ct =
  .label = Certificate Transparency is disabled
  .description = Rogue certificates that may make your connection insecure are harder to detect

security-privacy-issue-warning-crlite =
  .label = Certificate revocation is disabled
  .description = Certificates that a website no longer trusts can not be disabled

security-privacy-issue-warning-certificate-pinning =
  .label = Certificate pinning is disabled
  .description = Rogue certificates that may make your connection insecure are harder to detect

security-privacy-issue-warning-tlsmin =
  .label = Unsafe TLS versions are enabled
  .description = Old TLS versions may allow attackers to read and modify your traffic

security-privacy-issue-warning-tlsmax =
  .label = The latest TLS version is disabled
  .description = TLS is how we protect your network traffic, and the latest version is the best security we have to offer

security-privacy-issue-warning-proxy-autodetection =
  .label = Proxy auto-configuration is enabled
  .description = Untrusted networks could monitor your web activity

security-privacy-issue-warning-privileged-constraint =
  .label = Privileged context hardening is disabled
  .description = Certain internal browser pages have some web features that could be disabled to improve security

security-privacy-issue-warning-process-sandbox =
  .label = Process sandbox features are disabled
  .description = Some browser components have features enabled that could be disabled to improve security

security-privacy-issue-warning-content-resource-uri =
  .label = Resource URI protection is disabled
  .description = Websites can access { -brand-short-name } internal resources

security-privacy-issue-warning-worker-mime =
  .label = Worker MIME type restriction is disabled
  .description = Content not hosted as Javascript may be run in a worker

security-privacy-issue-warning-top-level-data-uri =
  .label = Data URI navigations are not blocked
  .description = Phishing sites may use this technique to trick you into entering your information

security-privacy-issue-warning-active-mixed-content =
  .label = Active mixed content is not blocked
  .description = Network attackers can inject malicious scripts into some pages you visit

security-privacy-issue-warning-inner-html-ltgt =
  .label = HTML attribute sanitization is disabled
  .description = Attackers can inject Javascript through HTML tag attributes

security-privacy-issue-warning-file-uri-origin =
  .label = File URI strict origin policy is disabled
  .description = Local files in the same folder can share information with each other

## DNS-Over-HTTPS

preferences-doh-overview-default =
    .label = Default
    .description = Use secure DNS in regions where it’s available

preferences-doh-overview-custom =
    .label = Custom
    .description = You control when to use secure DNS and choose your provider.

preferences-doh-overview-off =
    .label = Off
    .description = Use your default DNS resolver

preferences-doh-advanced-button =
    .label = Advanced settings

preferences-doh-advanced-section =
    .label = Advanced settings
    .description = Domain Name System (DNS) over HTTPS sends your request for a domain name through an encrypted connection, providing a secure DNS and making it harder for others to see which website you’re about to access.

preferences-doh-manage-exceptions2 =
    .label = Manage exceptions
    .accesskey = x

preferences-doh-radio-default =
    .label = Default (when available)
    .description = Use secure DNS in regions where it’s available

preferences-doh-radio-custom =
    .label = Custom (always on)

preferences-doh-radio-off =
    .label = Off
    .description = Use your default DNS resolver

preferences-doh-fallback-label =
    .label = Always fallback to default DNS
    .description = Fall back to your default DNS resolver if there is a problem with secure DNS

preferences-doh-status-item-off =
    .message = DNS-over-HTTPS is off

## Variables:
##   $reason (string) - A string representation of the reason DoH is not active. For example NS_ERROR_UNKNOWN_HOST or TRR_RCODE_FAIL.
##   $name (string) - The name of the DNS over HTTPS resolver. If a custom resolver is used, the name will be the domain of the URL.

preferences-doh-status-item-not-active =
    .message = DNS-over-HTTPS is not working because we encountered an error ({ $reason }) while trying to use the provider { $name }

preferences-doh-status-item-not-active-bad-url =
    .message = DNS-over-HTTPS is not working because we received an invalid URL ({ $reason })

preferences-doh-status-item-active =
    .message = DNS-over-HTTPS is using the provider { $name }

preferences-doh-status-item-not-active-local =
    .message = DNS-over-HTTPS is not working because we encountered an error ({ $reason }) while trying to use the local provider { $name }

preferences-doh-status-item-active-local =
    .message = DNS-over-HTTPS is using the local provider { $name }

preferences-doh-select-resolver-label =
    .label = Choose provider

# Variables:
#   $name (String) - Display name or URL for the DNS over HTTPS provider
connection-dns-over-https-url-item =
    .label = { $name }
    .tooltiptext = Use this provider for resolving DNS over HTTPS

preferences-doh-custom-provider-label =
    .aria-label = Enter a custom provider URL

preferences-doh-header2 =
  .heading = DNS over HTTPS

## ETP status section

preferences-etp-status-header =
    .label = Enhanced Tracking Protection
    .description = Some sites use trackers to learn what you do online. { -brand-short-name } blocks many of them automatically to protect your privacy while you browse.

preferences-etp-level-standard =
    .label = Standard (default)
    .description = Blocks known trackers and cookies, helping protect your privacy without affecting most websites’ functionality.

preferences-etp-level-strict =
    .label = Strict
    .description = Stronger protection, but may cause some sites or content to break.

preferences-etp-level-custom =
    .label = Custom
    .description = Choose which trackers and scripts to block.

preferences-etp-status-advanced-button =
    .label = Advanced settings

preferences-etp-status-protections-dashboard-link =
        .label = View your personalized Protections Dashboard
        .description = See how many creepers { -brand-short-name } has blocked for you, including social media trackers, fingerprinters, and cryptominers.

preferences-etp-header =
    .heading = Enhanced Tracking Protection
    .description = Aut voluptates deleniti ut. Aut et praesentium voluptas dolore nostrum occaecati.

preferences-etp-advanced-settings-group =
    .label = Advanced settings
    .description = Trackers follow you around online to collect information about your browsing habits and interests. { -brand-short-name } blocks many of these trackers and other malicious scripts.

preferences-etp-customize-button =
    .label = Customize


preferences-etp-reload-tabs-hint =
    .message = Reload your tabs to apply these changes.
preferences-etp-reload-tabs-hint-button =
  .label = Reload all tabs

preferences-etp-rfp-warning-message =
    .message = You’re using Resist Fingerprinting (RFP), which replaces some of { -brand-short-name }’s fingerprinting protection settings. This might cause some sites to break.

preferences-etp-level-warning-message =
    .heading = Heads up
    .message = Your settings may cause some websites to not display content or work correctly. If a site seems broken, you may want to turn off tracking protection for that site to load all content.

preferences-etp-manage-exceptions-button =
    .label = Manage exceptions
    .description = Manage websites where Enhanced Tracking Protection is disabled.

preferences-etp-customize-header =
    .heading = Customize privacy protection
    .description = Aut voluptates deleniti ut. Aut et praesentium voluptas dolore nostrum occaecati.

preferences-etp-reset =
    .label = Reset
    .description = Aut voluptates deleniti ut. Aut et praesentium voluptas dolore nostrum occaecati. Fugit soluta dolor aut soluta sapiente ut vel.


preferences-etp-reset-standard-button =
    .label = Reset to standard

preferences-etp-reset-strict-button =
    .label = Reset to strict

preferences-etp-custom-control-group =
    .label = Tracking protection

preferences-etp-custom-cookies-enabled =
    .label = Cookies
    .description = Description

preferences-etp-custom-cookie-behavior =
    .aria-label = { preferences-etp-custom-cookies-enabled.label }

preferences-etpc-custom-cookie-behavior-accept-all =
    .label = Allow all cookies

preferences-etp-custom-tracking-protection-enabled =
    .label = Tracking content
    .description = Description

preferences-etp-custom-tracking-protection-enabled-context =
    .aria-label = { preferences-etp-custom-tracking-protection-enabled.label }

preferences-etp-custom-crypto-mining-protection-enabled =
    .label = Cryptominers

preferences-etp-custom-known-fingerprinting-protection-enabled =
    .label = Known fingerprinters

preferences-etp-custom-suspect-fingerprinting-protection-enabled =
    .label = Suspected fingerprinters
    .description = Description

preferences-etp-custom-suspect-fingerprinting-protection-enabled-context =
    .aria-label = { preferences-etp-custom-suspect-fingerprinting-protection-enabled.label }

## Relay integration

preferences-privacy-relay-available =
    .label = Suggest { -relay-brand-name } email masks
    .description = Hides your real email address to protect your inbox from spam.

## Additional protections

do-not-track-removal3 =
    .message = We no longer support the “Do Not Track” feature

non-technical-privacy-heading =
    .label = Website Privacy Preferences

## Site Data

sitedata-heading =
    .label = Browsing data
    .description = Manage your cookies, history, cache, website data, and more.

sitedata-settings3 =
    .label = Clear data for specific sites
    .accesskey = s

sitedata-cookies-exceptions3 =
    .label = Manage exceptions
    .accesskey = x
    .description = Choose how specific sites handle cookies and site data.

## History

history-header2 =
    .heading = History

history-section-header =
    .label = History
    .description = Choose what you want { -brand-short-name } to remember when you close the browser.

history-custom-section-header =
    .label = Advanced settings
    .description = Customize what you want { -brand-short-name } to remember when you close the browser.

history-custom-button =
    .label = Choose what you want { -brand-short-name } to remember
