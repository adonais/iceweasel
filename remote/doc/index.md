# Remote Protocols

Firefox supports several remote protocols, which allow to inspect and control
the browser, usually for automation purposes:

- {ref}`marionette-header`
- {ref}`webdriver-bidi-header`

## Common documentation

The following documentation pages apply to all remote protocols

```{toctree}
:maxdepth: 1

Building.md
Debugging.md
Prefs.md
Testing.md
CodeStyle.md
Security.md
PuppeteerVendor.md
```

## Protocols

(marionette-header)=

### Marionette

Marionette is used both by internal tools and testing solutions, but also by
geckodriver to implement the [WebDriver (HTTP) specification]. The documentation
for Marionette can be found under [testing/marionette].

(webdriver-bidi-header)=

### WebDriver BiDi

[The WebDriver BiDi specification](https://w3c.github.io/webdriver-bidi)
extends WebDriver HTTP to add bidirectional communication.

```{toctree}
:maxdepth: 1

webdriver-bidi/Extensions.md
```

## Architecture

### Message Handler

The documentation for the framework used to build WebDriver BiDi modules can be
found at [remote/messagehandler].

## Bugs

Bugs are tracked under the [Remote Protocol product].

## Communication

See [Communication] on [our project wiki].

[communication]: https://wiki.mozilla.org/Remote#Communication
[our project wiki]: https://wiki.mozilla.org/Remote
[remote protocol product]: https://bugzilla.mozilla.org/describecomponents.cgi?product=Remote%20Protocol
[remote/messagehandler]: messagehandler/
[testing/marionette]: /testing/marionette
[webdriver (http) specification]: https://w3c.github.io/webdriver/
