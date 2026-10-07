# Enterprise Policies

## Introduction

Enterprise policies control Firefox behavior and let you centrally manage various aspects of Firefox across devices.
Policies can be applied using Group Policy, Microsoft Intune, or by creating a file called `policies.json` and defining behavior within the JSON.

The reference documentation for each policy, including guides for applying and managing them, is in the [Firefox Admin Documentation](https://firefox-admin-docs.mozilla.org/).
For other resources for deploying Firefox in an organization, see the [Firefox Enterprise](https://www.firefox.com/en-US/browsers/enterprise/) page.

## Kiosk Mode

Firefox Kiosk Mode is a basic full-screen mode intended for environments where the content displayed in the browser is controlled by a kiosk owner.
It's designed for cases where users have no keyboard access or where keyboard access is restricted (particularly <kbd>Ctrl</kbd> and <kbd>Alt</kbd>).
Kiosk administrators are responsible for ensuring that content displayed on the device cannot unexpectedly navigate users away.

To run Kiosk Mode, start Firefox from the command line with the `--kiosk` option:

```bash
firefox --kiosk
# Or provide a URL
firefox --kiosk 'https://example.com/my-dashboard'
```

To put the kiosk window on a particular monitor, use `--kiosk-monitor` with the monitor number, instead:

```bash
# --kiosk-monitor implies --kiosk
firefox --kiosk-monitor 1 'https://example.com/my-dashboard'
```

Kiosk Mode does three main things:

1. Main browser windows (not popup windows) switch to full-screen mode that can't be exited within Firefox.
2. The context menu isn't shown.
3. Status for URLs and page loading isn't shown.

Two policies that are important for for a kiosk are
[UserMessaging](https://firefox-admin-docs.mozilla.org/reference/policies/usermessaging/) and
[DisableFirefoxStudies](https://firefox-admin-docs.mozilla.org/reference/policies/disablefirefoxstudies/).
Together they stop Firefox from interrupting the kiosk content with recommendations, onboarding, What's New, and studies.

Kiosk mode also won't suppress updates, the notifications and restart prompts for them, block `about:` pages, developer tools, and other behavior, so you should use policies for controlling these, too.

## Policy schema and metadata

For policies, there is a schema file located at {searchfox}`policies-schema.json <browser/components/enterprisepolicies/schemas/policies-schema.json>`.
Documentation and admin tools read this schema and can describe a policy without having to hardcode details about it beforehand.
The following `policies-schema.json` members are **required** for each policy:

`description`
: The description is written for the admins setting it and covers what the policy does.

`x-category`
: The category the policy is listed under, such as `Security` or `Bookmarks`.

`x-compatibility`
: Which release channels the policy is available, described below.

`x-restart-required`
: Whether the policy needs a restart before it's applied. Firefox ignores this since it applies all policies at startup, so set it to `true` for a new policy. Firefox Enterprise is the only consumer.

`examples`
: At least one value an admin could set, in the shape the policy accepts.

For each policy, the required members are enforced by a meta file
{searchfox}`policies-schema.meta.json <browser/components/enterprisepolicies/schemas/policies-schema.meta.json>`,
which is checked by
{searchfox}`test_policies_schema.js <browser/components/enterprisepolicies/tests/xpcshell/test_policies_schema.js>` xpcshell tests.

### Compatibility data

An `x-compatibility` block states the first version that supports a policy:

```json
"x-compatibility": {
  "firefox": { "version_added": "141" },
  "firefox_esr": { "version_added": "140.1.0" },
  "firefox_enterprise": { "version_added": "149" }
}
```

In an `x-compatibility` block, all three release channels are required.
A version for each channel is a string of up to three numbers, or `false` if the channel doesn't support the policy.

An optional `notes` member can accompany compat information.
Notes as a sibling of all channels apply to every channel, like `DisableLaunchOnLogin`:

```json
"x-compatibility": {
  "firefox": { "version_added": "155" },
  "firefox_esr": { "version_added": false },
  "firefox_enterprise": { "version_added": "155" },
  "notes": [
    "Windows support added in 155, macOS support added in 156. Has no effect on Linux."
  ]
}
```

Notes inside a release channel apply only to that channel:

```json
"x-compatibility": {
  "firefox": {
    "version_added": "60",
    "notes": "The policy accepted an object form in 123, and accepts a boolean form since 134."
  },
  "firefox_esr": { "version_added": "60" },
  "firefox_enterprise": { "version_added": "149" }
}
```
