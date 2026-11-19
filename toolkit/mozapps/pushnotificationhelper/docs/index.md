# Push notification helper

The push notification helper lets web push notifications reach the user while
Firefox is closed. It's a small Windows program, `notification-helper.exe`,
that keeps a connection to the push server (autopush) open on behalf of a
profile. When a push message arrives, it launches Firefox in the background so
the Push service can deliver the message to its service worker, which can then
show a notification.

The helper is Windows only for now. It's built when `MOZ_PUSH_NOTIFICATION_HELPER`
is set, which is the default on Windows. `--disable-push-notification-helper`
turns it off.

## Components

In `toolkit/mozapps/pushnotificationhelper/`:

- `src/`: the Rust source of `notification-helper.exe`.
  - `main.rs`: argument parsing, the main loop and launching Firefox.
  - `lifecycle.rs`: the named Windows objects that make sure only one helper
    runs per profile and that let other processes stop it.
  - `pushconnection.rs`: the WebSocket connection to autopush, built on WinHTTP.
  - `preferences.rs`: reads and updates the profile's `prefs.js`.
- `PushNotificationHelper.sys.mjs`: decides whether a helper should run, based
  on prefs.
- `WindowsPushNotificationHelper.sys.mjs`: starts and stops the helper on
  Windows.
- `PushNotificationHelperRegistry.sys.mjs`: records running helpers in the
  registry, so the installer can restart them after an update.

In `toolkit/components/push/`:

- `PushCommandLineHandler.sys.mjs`: handles the `--receive-push-messages`
  argument that the helper passes when it launches Firefox.

## Workflow

1. On startup, Firefox calls `PushNotificationHelper.init()` from the
   `browser-idle-startup` category.
2. If the helper is allowed and enabled (see [Preferences](#preferences)),
   `WindowsPushNotificationHelper.start()` launches
   `notification-helper.exe --profile <profile directory>` as a hidden, detached
   process, and records it in the registry. Otherwise it asks any helper for
   this profile to stop.
3. The helper outlives the Firefox session that started it. It checks whether
   Firefox is running with its profile. While Firefox is running, Firefox's own
   Push service talks to autopush, so the helper does nothing.
4. When Firefox isn't running, the helper connects to autopush with the
   profile's push identity (see
   [Connection to autopush](#connection-to-autopush)) and waits for a message.
5. When autopush sends a notification, the helper closes the connection and
   runs `firefox.exe --receive-push-messages --profile <profile directory>`.
6. `PushCommandLineHandler.sys.mjs` keeps Firefox running without opening a
   window. The Push service connects to autopush, receives the pending
   messages and dispatches them to their service workers.
7. Once no messages have arrived for a while and all received messages have
   been handled, Firefox exits. The helper sleeps for the check interval
   (60 seconds by default) and goes back to step 3.

## One helper per profile

Firefox starts the helper on every launch while it's enabled, so finding one
already running is the normal case. Each helper takes a named mutex for its profile when it
starts. If the mutex already exists, another helper is serving that profile, so
the new one exits with success. The mutex is released when the process exits.

A helper serves exactly one profile, and a profile has at most one helper,
even when several installations use it. The first helper to start wins,
whichever installation it belongs to. Different profiles can each have their
own helper at the same time.

The names of the Windows objects are built from a hash of these paths:

- `Local\MozillaNotificationHelper-profile-<hash>`: the per profile mutex. Its
  hash only covers the profile directory, so it's shared by every
  installation.
- `Local\MozillaNotificationHelper-stop-<hash>`: the per profile stop event.
  Its hash covers the installation directory and the profile directory.
- `Global\MozillaNotificationHelper-stop-<hash>`: the stop event shared by all
  helpers of an installation. Its hash only covers the installation directory.

Paths are canonicalized before hashing, so different spellings of the same
directory map to the same objects.

## Detecting a running Firefox

The helper doesn't talk to Firefox. It checks the profile's `parent.lock` file
instead. Firefox keeps this file open without sharing while it uses the
profile, so if the helper can't open it, Firefox is running.

The helper only checks between connections. If Firefox starts while the helper
is connected to autopush, the helper keeps its connection until the server
closes it or a notification arrives. In the second case it launches Firefox
again, and the already running Firefox ignores the extra command line.

The helper finds `firefox.exe` from the `LastPlatformDir` entry in the
profile's `compatibility.ini`, or else from its own directory. It also uses
`compatibility.ini` to check that `--profile` names a real profile directory.

## Connection to autopush

The helper reads two prefs from the profile's `prefs.js`:

- `dom.push.userAgentID`: the push identity (UAID) of the profile. Without it,
  the helper doesn't connect.
- `dom.push.serverURL`: the autopush URL. It defaults to
  `wss://push.services.mozilla.com/`.

It opens a WebSocket to that URL with WinHTTP, honoring the system proxy
settings, and sends a `hello` message with the profile's UAID, like Firefox's
Push service does. Then it waits for messages:

- `hello`: the server's reply. If it carries a different UAID, the helper
  writes the new value to `prefs.js`, so Firefox uses it next time.
- `notification`: a push message is waiting. The helper closes the connection
  and launches Firefox. It never acknowledges the message, so autopush keeps it
  and delivers it again to Firefox's Push service.
- The server closing the connection: the helper goes back to its check loop.

The helper only knows that a message is waiting. It can't decrypt it or tell
which site or service worker it's for. All of that happens in Firefox.

After each pass of the loop, whether it connected or not, the helper sleeps
for the check interval before checking again. The interval defaults to 60
seconds. The `FX_NOTIFICATION_HELPER_CONNECTION_CHECK_TIMEOUT_SECS` environment
variable overrides it, which is useful when testing.

## Receiving messages in Firefox

`PushCommandLineHandler.sys.mjs` only acts when `--receive-push-messages` is on
the command line of a new Firefox process. It prevents the default window and
keeps Firefox alive while it waits for the Push service.

There's no way to know how many messages are pending, so it waits until they
stop arriving:

- `app.backgroundNotifications.receivePushMessages.perMessageTimeoutMs`
  (default 5 seconds) restarts on every message. When it expires, receiving
  stops.
- `app.backgroundNotifications.receivePushMessages.totalTimeoutMs` (default 60
  seconds) never restarts, so a stream of messages can't keep Firefox alive
  forever. When it expires, new messages are ignored and left on the server for
  the next time.

A message counts as pending until its `push-message-handled` notification
fires, which happens after its service worker's push event settles. Receiving
doesn't stop while any message is pending. Then Firefox exits.

## Stopping the helper

`notification-helper.exe --stop --profile <profile directory>` signals the per
profile stop event, so only that profile's helper exits.
`notification-helper.exe --stop` signals the installation's shared event, so
every helper of that installation exits. Both succeed when no helper is
running.

Stop events stay per installation. If a helper from another installation
serves the profile, neither command stops it.

The shared event lives in the `Global\` namespace and any authenticated user
can signal it. This lets the installer stop the helpers even when it runs
elevated or as a different user.

These are the callers:

- `WindowsPushNotificationHelper.stop()` stops the profile's helper when the
  helper is turned off. It only does so if the helper is recorded in the
  registry, so profiles that never had a helper don't launch a process on every
  startup.
- The full installer, the stub installer and the uninstaller stop every helper
  of the installation before they check for files in use or remove files
  (`SignalPushNotificationHelperStop`).

## Restarting after an update

`PushNotificationHelperRegistry.sys.mjs` keeps one registry value per running
helper under `HKCU\Software\<vendor>\<app name>\Notification Helper`, which is
`HKCU\Software\Mozilla\Firefox\Notification Helper` for Firefox. The value
name is `<install directory>|<profile directory>`. On every start and stop,
values of the current installation whose profile directory no longer exists
are removed.

After an update, the `PostUpdate` step of the installer starts a helper for
every entry of its installation (`StartPushNotificationHelpers`). This runs in
the non-elevated part of `PostUpdate`, so the helpers run as the user.

Helpers aren't restarted when Windows restarts. They come back the next time
Firefox runs with their profile.

## Preferences

- `app.backgroundNotifications.helper.available`: whether the feature is
  available at all. Nimbus sets it through the `pushNotificationHelper` feature
  in `FeatureManifest.yaml`.
- `app.backgroundNotifications.helper.enabled`: the user's choice.

The helper runs only when both are `true`. Both default to `false`, and
`PushNotificationHelper` starts or stops the helper as soon as either one
changes.

`app.backgroundNotifications.helper.loglevel` controls the logging of the
JavaScript modules.

## Telemetry

The metrics are defined in `toolkit/mozapps/pushnotificationhelper/metrics.yaml`
under the `background_notification_helper` category. They count how often the
user turns the helper on or off, how often it wakes Firefox, and how many
messages and notifications each wake delivers.

## Tests

- `./mach rusttests` runs the Rust unit tests in `src/`.
- `toolkit/mozapps/pushnotificationhelper/tests/xpcshell/` tests the JavaScript
  modules.
- `toolkit/components/push/test/browser/` tests the `--receive-push-messages`
  handler.
