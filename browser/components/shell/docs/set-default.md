# Set Default

## Default Browser

Windows defines the default browser as the browser set to default for .htm(l) files and http(s) protocols.

## Implementations

The control flow for setting default browser is as follows:

```{mermaid}
sequenceDiagram
  autonumber
  participant Shell as ShellService
  participant Agent as nsIDefaultAgent
  participant WinShell as nsIWindowsShellService


  Shell->>Agent: setDefaultBrowserUserChoiceAsync
  Agent-->>Shell: ... if set default via UserChoice fails...

  Shell->>WinShell: setDefaultBrowser
```

The reason for the `nsIDefaultAgent`/`nsIWindowsShellService` split is mostly historical[^footnote-1] and could be consolidated under `nsIWindowsShellService::setDefaultBrowser`.

### UserChoice

`UserChoice` is the name for Windows Registry keys recording default file and protocol handlers. The associated registry keys can be found under `HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\[protocol]\UserChoice` and `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\[filetype]\UserChoice`. The default is stored under the key's `ProgId` value, and is an AUMID registered to the application for file/protocol handling.

Our implementation of set default via User Choice is exposed by `nsIDefaultAgent`. Where available, this API allows for setting the default without system confirmation prompts, and therefore must only be used with user consent.

#### UserChoice Lockdown

Microsoft has iteratively made setting default via `UserChoice` increasingly difficult over time. As such it is no longer viable to use this in modern releases of Windows 11. Interventions are as follows, ordered by their introduction.

Sibling to the `ProgId` value is `Hash`, which is computed based on the modification time of the `ProgId` value. Where present `Hash` must be updated when `ProgId` is set to prevent the system from unsetting the default.

Specifically for file handlers, `UserChoice` keys have Set Value permissions set to DENY for the owning user. To modify a `UserChoice` key, we can either change the Set Value permission or delete and recreate the key. Our implementation deletes and recreates the key.

UserChoice Protection Driver (UCPD) prevents modification of select `UserChoice` registry keys. Notable inclusions are http(s) and .pdf, though htm(l) are excluded.

Early UCPD releases did not block some scriptable Microsoft utilities such as powershell, regedit, etc. Since then the set of Microsoft signed applications allowed to modify locked keys has been restricted.

The UCPD locking mechanism is based on the key path. Initially only `UserChoice` itself was locked, which allowed modification by renaming an ancestor. Today all ancestors of `UserChoice` are locked.

### Windows Settings

Setting default via opening Windows Settings is implemented in `nsWindowsShellService`. The UI for this has notably changed between Windows 10 and 11, the former having a setting per file/protocol and the latter introducing a "Set default" button to set the default browser. When setting default via Windows Settings, we issue a [`deeplinkedToWindowsSettingsUI`](/toolkit/components/messaging-system/docs/TriggerActionSchemas/index.md#deeplinkedtowindowssettingsui) Message Trigger.

[^footnote-1]: Previously setting default via the User Choice implementation was handled in `default-browser-agent.exe`. When most of the [Default Agent](/toolkit/mozapps/defaultagent/default-browser-agent/index.md) was ported to a [Firefox Background Task](/toolkit/components/backgroundtasks/index.md), the native implementation was wrapped in `nsIDefaultAgent` and a User Choice interface was exposed and used within `firefox.exe` directly.
