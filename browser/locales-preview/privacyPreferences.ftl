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
  .description = Allowing fingerprinters may allow you to be tracked without cookies

security-privacy-issue-warning-third-party-cookies =
  .label = Third-party cookies are enabled
  .description = Third-party cookies are often used to track users across sites

security-privacy-issue-warning-password-manager =
  .label = Password manager is disabled
  .description = Password managers help you use strong passwords for all of your online accounts

security-privacy-issue-warning-popup-blocker =
  .label = Popup blocker is disabled
  .description = Popups are annoying and can be deceptive

security-privacy-issue-warning-extension-install =
  .label = Websites can install extensions
  .description = Extensions are a powerful feature, and not just every website should install them without asking

security-privacy-issue-warning-safe-browsing =
  .label = Dangerous and deceptive content is not blocked
  .description = Some websites are known to serve malware or phishing pages, and we can block them for you

security-privacy-issue-warning-doh =
  .label = DNS over HTTPS is disabled
  .description = DNS over HTTPS helps hide what websites you visit from your network provider

security-privacy-issue-warning-ech =
  .label = Encrypted Client Hello is disabled
  .description = Encrypted Client Hello helps hide what websites you visit from your network provider

security-privacy-issue-warning-ct =
  .label = Certificate Transparency is disabled
  .description = Rogue certificates allows attackers to intercept traffic, and certificate transparency helps stop them

security-privacy-issue-warning-crlite =
  .label = Certificate revocation is disabled
  .description = Some certificates can become insecure, so websites need to make their certificates no longer valid

security-privacy-issue-warning-certificate-pinning =
  .label = Certificate pinning is disabled
  .description = Rogue certificates allow attackers to intercept traffic, and certificate pinning helps stop them

security-privacy-issue-warning-tlsmin =
  .label = Unsafe TLS versions are enabled
  .description = Old TLS versions may allow attackers to read and modify your traffic

security-privacy-issue-warning-tlsmax =
  .label = The latest TLS version is disabled
  .description = TLS is how we encrypt your network traffic, and the latest version is the best security we have to offer

security-privacy-issue-warning-proxy-autodetection =
  .label = Proxy auto-configuration is enabled
  .description = Proxy auto-configuration could allow untrusted networks to monitor your web activity

security-privacy-issue-warning-priveleged-constraint =
  .label = Priveleged context hardening is disabled
  .description = We disable some web features inside of { -brand-short-name } to protect against attacks against your browser

security-privacy-issue-warning-process-sandbox =
  .label = Process sandbox features are disabled
  .description = We disable featues for different parts of { -brand-short-name } that don`t need them

security-privacy-issue-warning-content-resource-uri =
  .label = Resource URI protection is disabled
  .description = Some { -brand-short-name } internal resources should not be available to every website you visit

security-privacy-issue-warning-worker-mime =
  .label = Worker MIME type restriction is disabled
  .description = Workers should only be allowed to run content intended to be run as Javascript

security-privacy-issue-warning-top-level-data-uri =
  .label = Data URI navigations are not blocked
  .description = Phishing websites sometimes navigate to data: URIs to trick you into entering your information

security-privacy-issue-warning-active-mixed-content =
  .label = Active mixed content is not blocked
  .description = Websites that load scripts over HTTP are vulnerable to network attackers injecting Javascript to pages you visit

security-privacy-issue-warning-inner-html-ltgt =
  .label = HTML attribute sanitization is disabled
  .description = Attackers may try to inject Javascript into a page through the HTML tag attributes

security-privacy-issue-warning-file-uri-origin =
  .label = File URI strict origin policy is disabled
  .description = Files loaded in { -brand-short-name } should be cross-origin from files in the same folder
