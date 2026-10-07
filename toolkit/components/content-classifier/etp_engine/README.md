# etp_engine

Network filter matching engine for Enhanced Tracking Protection. Parses Adblock
Plus / uBlock Origin filter syntax and answers "should this request be blocked,
annotated, or allowed" for the Content Classifier.

This is a fork of [brave/adblock-rust](https://github.com/brave/adblock-rust).

## Provenance

| | |
|---|---|
| Upstream | https://github.com/brave/adblock-rust |
| Imported revision | `b8013ec56e5b29d79c6afaf92c181b11055e5fa8` |
| Corresponding release | 0.12.1 |
| License | MPL-2.0 (see `LICENSE`), except `src/url_parser/parser.rs` |

The exception is `src/url_parser/parser.rs`. Upstream lifted it from Servo's
[rust-url](https://github.com/servo/rust-url), and it carries rust-url's dual
**Apache-2.0 / MIT** notice.

`moz.yaml` holds the machine-readable version of the above, and configures
updatebot to watch upstream releases. Its `revision` field records the upstream
release tag and is the anchor for the update procedure below, so it must be bumped
whenever upstream changes are pulled in.

**This crate is not updated via `./mach vendor`.** `moz.yaml` sets
`skip-vendoring-steps`, so a vendor run fetches nothing and exits without doing
the update. There is no `patches:` list either, because the local changes are
edited directly into the files. See "Updating from upstream".

## How it is wired into Gecko

`etp_engine` is a plain Rust library with no FFI of its own. The Gecko-facing
glue lives one directory up in `content_classifier_engine`, which owns the
`#[no_mangle]` shims, the cbindgen header, and the `ContentClassifierEngine`
C++ wrapper. `ContentClassifierService` builds one engine per Content Classifier
feature from RemoteSettings-delivered filter lists.

Keeping the glue outside this directory means an upstream merge never has to
preserve Gecko-specific code.

## Domain resolution

The engine does not resolve public suffixes itself. The embedder must install a
resolver via `set_domain_resolver` before any matching happens;
`content_classifier_engine` installs one backed by `nsIEffectiveTLDService` so
that eTLD+1 decisions match the rest of Gecko. Without it, matching panics.

## Cargo.toml changes

Hand-written rather than imported, because upstream declares its own
`[workspace]` and takes `serde` from `[workspace.dependencies]`. Dependency
versions are otherwise kept identical to upstream so the resolved graph does not
move. Beyond that:

- The optional `cssparser` and `selectors` dependencies are dropped and
  `css-validation` is left declared but empty. An unused optional dependency of
  a workspace member still lands in `Cargo.lock`, unlike one of a registry
  crate, and upstream's `cssparser` 0.34 would then sit alongside the 0.37 servo
  already provides -- two versions of one crate, which `vendor_rust.py` rejects.
  (`selectors` alone would be fine, since upstream's 0.26 matches the tree, but
  `css-validation` needs both.) The feature name is retained so the `cfg` arms in
  `src/filters/cosmetic.rs` stay recognized.
- The optional `addr` dependency is dropped and `embedded-domain-resolver` is
  likewise left declared but empty, for the same reason -- and `addr` would also
  pull in `psl`, about 2.9MB of vendored public suffix data. Gecko never enables
  the feature: `content_classifier_engine` installs a resolver over
  nsIEffectiveTLDService with `set_domain_resolver`.
- All of upstream's `[dev-dependencies]` are dropped, so this crate's own unit
  tests are not built in tree. See "Tests" below.

## Tests

This crate's own unit tests are **not** built or run in tree, and it is not listed
in `RUST_TESTS`. Running them needs upstream's dev-dependencies, and `addr` --
required by the test-only domain resolver -- pulls in `psl`, roughly 2.9MB of
vendored public suffix data that Firefox never activates. That was judged not
worth vendoring for tests.

The engine is covered end to end instead, through the Content Classifier and the
networking stack, by the browser-chrome tests in
`toolkit/components/content-classifier/test/browser`.

`data/` is not imported either, and that is a licensing decision rather than a
size one. The fixtures are third-party filter lists -- EasyList and EasyPrivacy
(GPLv3 / CC BY-SA 3.0), uAssets-derived lists (GPLv3) -- and several carry no
licence statement at all. None of it is MPL-2.0, and GPL is not compatible with
MPL-2.0. So, we don't consider importing them, but we will consider running the
tests using them in a license-compatible way. The work is tracked in
[Bug 2069902](https://bugzilla.mozilla.org/show_bug.cgi?id=2069902).

To run the crate's own tests locally, add back the dev-dependencies upstream
declares -- `addr` with its `psl` feature, `mock_instant` and `sha2` -- then
`cargo test -p etp_engine`. 16 of them additionally need `data/`, so they stay
unrunnable here for the reason above; the rest pass.

## Updating from upstream

Updatebot watches upstream and files a bug when a new release is tagged (see the
`commit-alert` task in `moz.yaml`, and `tracking: tag`); it never modifies this
directory. Picking up those changes is a deliberate act, done as follows.

Updates are applied by hand. Applying upstream's own diff between the revision
recorded in `moz.yaml` and the revision you want, which lets the local changes
survive as an ordinary three-way merge:

The diff is taken from upstream's own history, so this needs a local clone of
[brave/adblock-rust](https://github.com/brave/adblock-rust) -- that clone is what
`/path/to/adblock-rust` refers to below. Put it anywhere outside the tree; it is
only read, never modified. If you already have one, `git fetch --tags` it first,
otherwise the new release tag will not be there to diff against.

    git clone https://github.com/brave/adblock-rust /path/to/adblock-rust

Then, from the top of the tree:

    CRATE=toolkit/components/content-classifier/etp_engine
    OLD=$(sed -n 's/^  revision: //p' $CRATE/moz.yaml)
    NEW=<the upstream revision you want>

    git -C /path/to/adblock-rust diff $OLD $NEW -- src LICENSE rustfmt.toml \
      > /tmp/upstream.patch
    git apply --3way --directory=$CRATE /tmp/upstream.patch

That path list is every imported path whose content still tracks upstream.
`Cargo.toml` and `README.md` are deliberately left out: both are maintained in
tree and would conflict wholesale, and step 2 below covers reconciling
`Cargo.toml` by hand.

The local changes are not reapplied from scratch. Only the places upstream also
touched come back as conflicts.

The rest of the update is by hand. Steps 1 and 2 are the only content work the
diff cannot do for you; 3 and 4 are bookkeeping.

1. Add the MPL header to any new `src/**/*.rs` upstream introduced, unless it
   carries its own licence or generated-file banner. The `license` linter will
   tell you which files are missing one.
2. Reconcile `Cargo.toml`. It is maintained in tree, so upstream dependency
   bumps, edition changes and new dependencies do not arrive with the diff.
   Compare against upstream's `Cargo.toml` by hand, and remember that any new
   dependency has to be vendored and pass `./mach cargo vet`.
3. Bump `release` and `revision` in `moz.yaml`, and the `Imported revision` and
   `Corresponding release` rows of the Provenance table above, to the new
   revision. Both places record it, so both have to move together.
4. Re-run the checks under "Tests", plus
   `./mach lint toolkit/components/content-classifier/etp_engine`.
