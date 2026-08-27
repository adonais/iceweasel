# [Android Components](../../../README.md) > Browser > Errorpages

Responsive browser error pages for Android apps.

## Usage

### Setting up the dependency

Use Gradle to download the library from [maven.mozilla.org](https://maven.mozilla.org/) ([Setup repository](../../../README.md#maven-repository)):

```Groovy
implementation "org.mozilla.components:browser-errorpages:{latest-version}"
```
### Quick Start

If you have an `ErrorType` already at hand, and you want to generate an error page for it with the default template:

```kotlin
val errorType: ErrorType = ErrorType.Unknown
ErrorPages.createErrorPage(context, errorType)

// OR

ErrorPages.createErrorPage(context, errorType, R.raw.custom_html, R.raw.custom_css)
```

If you want to use your own custom HTML template, make sure that you have the following attributes within percentage values (`%`) added to your document so that they can be populated by the engine:
- `pageTitle` - Title of the page.
- `css` - The location of where to place the CSS contents in the document.
- `messageShort` - A one line description of the error message
Gecko and System engines map their respective error codes to the `ErrorType` values.
- `messageLong` - A more detailed message about the error that was seen.
- `button` - Button text that can be clicked on. This is commonly used to reload the page.

For example, here is an HTML error page that will have only a title, short message and some CSS:

```html
<!DOCTYPE html>
<html>
    <head>
        <meta name="viewport" content="width=device-width; user-scalable=false;" />
        <title>%pageTitle%</title>
        <style>%css%</style>
    </head>
    <body>
        <div>
            <h1 class="errorTitleText">%messageShort%</h1>
        </div>
    </body>
</html>
```

Error Pages are also mostly used along with the `RequestInterceptor`, which can be added to an Engine's Settings:

```kotlin
val settings = DefaultSettings(
    requestInterceptor = RequestInterceptor {
        override fun onErrorRequest(
            session: EngineSession,
            errorType: ErrorType,
            uri: String?
        ): RequestInterceptor.ErrorResponse? =
             RequestInterceptor.ErrorResponse(ErrorPages.createErrorPage(context, errorType))
    }
)
GeckoEngine(settings)
```

See the `ErrorType` enum for the full list of supported error types.

### Archived-copy query parameters

When the consumer opts in via `createUrlEncodedErrorPage(archiveActionEnabled = true)` and the
error type and URL are eligible (see `ErrorPages.archiveUrlFor`), `createUrlEncodedErrorPage`
appends the following extra query parameters that a custom HTML template may consume to offer an
"archived version" action. They are absent when the action is disabled (the default) or not
applicable, so templates must treat them as optional:

- `archiveUrl` - A privacy-cleaned (scheme, host, port and path only) version of the failed URL
  to look up an archived copy for.
- `archiveCheckButtonLabel` - Localized label for the button that triggers the lookup.
- `archiveCheckingLabel` - Localized label shown while the lookup is in progress.
- `archiveNotFoundMessage` - Localized message shown when no archived copy was found.
- `archiveSearchWebLabel` - Localized label for the link that searches the web instead.
- `archiveUnreachableMessage` - Localized message shown when the archive service could not be reached.
- `archiveRetryLabel` - Localized label for the link that retries the lookup after the service was unreachable.

### Engine Support

If you want to add support for another engine, you need to support the `RequestInterceptor` and have it invoked with an `ErrorType` based on the `EngineSession`'s' error code for that request:

```kotlin
class CustomEngineSession(val interceptor: RequestInterceptor) : EngineSession {
    override onError(errorCode: Int, uri: String) {
        val errorType = when (errorCode) {
            1..5 -> ErrorType.ERROR_SECURITY_SSL
            else -> ErrorType.ERROR_OFFLINE
        }
        interceptor.onErrorRequest(session, errorType, uri)
    }
}
```

## License

    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/
