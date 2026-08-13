/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::HashMap;
use std::sync::Mutex;

use nsstring::{nsACString, nsCString};
use serde::Deserialize;
use serde_json::Value;
use thin_vec::ThinVec;
use unic_langid::LanguageIdentifier;

/// Per-file entry of `coverage.json`, as emitted by `moz.l10n` at build time:
/// `{ "<file-path>": { "total": int, "missing": [id, ...] } }`, keyed by the
/// localizable file's path (`.ftl`, `.properties`, `.dtd`, ...). `missing` is
/// heterogeneous (a message id is a string, a Fluent attribute is `[id, attr]`),
/// so entries are kept as opaque values and interpreted on demand.
#[derive(Deserialize)]
struct FileCoverage {
    total: u32,
    missing: Vec<Value>,
}

impl FileCoverage {
    /// Translation ratio in `0.0..=1.0`. A file with no messages is fully
    /// covered by definition.
    fn ratio(&self) -> f32 {
        if self.total == 0 {
            return 1.0;
        }
        let translated = self.total.saturating_sub(self.missing.len() as u32);
        translated as f32 / self.total as f32
    }

    /// Whether the message `id` is untranslated in this file. A `missing` entry
    /// is either the message id (a string) or `[id, attr]` for a missing
    /// attribute; the latter also counts the message as not localized.
    fn is_missing(&self, id: &str) -> bool {
        self.missing.iter().any(|entry| match entry {
            Value::String(s) => s == id,
            Value::Array(parts) => parts.first().and_then(Value::as_str) == Some(id),
            _ => false,
        })
    }
}

/// Effective coverage state for the current app-locale chain.
enum Coverage {
    /// The effective locale is the source (last-fallback, e.g. `en-US`): every
    /// message is localized by definition.
    Source,
    /// Coverage data of the effective translated locale.
    Loaded(HashMap<String, FileCoverage>),
}

static COVERAGE: Mutex<Option<Coverage>> = Mutex::new(None);

/// Loads the coverage for the locale Firefox is effectively displaying. It walks
/// the negotiated app-locale chain in order: reaching the source (last-fallback)
/// locale means everything from there on is untranslated source content, so the
/// result is `Source`. A locale that actually localizes ships a `coverage.json`
/// (built-in or via langpack), so the first locale in the chain that yields
/// coverage data is the effective one; a non-source locale without coverage is
/// skipped, because Firefox falls back past it too.
fn load() -> Coverage {
    let Some(app_locales) = crate::xpcom_utils::get_app_locales() else {
        return Coverage::Source;
    };

    let last_fallback: LanguageIdentifier = "en-US".parse().unwrap();

    let registry = crate::registry::get_l10n_registry();
    let Ok(metasources) = registry.try_borrow_metasources() else {
        return Coverage::Source;
    };

    for locale_str in &app_locales {
        let Ok(locale) = locale_str.to_utf8().parse::<LanguageIdentifier>() else {
            continue;
        };

        if last_fallback == locale {
            return Coverage::Source;
        }

        // The coverage file's path is derived from each FileSource's `pre_path`,
        // covering both the built-in `app` source and langpacks. Later sources
        // override earlier ones for the same file.
        let mut coverage = HashMap::new();
        for source in metasources.filesources() {
            if !source.locales().contains(&locale) {
                continue;
            }
            let uri = format!(
                "{}coverage.json",
                source.pre_path.replace("{locale}", &locale.to_string())
            );
            if let Ok(data) = crate::load::load_sync(uri) {
                if let Ok(map) = serde_json::from_slice::<HashMap<String, FileCoverage>>(&data) {
                    coverage.extend(map);
                }
            }
        }

        if !coverage.is_empty() {
            return Coverage::Loaded(coverage);
        }
    }

    Coverage::Source
}

/// Returns the translation coverage (0.0–1.0) for the given localizable file
/// path. Returns false if no coverage data is available for that path (the
/// source locale, or a file not tracked by the effective locale's coverage).
#[no_mangle]
pub extern "C" fn l10nregistry_get_coverage(path: &nsACString, result: &mut f32) -> bool {
    let mut guard = COVERAGE.lock().unwrap();
    match guard.get_or_insert_with(load) {
        Coverage::Loaded(map) => match map.get(path.to_utf8().as_ref()) {
            Some(entry) => {
                *result = entry.ratio();
                true
            }
            None => false,
        },
        Coverage::Source => false,
    }
}

/// Returns whether every message in `ids` is localized in the given localizable
/// file for the effective locale. The source locale (en-US or an untranslated
/// locale falling back to it) counts everything as localized.
#[no_mangle]
pub extern "C" fn l10nregistry_are_messages_localized(
    path: &nsACString,
    ids: &ThinVec<nsCString>,
) -> bool {
    let mut guard = COVERAGE.lock().unwrap();
    match guard.get_or_insert_with(load) {
        Coverage::Loaded(map) => match map.get(path.to_utf8().as_ref()) {
            Some(entry) => !ids.iter().any(|id| entry.is_missing(id.to_utf8().as_ref())),
            None => true,
        },
        Coverage::Source => true,
    }
}

/// Clears the cached coverage data so it is reloaded on next access.
/// Called when the app locale changes or a lang-pack is installed/updated.
#[no_mangle]
pub extern "C" fn l10nregistry_clear_coverage_cache() {
    *COVERAGE.lock().unwrap() = None;
}

/// Test-only: replaces the cached coverage with the given `coverage.json`
/// contents, bypassing the file load and current locale. Returns false if the
/// JSON cannot be parsed. Use `l10nregistry_clear_coverage_cache` to reset.
#[no_mangle]
pub extern "C" fn l10nregistry_set_coverage_for_testing(json: &nsACString) -> bool {
    match serde_json::from_str(&json.to_utf8()) {
        Ok(map) => {
            *COVERAGE.lock().unwrap() = Some(Coverage::Loaded(map));
            true
        }
        Err(_) => false,
    }
}
