# Extensions

The WebDriver BiDi specification provides a flexible framework that allows browser vendors to define custom modules and arguments. This document outlines the Firefox-specific extensions implemented in WebDriver BiDi, including any custom functionality beyond the core specification.

## Modules

There are currently no custom modules defined in the Firefox implementation of WebDriver BiDi.

## Commands

Firefox provides additional commands for certain modules, as detailed in the list below.

### webExtension.moz:listExtensions

Returns an array of WebExtension information objects. Hidden extensions are
excluded. Non-hidden extensions are included even when disabled.

`policy` and `sourceURL` are only returned when `RemoteAgent.allowSystemAccess`
is `true`. Otherwise, both fields are omitted.

```CDDL
webExtension.ListExtensionsResult = {
   extensions: [*webExtension.ExtensionInfo],
}

webExtension.ExtensionInfo = {
   id: text,
   name: text,
   version: text,
   manifestVersion: uint,
   isActive: bool,
   isSystem: bool,
   hidden: bool,
   temporarilyInstalled: bool,
   ? sourceURL: text / null,
   ? policy: webExtension.ExtensionPolicyInfo / null,
}

webExtension.ExtensionPolicyInfo = {
   uuid: text,
   baseURL: text,
   extensionURL: text,
   backgroundScripts: [*text],
}
```

Description:

* `manifestVersion`: The manifest version used by the WebExtension. It stays
  available even when the WebExtension has no active `WebExtensionPolicy`.

* `hidden`: True if the WebExtension should not be shown to the user, for
  instance because it is provided by the application.

* `temporarilyInstalled`: True if the WebExtension is installed temporarily,
  ie. it will be uninstalled when the browser shuts down.

* `sourceURL`: The URL of the source the WebExtension was installed from,
  or `null` if unknown.

* `policy`: Details derived from the WebExtensionPolicy. It is `null` if the
  WebExtension has no active `WebExtensionPolicy`, for instance when the
  extension is disabled. `isActive` reflects the enabled state of the
  WebExtension.

Inside `policy`:

* `uuid`: The uuid used for the WebExtension's `moz-extension:` URLs.

* `baseURL`: The `file:` or `jar:` URL used as the base of the WebExtension's
  `moz-extension:` URL root.

* `extensionURL`: The root URL of the WebExtension's `moz-extension:`
  namespace, ie. `moz-extension://<uuid>/`.

* `backgroundScripts`: The paths of the WebExtension's background scripts,
  or an empty array if it has none.

## Parameters

Firefox provides additional parameters for certain commands, as detailed in the list below.

### webExtension.install

```CDDL
webExtension.InstallParameters = {
   extensionData: webExtension.ExtensionData,
   ? moz:allowPrivateBrowsing: bool .default false,
   ? moz:permanent: bool .default false,
}
```

Description:

* `moz:allowPrivateBrowsing`: When set to `true`, the web extension will be allowed in private browsing mode.

* `moz:permanent`: When set to `true`, the web extension will be installed permanently. This requires the extension to be signed. Unsigned extensions can only be installed temporarily, which is the default behavior.
