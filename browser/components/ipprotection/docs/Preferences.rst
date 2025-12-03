Preferences
===========

This document describes preferences affecting Firefox's IP Protection.
These preferences are normally hidden and should not be used unless you really
know what you are doing.

Feature enablement and experiments
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``browser.ipProtection.enabled`` (boolean, default: ``false``)
  Master feature toggle controlled by Nimbus and testing harnesses.

``browser.ipProtection.userEnabled`` (boolean, default: ``false``)
  For testing; simulates user‑enabled state.

``browser.ipProtection.variant`` (string, default: ``""``)
  Stores the current UI experiment variant. The value is passed to
  ``IPProtectionPanel`` to render variant-specific strings and layouts.

``browser.ipProtection.added`` (boolean, default: ``false``)
  Tracks whether the toolbar button was auto-placed next to the FxA button.
  Once true, the widget is not reinserted automatically after manual removal.

Startup and caching
~~~~~~~~~~~~~~~~~~~

``browser.ipProtection.autoStartEnabled`` (boolean, default: ``false``)
  Enables the auto-start helper so the proxy connects during browser startup.

``browser.ipProtection.stateCache`` (string, default: ``""``)
  Caches the latest ``IPProtectionStates`` value for use during startup.

``browser.ipProtection.entitlementCache`` (string, default: ``""``)
  Cached entitlement JSON string used during startup to avoid network requests.

``browser.ipProtection.locationListCache`` (string, default: ``""``)
  Cached Guardian location list shared between ``IPProtectionService`` and
  ``GuardianClient``.

``browser.ipProtection.cacheDisabled`` (boolean, default: ``false``)
  Turns off all startup caches. Used primarily by xpcshell tests.

Networking and routing
~~~~~~~~~~~~~~~~~~~~~~

``browser.ipProtection.guardian.endpoint`` (string, default: ``"https://vpn.mozilla.org/"``)
  Endpoint for the server‑side infrastructure.

``browser.ipProtection.productVpn.endpoint`` (string, default: ``"https://www.mozilla.org/"``)
  Endpoint for the production mozilla webservice.

``browser.ipProtection.mode`` (integer, default: ``0``)
  Selects which requests are proxied by ``IPPChannelFilter``:
  ``0`` routes all traffic (``MODE_FULL``), ``1`` only private browsing windows
  (``MODE_PB``), ``2`` only requests classified as tracking (``MODE_TRACKER``).

``browser.ipProtection.exceptionsMode`` (string, default: ``"all"``)
  Defines which network requests are processed. Default: all.

``browser.ipProtection.domainExclusions`` (string)
  Comma‑separated list of domains to exclude from the proxy.

Diagnostics
~~~~~~~~~~~

``browser.ipProtection.log`` (boolean, default: ``false``)
  Enable/disable logging.

``browser.ipProtection.panelOpenCount`` (integer, default: ``0``)
  Counts the number of times the VPN panel is opened.
