Components
==========

This page summarizes the main components and how to extend the system safely.

The implementation is split into two directories:

* ``toolkit/components/ipprotection`` — platform-independent core (state machine,
  proxy/network stack, core helpers).
* ``browser/components/ipprotection`` — desktop-specific UI layer (panel, toolbar
  button, alert/infobar managers, onboarding helpers).

Component Diagram
-----------------

A diagram of all the main components is the following:

.. mermaid::
   :align: center
   :caption: IP Protection architecture

   flowchart LR

     %% browser/components/ipprotection
     subgraph Browser["browser/components/ipprotection (UI layer)"]
       IPProtection
       IPProtectionPanel

       subgraph BrowserHelpers["Browser Helpers"]
         UIHelper["UI Helper"]
         IPPOnboardingMessage["Onboarding Message"]
         IPPOptOutHelper["Opt-Out Helper"]
         IPPUsageHelper["Usage Helper"]
         IPProtectionAlertManager["Alert Manager"]
         IPProtectionInfobarManager["Infobar Manager"]
       end
     end

     %% toolkit/components/ipprotection
     subgraph Toolkit["toolkit/components/ipprotection (core)"]
       IPProtectionService
       IPProtectionActivator

       subgraph CoreHelpers["Core Helpers"]
         IPPStartupCache["Startup Cache Helper"]
         IPPSignInWatcher["Sign-in Observer"]
         IPProtectionServerlist
         IPPEnrollAndEntitleManager["Enroll & Entitle Manager"]
         IPPProxyManager
         IPPAutoStart["Auto-Start Helper"]
         IPPAutoRestoreHelper["Auto-Restore Helper"]
         IPPNimbusHelper["Nimbus Eligibility Helper"]
         IPPExceptionsManager
       end

       subgraph Proxy["Proxy stack"]
         IPPChannelFilter
         IPPNetworkErrorObserver
         GuardianClient
       end
     end

     %% Activator wiring
     BrowserHelpers -- "addHelpers()" --> IPProtectionActivator
     IPProtectionActivator --> IPProtectionService
     IPProtectionActivator --> CoreHelpers

     %% Service wiring
     IPProtectionService --> GuardianClient
     IPProtectionService --> CoreHelpers

     %% UI wiring
     IPProtection --> IPProtectionPanel
     IPProtection --> IPProtectionService

     %% Proxy wiring
     IPPProxyManager --> IPPChannelFilter
     IPPProxyManager --> IPPNetworkErrorObserver
     IPPNetworkErrorObserver -- "error events (401)" --> IPPProxyManager


Toolkit components (``toolkit/components/ipprotection``)
---------------------------------------------------------

GuardianClient
  Manages communication between Firefox and the Guardian backend. It retrieves
  account information, obtains the token for the proxy, and exposes the server list.

IPPChannelFilter
  Main network component. It processes network requests and decides which ones
  should go through the proxy.

IPPProxyManager
  Implements the proxy activation/deactivation and exposes the current status.

IPProtectionService
  The main service. It is initialized during browser startup, initializes helpers
  and other components, and implements the state machine that drives the feature.

IPProtectionActivator
  Entry point that assembles the full helper list and initialises
  ``IPProtectionService``.  It owns the ordered list of core helpers and exposes
  ``addHelpers()`` so that the browser layer can register additional,
  browser-specific helpers before ``init()`` is called.

IPPExceptionsManager
  Manages the exceptions logic (for example, domain exclusions) in coordination
  with the panel and preferences.

Additional proxy/telemetry components
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

IPProtectionServerlist
  Provides the available proxy endpoints (server list) to the proxy manager.

IPPNetworkErrorObserver
  Observes network errors related to the proxy and notifies the proxy manager
  (for example, authentication or connectivity failures).

Core helpers
~~~~~~~~~~~~

The core helper list is defined in ``IPProtectionActivator.sys.mjs`` (toolkit).

IPPAutoStart
  Activates the proxy at startup time when auto-start is enabled.

IPPAutoRestoreHelper
  Restores the proxy state after a crash or restart when auto-restore is enabled.

IPPSignInWatcher
  Observes user authentication state. It informs the state machine when the user
  signs in or out.

IPPStartupCache
  Exposes cached information to keep the state machine responsive during startup
  (last known state and entitlement JSON object).

IPPNimbusHelper
  Monitors the Nimbus feature (``NimbusFeatures.ipProtection``) and triggers a
  state recomputation on updates.

IPPEnrollAndEntitleManager
  Orchestrates the user enrollment flow with Guardian and updates the service
  when enrollment status changes.

Browser components (``browser/components/ipprotection``)
---------------------------------------------------------

IPProtection
  Manages the UI integration and interactions with the panel.

IPProtectionPanel
  Controls the feature's panel UI.

IPProtectionHelpers
  Registers browser-specific helpers with ``IPProtectionActivator`` via
  ``addHelpers()``: ``UIHelper``, ``IPPOnboardingMessage``, ``IPPOptOutHelper``,
  ``IPPUsageHelper``, ``IPProtectionAlertManager``, and ``IPProtectionInfobarManager``.

UIHelper
  Shows and hides the UI based on the current state machine state.

IPPOptOutHelper
  Handles the user opt-out flow and clears stored state accordingly.

IPPOnboardingMessage
  Handles the onboarding message flow for new users.

IPPUsageHelper
  Tracks bandwidth usage warning state and fires state-change events when
  usage crosses the 75% or 90% thresholds.

IPProtectionAlertManager
  Manages alert notifications related to IP Protection.

IPProtectionInfobarManager
  Manages infobar notifications displayed to the user.

How to implement new components
-------------------------------

Do not modify the state machine. New functionality should be added via helper
classes to keep the core simple and robust.

Recommended steps:

1. Decide whether the helper belongs in the **toolkit** layer (no UI, no chrome
   dependency) or the **browser** layer (UI or chrome integration required).
2. Create a helper class with the methods ``init()``, ``initOnStartupCompleted()``
   and ``uninit()`` as appropriate for lifecycle needs.
3. If your helper reacts to state changes, listen to the
   ``IPProtectionService:StateChanged`` event.
4. Register your helper:

   * **Toolkit helpers**: add it to the ``coreHelpers`` array in
     ``toolkit/components/ipprotection/IPProtectionActivator.sys.mjs``.
   * **Browser helpers**: call ``IPProtectionActivator.addHelpers([...])`` in
     ``browser/components/ipprotection/IPProtectionHelpers.sys.mjs``.

   Be mindful of ordering if your helper depends on others. For example,
   ``IPPNimbusHelper`` is registered last to avoid premature state updates
   triggered by Nimbus' immediate callback.
5. If your component needs to recompute the service state, call
   ``IPProtectionService.updateState()`` after updating the helper data it
   relies on; the recomputation is synchronous.
