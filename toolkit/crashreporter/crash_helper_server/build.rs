/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::env;

fn main() {
    let target = env::var_os("TARGET").expect("The TARGET env var should be populated");
    let target = target
        .to_str()
        .expect("The TARGET env var should be a valid UTF-8 string");

    if target.contains("apple-darwin") {
        let mut cfg = cc::Build::new();
        cfg.file("src/crash_generation/macos.c");
        cfg.compile("crash_generation_macos");

        println!("cargo::rerun-if-changed=src/crash_generation/macos.c");
    } else {
        println!("cargo::rerun-if-changed=build.rs");
    }
}
