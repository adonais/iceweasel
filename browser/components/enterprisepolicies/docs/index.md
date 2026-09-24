# Enterprise Policies

## Introduction

Enterprise policies control Firefox behavior and let you centrally manage various aspects of Firefox across devices.
Policies can be applied using Group Policy, Microsoft Intune, or by creating a file called `policies.json` and defining policies within the JSON.

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
