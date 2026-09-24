# Vendoring Third Party Components

The firefox source tree vendors many third party dependencies. This document
describes both the expectations when adding vendored dependencies, and the
practical side of how to use our vendoring infrastructure.

## Expectations Around Vendoring

When you vendor in new code, ownership expectations are similar to those when
you write your own code. We expect you to:

- check the suitability of the vendored code as compared to available
  alternatives;
- check licensing suitability;
- check the vendored code is maintained in its source location;
- check for auditing results where the language/vendoring system supports this;
- commit to keeping it updated (especially but not limited to security updates).

Where vendored packages are depended on by several parts of our codebase and
several teams, that responsibility is shared between those teams. In these
situations, please proactively organize between the teams to avoid "tragedy
of the commons" type situations where nobody takes responsibility for ongoing
ownership of the vendored dependency.

To ensure the vendored code stays up-to-date, consider making use of `updatebot`
(detailed below). This will allow you to review automatically created vendoring
updates, including running trypushes to verify the updates do not break things.

Otherwise, you will need to set up reminders or a push-based
notification for new releases.

For rust crates, we also run `cargo deny` in automation, which will lead to bugs
filed when/where crates are missing critical security updates. This can help
you stay on top of security issues but does not cover other updates.

## Vendoring Architecture
The build system provides a normalized way to keep track of:

1. The upstream source license, location and revision

2. (Optionally) The upstream source modification, including

   1. Mozilla-specific patches
   2. Custom update actions, such as excluding some files, moving files around
      etc.

This is done through a descriptive `moz.yaml` file added to the third
party sources, and the use of:

```sh
./mach vendor [options] ./path/to/moz.yaml
```

to interact with it.

## Template `moz.yaml` file

```{literalinclude} template.yaml
:language: text
```

## Common Vendoring Operations

Update to the latest upstream revision:

```sh
./mach vendor /path/to/moz.yaml
```

Check for latest revision, returning no output if it is up-to-date, and a
version identifier if it needs to be updated:

```sh
./mach vendor /path/to/moz.yaml --check-for-update
```

Vendor a specific revision:

```sh
./mach vendor /path/to/moz.yaml -r $REVISION --force
```

In the presence of patches, two steps are needed:

1. Vendor without applying patches (patches are applied *after*
   `update-actions`) through `--patch-mode none`
2. Apply patches on updated sources through `--patch-mode only`

In the absence of patches, a single step is needed, and no extra argument is
required.

## Vendoring Actions

Vendoring actions in the `moz.yaml` file can be configured to run either before
or after patches are applied using separate sections:

- Actions in `update-actions` run **before** patches are applied
- Actions in `post-patch-actions` run **after** patches are applied

This separation is useful when you need to run scripts that depend on Mozilla-specific
patches being applied first, such as:

- Code generation scripts that need patched configuration files
- Build system updates that depend on patched build definitions
- Processing steps that require Mozilla-specific modifications to be in place

Example:

```yaml
# Actions that run before patches are applied
update-actions:
  - action: run-script
    script: '{yaml_dir}/pre_patch_script.sh'
    cwd: '{yaml_dir}'

# Actions that run after patches are applied
post-patch-actions:
  - action: run-script
    script: '{yaml_dir}/post_patch_script.sh'
    cwd: '{yaml_dir}'
    args: ['{revision}']
```
