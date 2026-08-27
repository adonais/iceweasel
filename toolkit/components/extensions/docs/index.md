# WebExtensions API Development

This documentation covers the implementation of WebExtensions inside Firefox.
Documentation about existing WebExtension APIs and how to use them
to develop WebExtensions is available
[on MDN](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

To use this documentation, you should already be familiar with
WebExtensions, including
[the anatomy of a WebExtension](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Anatomy_of_a_WebExtension)
and [permissions](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/manifest.json/permissions).
You should also be familiar with concepts from
[Firefox development](https://developer.mozilla.org/en-US/docs/Mozilla/Developer_guide)
including [e10s](https://developer.mozilla.org/en-US/Firefox/Multiprocess_Firefox)
in particular.

```{toctree}
:caption: WebExtension API Developers Guide
:maxdepth: 2

background
basics
schema
functions
events
manifest
lifecycle
incognito
webidl_bindings
webext-storage
other
reference
native-messaging-portal-design
```
