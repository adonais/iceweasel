/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Functionality for managing source code for shaders.
//!
//! This module is used during precompilation (build.rs) and regular compilation,
//! so it has minimal dependencies.

use std::borrow::Cow;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::collections::HashSet;
use std::collections::hash_map::DefaultHasher;
use crate::MAX_VERTEX_TEXTURE_WIDTH;

pub use crate::shader_features::*;

lazy_static! {
    static ref MAX_VERTEX_TEXTURE_WIDTH_STRING: String = MAX_VERTEX_TEXTURE_WIDTH.to_string();
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ShaderKind {
    Vertex,
    Fragment,
}

#[derive(Clone, Copy, Debug, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub enum ShaderVersion {
    Gl,
    Gles,
}

impl ShaderVersion {
    /// Return the full variant name, for use in code generation.
    pub fn variant_name(&self) -> &'static str {
        match self {
            ShaderVersion::Gl => "ShaderVersion::Gl",
            ShaderVersion::Gles => "ShaderVersion::Gles",
        }
    }
}

#[derive(PartialEq, Eq, Hash, Debug, Clone, Default)]
#[cfg_attr(feature = "serialize_program", derive(Deserialize, Serialize))]
pub struct ProgramSourceDigest(u64);

impl ::std::fmt::Display for ProgramSourceDigest {
    fn fmt(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
        write!(f, "{:02x}", self.0)
    }
}

impl From<DefaultHasher> for ProgramSourceDigest {
    fn from(hasher: DefaultHasher) -> Self {
        use std::hash::Hasher;
        ProgramSourceDigest(hasher.finish())
    }
}

const SHADER_IMPORT: &str = "#include ";

struct ShaderSourceRange {
    filename: String,
    input_line: usize,
    output_line: usize,
}

// Keeps records of source ranges.
//
// Each entry represents the _start_ of a new range, the end
// being implicitely the start of the next one, or the end of the file.
pub struct ShaderSourceMap {
    ranges: Vec<ShaderSourceRange>,
    current_line: usize,
}

impl ShaderSourceMap {
    pub fn new() -> Self {
        Self {
            ranges: Vec::new(),
            current_line: 1,
        }
    }

    pub fn start_range(&mut self, filename: String, input_line: usize) {
        self.ranges.push(ShaderSourceRange {
            filename,
            input_line,
            output_line: self.current_line,
        });
    }

    pub fn next_line(&mut self) {
        self.current_line += 1;
    }

    /// Map a line of the expanded source back to the file and line it came
    /// from. Returns `None` if no range has been recorded, which happens only
    /// for a map that was never fed a source.
    pub fn query(&self, output_line: usize) -> Option<(String, usize)> {
        assert!(output_line >= 1);
        for window in self.ranges.windows(2) {
            let (previous, next) = (&window[0], &window[1]);
            if output_line >= previous.output_line && output_line < next.output_line {
                let line_offset = output_line - previous.output_line;
                return Some((previous.filename.clone(), previous.input_line + line_offset));
            }
        }

        let last = self.ranges.last()?;
        let line_offset = output_line.checked_sub(last.output_line)?;
        Some((last.filename.clone(), last.input_line + line_offset))
    }

    /// Parse a driver shader log into one entry per line, resolving the
    /// locations drivers report in the expanded source back to the `.glsl`
    /// file and line they were written in.
    ///
    /// Lines whose format no driver pattern matches are kept verbatim with no
    /// location, so an unrecognized driver loses the line number rather than
    /// the message.
    pub fn map_log(&self, log: &str) -> Vec<ShaderLogLine> {
        log.lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| match parse_log_line(line) {
                Some((output_line, column, message)) => {
                    let location = self.query(output_line as usize);
                    ShaderLogLine {
                        file: location.as_ref().map(|(file, _)| file.clone()),
                        line: location.map(|(_, line)| line as u32),
                        column,
                        message,
                    }
                }
                None => ShaderLogLine {
                    file: None,
                    line: None,
                    column: None,
                    message: line.to_string(),
                },
            })
            .collect()
    }

    pub fn process_log(&self, log: &str) -> String {
        let mut output = String::new();

        for entry in self.map_log(log) {
            output.push_str(&entry.to_string());
            output.push('\n');
        }

        output
    }

    pub fn dump(&self) {
        for range in &self.ranges {
            println!("range: {}:{} -> output:{}", range.filename, range.input_line, range.output_line);
        }
    }
}

/// One line of a driver's shader compile or link log, with the location it
/// refers to resolved back to the `.glsl` file it was written in.
///
/// `file` and `line` are `None` when the line carried no location, either
/// because it is prose (drivers like to append summary lines) or because it
/// used a format none of the known drivers use.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShaderLogLine {
    pub file: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub message: String,
}

impl ::std::fmt::Display for ShaderLogLine {
    fn fmt(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
        match (&self.file, self.line, self.column) {
            (Some(file), Some(line), Some(column)) => {
                write!(f, "{}:{}:{}: {}", file, line, column, self.message)
            }
            (Some(file), Some(line), None) => {
                write!(f, "{}:{}: {}", file, line, self.message)
            }
            _ => write!(f, "{}", self.message),
        }
    }
}

lazy_static! {
    // Mesa, and the reference GLSL compiler: `0:123(45): error: ...`. The
    // leading 0 is the index of the source string passed to glShaderSource,
    // of which WR only ever passes one.
    static ref MESA_LOG_LINE: regex::Regex =
        regex::Regex::new(r"^0:([0-9]+)\(([0-9]+)\):\s*(.*)$").unwrap();
    // NVIDIA: `0(123) : error C1503: ...`. No column.
    static ref NVIDIA_LOG_LINE: regex::Regex =
        regex::Regex::new(r"^0\(([0-9]+)\)\s*:\s*(.*)$").unwrap();
    // ANGLE and most ESSL compilers: `ERROR: 0:123: 'foo' : ...`. No column;
    // the severity is kept in the message, as it is the only place it appears.
    static ref ANGLE_LOG_LINE: regex::Regex =
        regex::Regex::new(r"^(ERROR|WARNING):\s*0:([0-9]+):\s*(.*)$").unwrap();
}

/// Extract `(line in the expanded source, column, message)` from one line of a
/// driver log, or `None` if it matches no known driver's format.
fn parse_log_line(line: &str) -> Option<(u32, Option<u32>, String)> {
    if let Some(captures) = MESA_LOG_LINE.captures(line) {
        let (_, [output_line, column, message]) = captures.extract();
        return Some((
            output_line.parse().ok()?,
            column.parse().ok(),
            message.to_string(),
        ));
    }

    if let Some(captures) = NVIDIA_LOG_LINE.captures(line) {
        let (_, [output_line, message]) = captures.extract();
        return Some((output_line.parse().ok()?, None, message.to_string()));
    }

    if let Some(captures) = ANGLE_LOG_LINE.captures(line) {
        let (_, [severity, output_line, message]) = captures.extract();
        return Some((
            output_line.parse().ok()?,
            None,
            format!("{}: {}", severity.to_lowercase(), message),
        ));
    }

    None
}

pub struct ShaderSourceParser {
    included: HashSet<String>,
}

impl ShaderSourceParser {
    pub fn new() -> Self {
        ShaderSourceParser {
            included: HashSet::new(),
        }
    }

    /// Parses a shader string for imports. Imports are recursively processed, and
    /// prepended to the output stream.
    pub fn parse<F: FnMut(&str), G: Fn(&str) -> Cow<'static, str>>(
        &mut self,
        base_filename: &str,
        get_source: &G,
        source_map: &mut ShaderSourceMap,
        output: &mut F,
    ) {
        let source = get_source(base_filename);
        source_map.start_range(format!("{}.glsl", base_filename), 1);
        for (line_number, line) in source.lines().enumerate() {
            if let Some(imports) = line.strip_prefix(SHADER_IMPORT) {
                // For each import, get the source, and recurse.
                for import in imports.split(',') {
                    if self.included.insert(import.into()) {
                        self.parse(import, get_source, source_map, output);
                    } else {
                        output(&format!("// {} is already included\n", import));
                        source_map.next_line();
                    }
                }
                source_map.start_range(format!("{}.glsl", base_filename), line_number + 2);
            } else {
                output(line);
                output("\n");
                source_map.next_line();
            }
        }
    }
}

/// Collect the set of `.glsl` files that `base_filename` pulls in through
/// `#include`, including `base_filename` itself.
pub fn shader_include_closure<G: Fn(&str) -> Cow<'static, str>>(
    base_filename: &str,
    get_source: &G,
) -> HashSet<String> {
    let mut included = HashSet::new();
    collect_includes(base_filename, get_source, &mut included);
    included
}

fn collect_includes<G: Fn(&str) -> Cow<'static, str>>(
    filename: &str,
    get_source: &G,
    included: &mut HashSet<String>,
) {
    if !included.insert(filename.to_string()) {
        return;
    }

    let source = get_source(filename);
    for line in source.lines() {
        if let Some(imports) = line.strip_prefix(SHADER_IMPORT) {
            for import in imports.split(',') {
                collect_includes(import, get_source, included);
            }
        }
    }
}

/// Reads a shader source file from disk into a String.
pub fn shader_source_from_file(shader_path: &Path) -> String {
    assert!(shader_path.exists(), "Shader not found {:?}", shader_path);
    let mut source = String::new();
    File::open(shader_path)
        .expect("Shader not found")
        .read_to_string(&mut source)
        .unwrap();
    source
}

/// Creates heap-allocated strings for both vertex and fragment shaders.
pub fn build_shader_strings<G: Fn(&str) -> Cow<'static, str>>(
    gl_version: ShaderVersion,
    features: &[&str],
    base_filename: &str,
    get_source: &G,
) -> (String, String, ShaderSourceMap, ShaderSourceMap) {
   let mut vs_source = String::new();
   let mut vs_source_map = ShaderSourceMap::new();
   do_build_shader_string(
       gl_version,
       features,
       ShaderKind::Vertex,
       base_filename,
       &mut vs_source_map,
       get_source,
       |s| vs_source.push_str(s),
   );

   let mut fs_source = String::new();
   let mut fs_source_map = ShaderSourceMap::new();
   do_build_shader_string(
       gl_version,
       features,
       ShaderKind::Fragment,
       base_filename,
       &mut fs_source_map,
       get_source,
       |s| fs_source.push_str(s),
   );

   (vs_source, fs_source, vs_source_map, fs_source_map)
}

/// Walks the given shader string and applies the output to the provided
/// callback. Assuming an override path is not used, does no heap allocation
/// and no I/O.
pub fn do_build_shader_string<F: FnMut(&str), G: Fn(&str) -> Cow<'static, str>>(
   gl_version: ShaderVersion,
   features: &[&str],
   kind: ShaderKind,
   base_filename: &str,
   source_map: &mut ShaderSourceMap,
   get_source: &G,
   mut output: F,
) {
   build_shader_prefix_string(gl_version, features, kind, base_filename, source_map, &mut output);
   build_shader_main_string(base_filename, get_source, source_map, &mut output);
}

/// Walks the prefix section of the shader string, which manages the various
/// defines for features etc.
pub fn build_shader_prefix_string<F: FnMut(&str)>(
   gl_version: ShaderVersion,
   features: &[&str],
   kind: ShaderKind,
   base_filename: &str,
   source_map: &mut ShaderSourceMap,
   output: &mut F,
) {
    source_map.start_range("__prefix__".to_string(), 1);

    // GLSL requires that the version number comes first.
    let gl_version_string = match gl_version {
        ShaderVersion::Gl => "#version 150\n",
        ShaderVersion::Gles if features.contains(&"TEXTURE_EXTERNAL_ESSL1") => "#version 100\n",
        ShaderVersion::Gles => "#version 300 es\n",
    };
    output(gl_version_string);
    source_map.next_line();

    // Insert the shader name to make debugging easier.
    output("// shader: ");
    output(base_filename);
    output(" ");
    for (i, feature) in features.iter().enumerate() {
        output(feature);
        if i != features.len() - 1 {
            output(",");
        }
    }
    output("\n");
    source_map.next_line();

    // Define a constant depending on whether we are compiling VS or FS.
    let kind_string = match kind {
        ShaderKind::Vertex => "#define WR_VERTEX_SHADER\n",
        ShaderKind::Fragment => "#define WR_FRAGMENT_SHADER\n",
    };
    output(kind_string);
    source_map.next_line();

    // detect which platform we're targeting
    let is_macos = match std::env::var("CARGO_CFG_TARGET_OS") {
        Ok(os) => os == "macos",
        // if this is not called from build.rs (e.g. if the optimized shader
        // pref is disabled) we want to use the runtime value
        Err(_) => cfg!(target_os = "macos"),
    };
    let is_android = match std::env::var("CARGO_CFG_TARGET_OS") {
        Ok(os) => os == "android",
        Err(_) => cfg!(target_os = "android"),
    };
    if is_macos {
        output("#define PLATFORM_MACOS\n");
        source_map.next_line();
    } else if is_android {
        output("#define PLATFORM_ANDROID\n");
        source_map.next_line();
    }

    // Define a constant for the vertex texture width.
    output("#define WR_MAX_VERTEX_TEXTURE_WIDTH ");
    output(&MAX_VERTEX_TEXTURE_WIDTH_STRING);
    output("U\n");
    source_map.next_line();

    // Add any defines for features that were passed by the caller.
    for feature in features {
        assert!(!feature.is_empty());
        output("#define WR_FEATURE_");
        output(feature);
        output("\n");
        source_map.next_line();
    }
}

/// Walks the main .glsl file, including any imports.
pub fn build_shader_main_string<F: FnMut(&str), G: Fn(&str) -> Cow<'static, str>>(
   base_filename: &str,
   get_source: &G,
   source_map: &mut ShaderSourceMap,
   output: &mut F,
) {
   ShaderSourceParser::new().parse(
       base_filename,
       &|f| get_source(f),
       source_map,
       output
   );
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A source map for a two-file expansion: `__prefix__` occupies output
    /// lines 1-2, `shared.glsl` lines 3-4 (starting at its own line 1), and
    /// `ps_quad_textured.glsl` from line 5 (starting at its own line 7).
    fn test_source_map() -> ShaderSourceMap {
        let mut map = ShaderSourceMap::new();
        map.start_range("__prefix__".to_string(), 1);
        map.next_line();
        map.next_line();
        map.start_range("shared.glsl".to_string(), 1);
        map.next_line();
        map.next_line();
        map.start_range("ps_quad_textured.glsl".to_string(), 7);
        map.next_line();
        map.next_line();
        map
    }

    #[test]
    fn query_resolves_ranges() {
        let map = test_source_map();
        assert_eq!(map.query(1), Some(("__prefix__".to_string(), 1)));
        assert_eq!(map.query(2), Some(("__prefix__".to_string(), 2)));
        assert_eq!(map.query(3), Some(("shared.glsl".to_string(), 1)));
        assert_eq!(map.query(4), Some(("shared.glsl".to_string(), 2)));
        assert_eq!(map.query(5), Some(("ps_quad_textured.glsl".to_string(), 7)));
        assert_eq!(map.query(6), Some(("ps_quad_textured.glsl".to_string(), 8)));
    }

    #[test]
    fn query_of_empty_map_is_none() {
        assert_eq!(ShaderSourceMap::new().query(1), None);
    }

    #[test]
    fn maps_mesa_log() {
        let map = test_source_map();
        let log = "0:5(12): error: syntax error, unexpected '}'\n";
        assert_eq!(
            map.map_log(log),
            vec![ShaderLogLine {
                file: Some("ps_quad_textured.glsl".to_string()),
                line: Some(7),
                column: Some(12),
                message: "error: syntax error, unexpected '}'".to_string(),
            }],
        );
    }

    #[test]
    fn maps_nvidia_log() {
        let map = test_source_map();
        let log = "0(3) : error C1503: undefined variable \"foo\"\n";
        assert_eq!(
            map.map_log(log),
            vec![ShaderLogLine {
                file: Some("shared.glsl".to_string()),
                line: Some(1),
                column: None,
                message: "error C1503: undefined variable \"foo\"".to_string(),
            }],
        );
    }

    #[test]
    fn maps_angle_log() {
        let map = test_source_map();
        let log = "ERROR: 0:6: 'vColor' : undeclared identifier\n";
        assert_eq!(
            map.map_log(log),
            vec![ShaderLogLine {
                file: Some("ps_quad_textured.glsl".to_string()),
                line: Some(8),
                column: None,
                message: "error: 'vColor' : undeclared identifier".to_string(),
            }],
        );
    }

    #[test]
    fn keeps_unrecognized_lines_verbatim() {
        let map = test_source_map();
        let log = "1 error generated.\n\n0:4(1): error: real one\n";
        assert_eq!(
            map.map_log(log),
            vec![
                ShaderLogLine {
                    file: None,
                    line: None,
                    column: None,
                    message: "1 error generated.".to_string(),
                },
                ShaderLogLine {
                    file: Some("shared.glsl".to_string()),
                    line: Some(2),
                    column: Some(1),
                    message: "error: real one".to_string(),
                },
            ],
        );
    }
}
