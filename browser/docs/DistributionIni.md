# Distribution Customizations (distribution.ini)

A distribution (also called a partner build or repack) is a build of Firefox that ships with a `distribution.ini` file. The file gives the distribution an identifier and can change default preferences and add bookmarks. Firefox reads it on every startup through `DistributionCustomizer` in {searchfox}`distribution.sys.mjs <browser/components/distribution.sys.mjs>`.

## Where the file goes

The file goes in a `distribution` directory in the Firefox install directory, not in the profile:

| Platform | Location |
|---|---|
| Windows | `<install directory>\distribution\distribution.ini`, for example `C:\Program Files\Mozilla Firefox\distribution\distribution.ini` |
| Linux | `<install directory>/distribution/distribution.ini` |
| macOS | `Firefox.app/Contents/Resources/distribution/distribution.ini` |

In code, this directory is the `XREAppDist` directory service key, which resolves to `distribution` inside the GRE directory.

The same directory can also contain other distribution content, such as add-ons in `distribution/extensions/` (see [Extensions](#extensions)) and an enterprise `policies.json` (see {doc}`/browser/components/enterprisepolicies/docs/index`).

Firefox caches whether the file exists in the `distribution.iniFile.exists.value` and `distribution.iniFile.exists.appversion` prefs. The cached value is trusted while the application version stays the same and the startup cache is present. If you add or remove `distribution.ini` for an existing install and profile, reset those two prefs (or use a new profile) so that Firefox checks for the file again.

The file is parsed with the standard XPCOM INI parser (`nsIINIParserFactory`). Save it as UTF-8. Lines starting with `#` or `;` are comments.

## When it is applied

Preferences are applied early in startup, when `BrowserGlue` handles `final-ui-startup` (in `_beforeUIStartup`). This is before the `browser-before-ui-startup` startup category runs (see {doc}`/browser/BrowserStartup`) and before the first browser window opens. Bookmarks are applied later, after Places has initialized, from `PlacesBrowserStartup`.

All preferences from `distribution.ini` are set on the default preference branch. They are not stored in the profile: they are reapplied on every startup, a user can override them like any other default, and removing the file removes them.

The profile's `prefs.js` is read before `distribution.ini` is applied. A user value is kept when it is loaded even if it matches the built-in default at that point, so a user who changed a distribution default back to the built-in value keeps that choice: the value stays a user value and is saved again once the distribution default is in place.

## [Global]

The `[Global]` section identifies the distribution. Without a `[Global]` section that has an `id`, the whole file is ignored (apart from the `[XRE]` section).

| Key | Required | Meaning |
|---|---|---|
| `id` | Yes | Short identifier for the distribution. Stored in the `distribution.id` pref. |
| `version` | No | Version of the distribution customizations (not of Firefox). Stored in the `distribution.version` pref. |
| `about` | No | Short, user visible description of the distribution. Stored in the `distribution.about` pref. |
| `about.<locale>`, `about.<language>` | No | Localized versions of `about`, for example `about.en-US` or `about.de`. |
| `bookmarks.initialized.pref` | No | Name of the boolean pref that records that the distribution bookmarks have been added. Defaults to `distribution.<id>.bookmarksProcessed`. Only needed when upgrading an older customized build that used a different pref. |

For `about`, Firefox uses `about.<locale>` if it exists for the current requested locale (for example `en-US`), otherwise `about.<language>` (for example `en`), otherwise `about`.

### A distribution with only an id

`id` is the only required key. A file containing just this is valid:

```ini
[Global]
id=example
```

This sets `distribution.id` and nothing else, which is enough for the build to be identified in telemetry, in update requests and in search configuration.

The About dialog only shows distribution information when `distribution.about` is set. It then shows the `about` text and, below it, the id, followed by `- <version>` if `distribution.version` is set. An id-only distribution is not shown in the About dialog but its id is listed on `about:support`.

## [Preferences]

The `[Preferences]` section sets default prefs. Each line is `pref.name=value`. The value type is worked out from the value:

| Value | Pref type | Example |
|---|---|---|
| `true` or `false` | Boolean | `my.bool.pref=true` |
| A whole number | Integer | `my.int.pref=123` |
| Anything else | String | `my.string.pref="foo"` or `my.string.pref=foo` |

Values are first parsed as JSON. If that fails, the value is used as a string with one leading and one trailing double quote removed. You should quote strings that look like a number or a boolean (`my.string.pref="123"`) so that they are not turned into a different type. Values that parse to something other than a boolean, number or string (for example `null` or a JSON array) are ignored.

A line with an empty value (`my.pref=`) is ignored. A pref whose value has the wrong type for an existing default (for example a string for an integer pref) is ignored as well.

In string values, `%LOCALE%` is replaced with the requested locale (for example `en-US`) and `%LANGUAGE%` with its language part (for example `en`).

Setting `general.useragent.locale` sets the default for `intl.locale.requested` instead.

### Locale-specific preferences

These sections are evaluated once, for the first requested locale at startup (`Services.locale.requestedLocale`, or `en-US` if there is none), and are not re-evaluated if the user changes the locale while Firefox is running. If a value can be written with `%LOCALE%` or `%LANGUAGE%`, use [`[LocalizablePreferences]`](#localizablepreferences) instead, which follows locale changes. Use these sections for values that differ per locale in other ways, or to stop a pref from being set for one locale.

Two more sections can add to or override `[Preferences]` for one locale:

- `[Preferences-<language>]`, for example `[Preferences-de]`
- `[Preferences-<locale>]`, for example `[Preferences-de-AT]`

Firefox merges `[Preferences]`, then the section for the current language, then the section for the current locale, so the most specific value wins. In these two sections an empty value (`my.pref=`) removes the pref from the merged set, so it is not set by the distribution at all and keeps its built-in default.

### [LocalizablePreferences]

`[LocalizablePreferences]` works like `[Preferences]` and uses the same value rules, but its prefs are applied again whenever the requested locales change (`intl:requested-locales-changed`), with `%LOCALE%` and `%LANGUAGE%` replaced using the new locale. Use it for values that depend on the locale, such as a localized home page:

```ini
[LocalizablePreferences]
browser.startup.homepage="https://www.example.com/%LOCALE%/"
```

These prefs are set as plain default prefs. They are applied after `[Preferences]` and its locale sections, so they win if the same pref appears in both.

There are no per-locale `[LocalizablePreferences-<locale>]` sections. Use `[Preferences-<locale>]` for fixed per-locale values.

### Preferences with extra behavior

Most prefs only change a default, but a few have extra effects on a new profile (one where `browser.migration.version` has not been set yet):

- `browser.showPersonalToolbar=true` makes the bookmarks toolbar always visible (`browser.toolbars.bookmarks.visibility` is set to `always`).
- `browser.showMenubar=true` makes the menu bar stay visible instead of auto-hiding.
- `extensions.activeThemeID` set to a theme's add-on ID enables that theme. The theme has to be installed separately, for example from `distribution/extensions/` (see [Extensions](#extensions)).

## Bookmarks

Bookmarks are added once per profile. After they are added, Firefox sets the pref named by `bookmarks.initialized.pref` (by default `distribution.<id>.bookmarksProcessed`) and does not add them again. If the profile was created by a profile reset, the bookmarks are not added but the pref is still set.

There are two top-level sections:

- `[BookmarksMenu]` for the bookmarks menu
- `[BookmarksToolbar]` for the bookmarks toolbar

Folders are defined in sections named `[BookmarksFolder-<folderId>]` and can be nested.

Each section is a list of numbered items, `item.<n>.<property>=value`. Items are added in numeric order of `<n>`; gaps in the numbering are fine. The `type` property decides what the item is:

| `type` | Properties | Result |
|---|---|---|
| `bookmark` (default if `type` is missing) | `title`, `link`, optional `icon` and `iconData` | A bookmark. If both `icon` (the favicon URL) and `iconData` (a `data:` URL with the image) are given, the favicon is stored for the page. |
| `folder` | `title`, `folderId` | A folder, filled with the items from `[BookmarksFolder-<folderId>]`. |
| `separator` | none | A separator. |
| `default` | none | Marks where the built-in default bookmarks are in this container (see below). |
| `livemark` | `title`, `siteLink` | Live bookmarks are no longer supported. This adds a plain bookmark to `siteLink`, or nothing if there is no `siteLink`. |

The `default` item controls placement. Items numbered before it are inserted at the start of the container, before the built-in default bookmarks. Items numbered after it, and all items in a container without a `default` item, are added at the end.

Any property can have a localized variant by adding `.<locale>` or `.<language>`, for example `item.1.title.de=...`. Firefox uses the locale variant if present, then the language variant, then the plain property. The plain property must exist: a localized variant on its own is ignored.

Bookmarks and folders created this way have GUIDs starting with `DstB-` and `DstF-` respectively (`DistributionManagement.BOOKMARK_GUID_PREFIX` and `DistributionManagement.FOLDER_GUID_PREFIX`).

## Extensions

Add-ons placed in `distribution/extensions/` are installed into every profile by the add-ons manager, not by `DistributionCustomizer`: see `installDistributionAddons` in {searchfox}`XPIProvider.sys.mjs <toolkit/mozapps/extensions/internal/XPIProvider.sys.mjs>`. This is independent of `distribution.ini`: the directory works without a `distribution.ini`, and nothing in `distribution.ini` lists the add-ons.

### File names

Each add-on must be a packed `.xpi` file named after its add-on ID: `<id>.xpi`, for example `distribution/extensions/my-addon@example.com.xpi` or `distribution/extensions/{12345678-1234-1234-1234-123456789abc}.xpi`.

- The extension must be exactly `.xpi` in lower case. `.zip` files and unpacked directories are ignored.
- The ID is taken from the file name and must be a valid add-on ID: an email-style ID (`name@domain`) or a GUID in braces. Files whose name is not a valid ID are ignored.
- The ID in the add-on's manifest (`browser_specific_settings.gecko.id`) must match the file name exactly. If it does not, the add-on is not installed and an error is logged to the browser console.

### Locale directories

Add-ons that should only be installed for some locales, such as language packs and dictionaries, can go in `distribution/extensions/locale-<locale>/`, for example `distribution/extensions/locale-de-DE/de-DE@dictionaries.addons.mozilla.org.xpi`. The same file name rules apply.

At startup the names of the `locale-*` directories are negotiated against the requested locales (`Services.locale.negotiateLanguages` with the matching strategy), and add-ons are installed from every directory that matches, in addition to the top-level `distribution/extensions/` directory. Matching falls back from region to language, so a requested locale of `es-UY` matches `locale-es-ES` if there is no `locale-es-UY`. Directories for other locales are ignored, and only one level of `locale-*` directories is checked.

This was added for MSIX builds (bug 1726214), which ship every locale and pick one based on the operating system, but it works for any build.

### When add-ons are installed

- An add-on is installed the first time Firefox starts with a profile that does not have it. This includes existing profiles, not only new ones. It is installed into the profile (`AddonManager.SCOPE_PROFILE`) like a user-installed add-on, so the user can disable or remove it.
- After installing, Firefox sets the `extensions.installedDistroAddon.<id>` pref in the profile. While that pref is set, the add-on is not installed again, even if the user removes it, and even after a Firefox update.
- A newer version in `distribution/extensions/` replaces the installed one only when the application version changes (that is, after a Firefox update). An older version never replaces a newer one.
- Distribution add-ons must be signed like any other add-on. An add-on that fails signature verification is not installed and is tried again on the next startup.
- The `extensions.installDistroAddons` pref (default `true`) turns this off.

## [XRE]

The `[XRE]` section is read by the startup code in `nsAppRunner.cpp`, not by `DistributionCustomizer`. `EnableProfileMigrator=0` (or a value starting with `f` or `F`) turns off the import from other browsers that is normally offered when a new profile is created. An `override.ini` in the application directory takes precedence over `distribution.ini` for this setting.

## Update channel and partner prefs

Any prefs under `app.partner.` change the update channel that Firefox reports. `UpdateUtils.getUpdateChannel` sorts the `app.partner.*` pref names and appends `-cck` to the base channel, followed by `-<value>` for each pref, so one partner pref gives `<channel>-cck-<value>`. For example, on release:

```ini
[Preferences]
app.partner.acme="acme"
```

gives the update channel `release-cck-acme`. This channel is used in update requests (the `%CHANNEL%` part of the update URL), so the update server can serve partner-specific updates. `distribution.id` and `distribution.version` are also sent in update requests (`%DISTRIBUTION%` and `%DISTRIBUTION_VERSION%`).

## Telemetry

The partner section of the {doc}`Telemetry environment </toolkit/components/telemetry/data/environment>` and the Glean distribution data are filled in from default prefs:

| Telemetry field | Pref |
|---|---|
| `distributionId` | `distribution.id` (also the Glean client info distribution name) |
| `distributionVersion` | `distribution.version` |
| `partnerId` | `mozilla.partner.id` |
| `distributor` | `app.distributor` |
| `distributorChannel` | `app.distributor.channel` |
| `partnerNames` | The names of the prefs under `app.partner.` |

The same values, except `distributionId`, are recorded in the Glean `glean.distribution.ext` metric.

`distribution.id` is also used by other code, for example to choose search engine configuration, in experiment and messaging targeting, and on `about:support`.

## Example

```ini
# Example distribution.ini

[Global]
id=acme
version=1.0
about=Firefox for Acme
about.de=Firefox für Acme

[Preferences]
mozilla.partner.id="acme"
app.distributor="acme"
app.distributor.channel="acme-web"
app.partner.acme="acme"
browser.showPersonalToolbar=true
browser.startup.page=1

[Preferences-de]
browser.startup.page=3

[LocalizablePreferences]
browser.startup.homepage="https://www.example.com/%LOCALE%/"

[BookmarksToolbar]
item.1.title=Acme
item.1.title.de=Acme Deutschland
item.1.link=https://www.example.com/
item.1.link.de=https://www.example.de/
item.2.type=default
item.3.type=separator
item.4.type=folder
item.4.title=Acme Links
item.4.folderId=links

[BookmarksMenu]
item.1.title=Acme Support
item.1.link=https://support.example.com/

[BookmarksFolder-links]
item.1.title=Acme News
item.1.link=https://news.example.com/
item.2.title=Acme Store
item.2.link=https://store.example.com/
```
