/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::path::{Path, PathBuf};

// Path::new is not const at the moment. This is a non-generic version
// of Path::new, similar to libstd's implementation of Path::new.
#[inline(always)]
const fn const_path(s: &'static str) -> &'static std::path::Path {
    unsafe { &*(s as *const str as *const std::path::Path) }
}

pub const TOPOBJDIR: &Path = const_path(config::TOPOBJDIR);

pub const TOPSRCDIR: &Path = const_path(config::TOPSRCDIR);

pub mod config {
    include!(env!("BUILDCONFIG_RS"));
}

/// Emit cargo link directives so that the crate invoking this, and ultimately
/// the artifact it is compiled into, links against the NSS shared libraries in
/// this objdir. Safe for any consumer in the build.
pub fn link_nss() {
    let dist = PathBuf::from(TOPOBJDIR).join("dist");
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
    let dist_lib = PathBuf::from(TOPOBJDIR).join("dist").join("lib");
    println!("cargo:rustc-link-search=native={}", dist_lib.display());
    println!("cargo:rustc-link-lib=static=mozpkix");
    println!("cargo:rustc-link-lib=static=pure_virtual");
}
