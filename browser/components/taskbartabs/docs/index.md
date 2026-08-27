# Web Apps in Firefox

Web Apps in Firefox — also referred to as Taskbar Tabs in-source — is a feature that allows pinning a simplified and site stylized browser window to the taskbar (or system equivalent). This is analagous to what is often referred to as Progressive Web Apps (PWAs).

The feature is enabled by the preference `browser.taskbarTabs.enabled`, which is currently enabled by default on Windows. To create a web app, click on the 'Add tab to taskbar' button on the URL bar, which will create a new window and prompt to pin it to your taskbar. Remove the web app by clicking the 'Remove tab from taskbar' button, which'll turn it back into a normal tab and (if that was the last window) unpin it from your taskbar.

:::{note}
Currently, Web Apps are available on Windows (both MSIX and non-MSIX, enabled by default) and Linux (unsandboxed and under Flatpak, disabled by default).

macOS support is not currently available. macOS assumes that two different visible applications will be in two different processes; however, web apps are in the same profile and process as the rest of the browser, so the Dock isn't able to distinguish them. There are some workarounds, like creating the window in a different process and ferrying events across, but it's a sufficient challenge that it hasn't been done yet.
:::

Internally, they're called 'taskbar tabs' after the initial design which made an analogy to pinned tabs being on your taskbar. The feature is called 'web apps' instead of PWAs (Progressive Web Apps) as implemented in Chromium for two reasons:

* 'PWA' is a vague term, referring to both APIs to support web apps (many of which Firefox supports) and the ability to install them.
* Firefox Web Apps, by design, still appear like a browser instead of appearing as a completely separate application like most PWA implementations.

Firefox Web Apps keeps information about each web app in `taskbartabs/taskbartabs.json` inside the user's profile. This file is intended for use internally by Firefox; if you change it, things might not work properly. It follows the JSON schema in {searchfox}`TaskbarTabs.schema.1.json <browser/components/taskbartabs/TaskbarTabs.1.schema.json>`. Refer to {searchfox}`TaskbarTabsRegistry.sys.mjs <browser/components/taskbartabs/TaskbarTabsRegistry.sys.mjs>` for information on what each property is used for.

```{toctree}
:maxdepth: 1

architecture
```

## External Interactions

### Web Apps and Profiles

Web Apps are tied to the profile they are created with, therefore web app pages have the same access, controls, and add-ons as a normal tab.

### Web Apps and Containers

Web apps are tied to the container — also referred to as Contextual Identity in-source — they are created with. When launching a Web App via the taskbar it will reopen in this tied to container. This affords users the ability to isolate sites without requiring a new profile per Web App.

### Web Apps and Session Restore

Web Apps are similar to Private Windows in that they are not tied to the lifetime of normal browser session restore. Web App windows are not restore for users who have enabled "Open previous windows and tabs", and will not prevent the restoration of windows restored by session restore.
