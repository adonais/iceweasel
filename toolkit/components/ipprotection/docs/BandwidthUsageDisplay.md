# Bandwidth Usage Display

For entitlements with a limited monthly data allowance, the panel shows how much
VPN data the user has left. This page documents the rules that decide **which
unit** the remaining amount is shown in (GB vs. MB) and **how it is rounded**
(whole number vs. one decimal place).

> Bandwidth usage is displayed when `browser.ipProtection.bandwidth.enabled` is set to `true`.

The formatting logic lives in `formatRemainingBandwidth` in
`browser/components/ipprotection/content/ipprotection-utils.mjs`. The
`bandwidth-usage` custom element
(`browser/components/ipprotection/content/bandwidth-usage.mjs`) consumes it to
build the progress bar and numeric strings. Unit conversions rely on the
`BANDWIDTH` constants in
`browser/components/ipprotection/content/ipprotection-constants.mjs`.

## Units are binary

Conversions use binary (power-of-two) multiples, even though the UI labels them
`GB` and `MB`:

- `BANDWIDTH.BYTES_IN_GB` is `2^30` (1 GiB).
- `BANDWIDTH.BYTES_IN_MB` is `2^20` (1 MiB).

All raw bandwidth values (`remaining`, `max`) are handled as `BigInt`
byte counts sourced from the usage payload.

## Remaining data: GB vs. MB

`formatRemainingBandwidth(remainingBytes)` returns `{ value, useGB }`. The
unit is chosen from the remaining amount alone:

- **1 GB or more remaining** → `useGB: true`. The value is shown in GB,
  rounded to **one decimal place** and formatted with `Intl.NumberFormat`
  (`maximumFractionDigits: 1`), so it is locale-aware and drops trailing
  zeros (`30`, not `30.0`; `12.5` stays `12.5`).
- **Less than 1 GB remaining** → `useGB: false`. The value switches to MB and
  is shown as a **floored whole number** of MB
  (`Math.floor(remainingBytes / BYTES_IN_MB)`), with no decimals.

The `useGB` flag selects the localized string, so the unit in the text always
matches the unit of the value:

| Context | `useGB: true` (GB) | `useGB: false` (MB) |
| --- | --- | --- |
| Progress bar description | `ip-protection-bandwidth-left-gb-1` | `ip-protection-bandwidth-left-mb-1` |
| Numeric-only view | `ip-protection-bandwidth-left-this-month-gb` | `ip-protection-bandwidth-left-this-month-mb` |

### Examples

- `12.5 GB` remaining → `"12.5"` GB.
- `30 GB` remaining → `"30"` GB (no decimal, because the fractional part is
  zero).
- `0.9 GB` remaining → `921` MB (floored: `floor(0.9 * 1024)`).

## The monthly limit is always in GB

The maximum (`maxUsage`) shown alongside the remaining amount — and in the
header, help text, "limit reached", and reset strings — is **always expressed in
GB**, regardless of how much data is left. It is computed as
`maxGB = max / BYTES_IN_GB` and passed straight through without rounding. The
default monthly limit is `browser.ipProtection.bandwidth.maxInGb` (50 GB).

This is why a user near the end of their allowance sees a mixed-unit string such
as `500 MB of 50 GB left this month`: the remaining amount has dropped below
1 GB and switched to MB, but the limit stays in GB.

When the allowance is exhausted (`remaining <= 0`), the numeric text is
replaced by `ip-protection-bandwidth-hit-for-the-month`, which reports only
the limit (in GB).

## Progress bar value

The `<progress>` element measures **used** data, not remaining, and is always
expressed in GB:

- `max` is `maxGB`.
- `value` is `bandwidthUsedGB` (`(max - remaining) / BYTES_IN_GB`) rounded
  to one decimal via `parseFloat(...toFixed(1))`.

The separate `percent` attribute is **bucketed** rather than exact, so styling
can react to thresholds without exposing precise usage. `bandwidthPercent`
returns:

- `90` when used is at or above 90%,
- `75` when used is at or above 75% (but below 90%),
- otherwise `Math.floor(percent)`.
