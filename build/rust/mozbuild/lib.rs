/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::path::PathBuf;
use std::sync::LazyLock;

// Read when the consumer's build script runs, so the checkout path stays out of this rlib; cargo does not rerun build scripts when these change.
pub static TOPOBJDIR: LazyLock<PathBuf> = LazyLock::new(|| env_path("MOZ_TOPOBJDIR"));

pub static TOPSRCDIR: LazyLock<PathBuf> = LazyLock::new(|| env_path("MOZ_TOPSRCDIR"));

fn env_path(var: &str) -> PathBuf {
    std::env::var_os(var)
        .unwrap_or_else(|| panic!("{} is not set", var))
        .into()
}

/// A list of compiler flags, some of which may be paths in the objdir.
pub struct Flags(LazyLock<Vec<&'static str>>);

impl Flags {
    pub const fn new(f: fn() -> Vec<&'static str>) -> Self {
        Flags(LazyLock::new(f))
    }
}

impl<'a> IntoIterator for &'a Flags {
    type Item = &'a &'static str;
    type IntoIter = std::slice::Iter<'a, &'static str>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

/// Returns `prefix`, followed by the objdir, followed by `suffix`.
pub(crate) fn objdir_flag(prefix: &str, suffix: &str) -> &'static str {
    format!("{prefix}{}{suffix}", TOPOBJDIR.display()).leak()
}

pub mod config {
    include!(env!("BUILDCONFIG_RS"));
}

/// Emit cargo link directives so that the crate invoking this, and ultimately
/// the artifact it is compiled into, links against the NSS shared libraries in
/// this objdir. Safe for any consumer in the build.
pub fn link_nss() {
    let dist = TOPOBJDIR.join("dist");
    println!(
        "cargo:rustc-link-search=native={}",
        dist.join("bin").display()
    );
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap() == "windows" {
        println!(
            "cargo:rustc-link-search=native={}",
            dist.join("lib").display()
        );
    }

    for lib in config::NSS_LINK_DYLIBS.iter() {
        println!("cargo:rustc-link-lib=dylib={}", lib);
    }
}

/// Like `link_nss`, plus static linkage of `mozpkix` and `pure_virtual`.
/// Use from crates that produce a self-contained Rust artifact (megazord
/// cdylib, rusttests). Not safe inside libxul's dependency graph: libxul
/// already links mozpkix itself.
pub fn link_nss_rustlib() {
    link_nss();
    let dist_lib = TOPOBJDIR.join("dist").join("lib");
    println!("cargo:rustc-link-search=native={}", dist_lib.display());
    println!("cargo:rustc-link-lib=static=mozpkix");
    println!("cargo:rustc-link-lib=static=pure_virtual");
}

pub fn link_sqlite() {
    let dist = TOPOBJDIR.join("dist");
    println!(
        "cargo:rustc-link-search=native={}",
        dist.join("bin").display()
    );
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap() == "windows" {
        println!(
            "cargo:rustc-link-search=native={}",
            dist.join("lib").display()
        );
    }

    if config::MOZ_FOLD_LIBS {
        println!("cargo:rustc-link-lib=dylib=nss3");
    } else {
        println!("cargo:rustc-link-lib=dylib=mozsqlite3");
    }
}
