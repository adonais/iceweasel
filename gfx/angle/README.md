This folder contains scripts and metadata required to vendor [ANGLE](https://chromium.googlesource.com/angle/angle) into Firefox. ANGLE's files are vendored into `third_party/angle`.

## Updating ANGLE

ANGLE is vendored using the standard `mach vendor` command:

```sh
./mach vendor gfx/angle/moz.yaml -r <revision>
```

where `revision` can be a branch name or specific revision. If omitted altogether, the version of ANGLE currently used by Chromium's Beta channel will be chosen.

This will fetch and extract the specified version of ANGLE, along with a few of its required dependencies, then execute the `update-angle.py` script.

`update-angle.py` will apply our patches, generate `moz.build` files required to build ANGLE, and vendor the required files into tree.

## Patches

Patches applied to ANGLE live in the `patches` directory, and are applied in alphabetical order.

They are applied by the `update-angle.py` script, rather than using `mach vendor`'s `patches` mechanism. This is because `updatebot` creates one commit before applying patches and another afterwards. We take care to only vendor the required source files into tree, and deciding which files to vendor must occur after applying patches, as the patches will affect the list of required files. Using the `patches` mechanism would therefore result in the first commit adding a huge number of unnecessary files to tree, which would then be removed by the second commit.

Patches should be generated using `git format-patch --no-numbered`, and can be re-applied to a standalone ANGLE checkout using `git am`. Using `--no-numbered` avoids adding `[PATCH n/m]` to the patches' headers, which can become stale or cause churn as new patches are added.

### Cherry-picking patches from upstream

To cherry-pick a patch from upstream, you will need a local ANGLE checkout. From within it run:

```sh
git format-patch --no-numbered -1 <upstream-revision> -o <path/to/firefox>/gfx/angle/patches/
```

Then rename the generated file to have the next sequence number in the series, commit it, then run `mach vendor` to apply the new patch. If the patch doesn't apply cleanly due to conflicts with existing patches, follow the conflict resolution instructions below.

### Authoring new patches

To author a new patch, modify the code directly in `third_party/angle` until you are happy with it. Then, from the Firefox repository root:

```sh
git add third_party/angle/
git commit -m "Brief description of the patch"
git format-patch --no-numbered --relative=third_party/angle HEAD~1 -o gfx/angle/patches/
git reset HEAD~1
```

Rename the generated file to have the next sequence number in the series then commit both the patch and the changes. To verify this worked as expected, you can then run `mach vendor gfx/angle/moz.yaml -r <current-angle-base-revision> --force`, and ensure there are no changes.

**You must not simply modify the vendored code without adding a new patch file, as this will be clobbered by the next update.**

### Resolving conflicts

If a conflict is encountered when updating, please resolve the conflicts in an ANGLE checkout and update the patches:

```sh
cd <path/to/angle/checkout>
git switch -d <current-angle-base-revision>
git am <path/to/firefox/checkout>/gfx/angle/patches/*.patch
git rebase --onto <new-angle-base-revision> <current-angle-base-revision>
# Manually resolve conflicts and continue rebase as required
rm <path/to/firefox/checkout>/gfx/angle/patches/*.patch
git format-patch --no-numbered <new-angle-base-revision> -o <path/to/firefox/checkout>/gfx/angle/patches
```

Then commit the new patches and re-run `mach vendor`.

## Build file generation

The `moz.build` files used to build ANGLE are generated using the `gn_processor.py` script, which is invoked automatically from `update-angle.py`. Metadata required for this can be found in `gn-configs/angle.json`. This metadata configures which GN target is built, and with which GN args, for each platform. It can also be used to override `DEFINES` and other sandbox variables, and specify which files must be built as non-unified sources. This is the preferred mechanism for configuring ANGLE's build for our needs, and should be used rather than patches where possible as patches increase the likelihood of conflicts when updating.

`gn_processor.py` is additionally used to determine the exact set of files required to be vendored into tree. We rely on this instead of `mach vendor`'s `include` and `exclude` steps, as they are too coarse to be effective for a project as complex as ANGLE.

## Dependencies

ANGLE requires several dependencies. These are automatically fetched along with ANGLE by `AngleHost`. If a future update requires additional dependencies, these should be added to the list in `host_angle.py`.

One such dependency is Chromium's `zlib` fork. This includes Google's `compression_utils_portable` library which is indeed required by ANGLE. For zlib itself, however, we prefer to use the version already vendored into Firefox at `modules/zlib`. To achieve this, `update-angle.py` stubs out ANGLE's `zlib/BUILD.gn` file to prevent it being built, then `gn_processor.py` will add the required `USE_LIBS` declarations to the generated `moz.build` files to ensure we link against Firefox's zlib.
