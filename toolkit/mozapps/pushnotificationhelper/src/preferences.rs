/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::fs::{self, File};
use std::io::{self, BufReader, LineWriter, Write};
use std::path::Path;
use tempfile::NamedTempFile;

const USER_PREF_PREAMBLE: &str = "user_pref(\"";
const USER_PREFS_UAID_NAME: &str = "dom.push.userAgentID";
const USER_PREFS_SERVER_NAME: &str = "dom.push.serverURL";
const PREFS_FILE_NAME: &str = "prefs.js";
const DEFAULT_PUSH_SERVICE: &str = "wss://push.services.mozilla.com/";

fn load_details_from_buffer(input: impl io::BufRead) -> Option<(String, String)> {
    let line_reader = input.lines();

    let mut uaid: Option<String> = None;
    let mut server_url: Option<String> = None;

    for line in line_reader.map_while(Result::ok) {
        if !line.starts_with(USER_PREF_PREAMBLE) {
            continue;
        }

        // Skip the user_pref(" preamble
        let name_slice = &line[11..];
        if name_slice.starts_with(USER_PREFS_UAID_NAME) {
            match name_slice.splitn(4, '\"').skip(2).next() {
                Some(value) => {
                    if value.is_empty() {
                        eprintln!("Empty userAgentID found in {line}");
                        return None;
                    } else {
                        uaid = Some(String::from(value));
                    }
                },
                None => {
                    eprintln!("No userAgentID found in {line}");
                    return None;
                }
            }
        } else if name_slice.starts_with(USER_PREFS_SERVER_NAME) {
            let Some(value) = name_slice.splitn(4, '\"').skip(2).next() else {
                eprintln!("No serverURL found in {line}");
                return None;
            };

            server_url = Some(String::from(value));
        }
    }

    if server_url == None {
        server_url = Some(DEFAULT_PUSH_SERVICE.to_owned());
    }

    if let Some(uaid) = uaid && let Some(server_url) = server_url {
        return Some((uaid, server_url));
    }

    return None;
}

/// Loads the preferences file, trying to find the Uaid and push server values
pub fn load_prefs(profile_path: &Path) -> Result<Option<(String, String)>, io::Error> {
    let file_path = profile_path.to_owned().join(PREFS_FILE_NAME);
    let file = File::open(file_path)?;

    return Ok(load_details_from_buffer(io::BufReader::new(file)));
}

fn modify_setting_line(line: &str, new_value: &str) -> Option<String> {
    let mut parts: Vec<&str> = line.split("\"").collect();
    if parts.len() != 5 {
        eprintln!("Invalid line for modification: {line}");
        return None;
    }

    parts[3] = new_value;
    return Some(parts.join("\""));
}

fn set_new_uaid(uaid: &str, input: impl io::BufRead, mut output: impl Write) -> Result<(), io::Error> {
    for line in input.lines().map_while(Result::ok) {
        if line.contains(USER_PREFS_UAID_NAME) {
            if let Some(newline) = modify_setting_line(&line, uaid) {
                writeln!(output, "{}", newline)?;
            } else {
                writeln!(output, "{}", line)?;
            }
        } else {
            writeln!(output, "{}", line)?;
        }
    }

    output.flush()?;
    Ok(())
}

/// Rewrites the preferences file, replacing the UAID when it is found
pub fn rewrite_preference_file_for_new_uaid(profile_path: &Path, uaid: &str) -> Result<(), io::Error> {
    let input_path = profile_path.to_owned().join(PREFS_FILE_NAME);
    let input_file = File::open(&input_path)?;

    let output_file = NamedTempFile::new_in(profile_path)?;
    let writer = LineWriter::new(&output_file);

    let reader = BufReader::new(input_file);

    set_new_uaid(uaid, reader, writer)?;

    fs::rename(&output_file.path(), &input_path)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_prefs_finds_prefs() {
        let test_prefs = r#"
user_pref("dom.push.userAgentID", "test");
user_pref("dom.push.serverURL", "wss://test.example.com");
        "#;

        let mut test_stream = test_prefs.as_bytes();
        let (uaid, server_url) = load_details_from_buffer(&mut test_stream).unwrap();
        assert_eq!(uaid, "test");
        assert_eq!(server_url, "wss://test.example.com");
    }

        #[test]
    fn load_prefs_missing_server() {
        let test_prefs = r#"
user_pref("dom.push.userAgentID", "test");
        "#;

        let mut test_stream = test_prefs.as_bytes();
        let (uaid, server_url) = load_details_from_buffer(&mut test_stream).unwrap();
        assert_eq!(uaid, "test");
        assert_eq!(server_url, DEFAULT_PUSH_SERVICE);
    }

    #[test]
    fn load_prefs_missing_uaid() {
        let test_prefs = r#"
user_pref("test.pref.test", 8);
user_pref("dom.push.serverURL", "wss://test.example.com");
        "#;

        let mut test_stream = test_prefs.as_bytes();
        assert_eq!(None, load_details_from_buffer(&mut test_stream));
    }

    #[test]
    fn load_prefs_empty_uaid() {
        let test_prefs = r#"
user_pref("dom.push.userAgentID", "");
user_pref("dom.push.serverURL", "wss://test.example.com");
        "#;

        let mut test_stream = test_prefs.as_bytes();
        assert_eq!(None, load_details_from_buffer(&mut test_stream));
    }

    #[test]
    fn test_set_new_uaid_works() {
        let test_prefs = r#"user_pref("dom.push.userAgentID", "old-value");
"#;
        let correct_result = r#"user_pref("dom.push.userAgentID", "new-test-value");
"#;

        let input = test_prefs.as_bytes();
        let mut output = Vec::new();

        assert!(set_new_uaid("new-test-value", input, &mut output).is_ok());

        let result = String::from_utf8(output).unwrap();
        assert_eq!(result, correct_result);
    }

    #[test]
    fn test_set_new_uaid_writes_unmodified_lines() {
        let test_prefs = r#"# This is a comment line
user_pref("example.pref", 6);
user_pref("dom.push.userAgentID", "old-value");
# This is a comment line
"#;
        let correct_result = r#"# This is a comment line
user_pref("example.pref", 6);
user_pref("dom.push.userAgentID", "new-test-value");
# This is a comment line
"#;

        let input = test_prefs.as_bytes();
        let mut output = Vec::new();

        assert!(set_new_uaid("new-test-value", input, &mut output).is_ok());

        let result = String::from_utf8(output).unwrap();
        assert_eq!(result, correct_result);
    }
}
