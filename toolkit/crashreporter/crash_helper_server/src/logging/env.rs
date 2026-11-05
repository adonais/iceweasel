/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use cfg_if::cfg_if;
use mozbuild::config;
use std::{
    ffi::OsString,
    fs::{self, File},
    io::{self, Write},
    path::PathBuf,
};

/// Initialize logging
pub(crate) fn init() {
    let user_app_data_dir = guess_user_app_data_dir(std::env::var_os("MOZ_APP_DATA"));
    let log_target = make_log_target(user_app_data_dir, config::MOZ_UPDATE_CHANNEL);

    env_logger::builder()
        .filter_level(log::LevelFilter::Warn)
        .parse_env(
            env_logger::Env::new()
                .filter("CRASH_HELPER_LOG")
                .write_style("CRASH_HELPER_LOG_STYLE"),
        )
        .target(env_logger::fmt::Target::Pipe(log_target))
        .init();
}

// The crash helper might be launched before Firefox has a chance to provide
// the UAppData special directory, so we generate its value autonomously here.
// On Unix, use the directory in MOZ_APP_DATA if it's set, as the main process
// does.
fn guess_user_app_data_dir(custom_dir: Option<OsString>) -> Option<PathBuf> {
    if let Some(custom_dir) = custom_dir.and_then(path_from_env_value) {
        return Some(custom_dir);
    }

    let home_dir = dirs::home_dir()?;

    cfg_if! {
        if #[cfg(target_os = "linux")] {
            use std::fs::exists;

            let legacy_data = home_dir.join(".mozilla").join(config::MOZ_APP_NAME);
            let data_path = if std::env::var_os("MOZ_LEGACY_HOME").is_some() || exists(&legacy_data).ok()? {
                legacy_data
            } else {
                dirs::config_dir()?.join("mozilla").join(config::MOZ_APP_NAME)
            };
            Some(data_path)
        } else if #[cfg(target_os = "macos")] {
            Some(home_dir.join("Library").join("Application Support").join(config::MOZ_APP_BASENAME))
        } else if #[cfg(target_os = "windows")] {
            Some(home_dir.join("AppData").join("Roaming").join(config::MOZ_APP_VENDOR).join(config::MOZ_APP_BASENAME))
        } else {
            None
        }
    }
}

/// Turns the value of MOZ_APP_DATA into a path the way nsLocalFile does: an
/// absolute path is used as is, `~` and a path starting with `~/` are relative
/// to the home directory, and a path starting with `~user/` is relative to that
/// user's home directory. Anything else is rejected.
#[cfg(unix)]
fn path_from_env_value(value: OsString) -> Option<PathBuf> {
    use std::{ffi::OsStr, os::unix::ffi::OsStrExt, path::Path};

    let bytes = value.as_bytes();
    match bytes {
        [b'/', ..] => Some(PathBuf::from(value)),
        [b'~'] | [b'~', b'/'] => dirs::home_dir(),
        [b'~', suffix @ ..] if suffix.starts_with(b"/") => {
            // Append the rest of the value as is, like nsLocalFile does, so
            // that `~//dir` stays inside the home directory instead of
            // becoming `/dir`.
            let mut path = dirs::home_dir()?.into_os_string();
            path.push(OsStr::from_bytes(suffix));
            Some(PathBuf::from(path))
        }
        [b'~', rest @ ..] => {
            let users_dir = if cfg!(target_os = "macos") {
                "/Users"
            } else {
                "/home"
            };
            Some(Path::new(users_dir).join(OsStr::from_bytes(rest)))
        }
        _ => None,
    }
}

// On Windows, nsLocalFile rejects forward slashes in MOZ_APP_DATA, requires a
// drive letter or a UNC prefix, and blocks some UNC paths. Those rules aren't
// replicated here, so the override is ignored on Windows.
#[cfg(not(unix))]
fn path_from_env_value(_value: OsString) -> Option<PathBuf> {
    None
}

fn make_log_target(
    log_directory: Option<PathBuf>,
    update_channel: &str,
) -> Box<dyn Write + Send + 'static> {
    if let Some(log_directory) = log_directory.map(|path| path.join("Crash Reports")) {
        if fs::create_dir_all(&log_directory).is_ok() {
            if let Ok(log) = File::create(log_directory.join(log_file_name(update_channel))) {
                return Box::new(log);
            }
        }
    }

    Box::new(io::stderr())
}

// The log is truncated on every start so that it only holds the errors of the
// latest run. Its name includes the update channel so that builds from
// different channels sharing the same data directory don't overwrite each
// other's log.
fn log_file_name(update_channel: &str) -> String {
    format!("{}-{}.log", env!("CARGO_PKG_NAME"), update_channel)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn custom_app_data_dir_is_used() {
        let custom_dir = std::env::temp_dir().join("custom_app_data");
        assert_eq!(
            guess_user_app_data_dir(Some(custom_dir.clone().into_os_string())),
            Some(custom_dir)
        );
    }

    #[cfg(unix)]
    #[test]
    fn custom_app_data_dir_with_tilde_is_expanded() {
        use std::path::Path;

        let home_dir = dirs::home_dir().unwrap();
        assert_eq!(
            guess_user_app_data_dir(Some(OsString::from("~"))),
            Some(home_dir.clone())
        );
        assert_eq!(
            guess_user_app_data_dir(Some(OsString::from("~/some/dir"))),
            Some(home_dir.join("some/dir"))
        );
        assert_eq!(
            guess_user_app_data_dir(Some(OsString::from("~//some/dir"))),
            Some(home_dir.join("some/dir"))
        );
        let users_dir = if cfg!(target_os = "macos") {
            "/Users"
        } else {
            "/home"
        };
        assert_eq!(
            guess_user_app_data_dir(Some(OsString::from("~someone/some/dir"))),
            Some(Path::new(users_dir).join("someone/some/dir"))
        );
    }

    #[cfg(windows)]
    #[test]
    fn custom_app_data_dir_is_ignored_on_windows() {
        let default_dir = guess_user_app_data_dir(None);
        for value in [r"C:/custom/data", r"C:\custom\data"] {
            assert_eq!(
                guess_user_app_data_dir(Some(OsString::from(value))),
                default_dir
            );
        }
    }

    #[test]
    fn empty_or_relative_custom_app_data_dir_is_ignored() {
        let default_dir = guess_user_app_data_dir(None);
        assert_eq!(guess_user_app_data_dir(Some(OsString::new())), default_dir);
        assert_eq!(
            guess_user_app_data_dir(Some(OsString::from("relative/dir"))),
            default_dir
        );
    }

    #[test]
    fn log_file_is_truncated_on_start() {
        let directory =
            std::env::temp_dir().join(format!("crash_helper_truncate_{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);

        for line in ["first\n", "second\n"] {
            let mut log = make_log_target(Some(directory.clone()), "nightly");
            log.write_all(line.as_bytes()).unwrap();
            log.flush().unwrap();
        }
        let path = directory
            .join("Crash Reports")
            .join("crash_helper_server-nightly.log");
        assert_eq!(fs::read_to_string(&path).unwrap(), "second\n");

        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn log_files_of_other_channels_are_kept() {
        let directory =
            std::env::temp_dir().join(format!("crash_helper_channels_{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);

        let mut release_log = make_log_target(Some(directory.clone()), "release");
        release_log.write_all(b"release error\n").unwrap();
        release_log.flush().unwrap();
        drop(release_log);

        for line in ["first nightly run\n", "second nightly run\n"] {
            let mut nightly_log = make_log_target(Some(directory.clone()), "nightly");
            nightly_log.write_all(line.as_bytes()).unwrap();
            nightly_log.flush().unwrap();
        }

        let crash_reports = directory.join("Crash Reports");
        assert_eq!(
            fs::read_to_string(crash_reports.join("crash_helper_server-release.log")).unwrap(),
            "release error\n"
        );
        assert_eq!(
            fs::read_to_string(crash_reports.join("crash_helper_server-nightly.log")).unwrap(),
            "second nightly run\n"
        );

        fs::remove_dir_all(&directory).unwrap();
    }
}
