/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;
use std::borrow::Cow;

/// Format a docstring for the JS code
pub fn format_docstring(docstring: &str) -> String {
    // Remove any existing indentation
    let docstring = textwrap::dedent(docstring);
    // "Escape" `*/` chars to avoid closing the comment
    let docstring = docstring.replace("*/", "* /");
    // Format the docstring making sure to:
    //   - Start with `/**` and end with `*/`
    //   - Line up all the `*` chars correctly
    //   - Add trailing leading spaces, to make this work with the `{{ -}}` tag
    let mut output = String::default();
    output.push_str("/**\n");
    for line in docstring.split('\n') {
        output.push_str(" * ");
        output.push_str(line);
        output.push('\n');
    }
    output.push_str(" */");
    output
}

/// Format a docstring for a function/method
pub fn format_callable_docstring(callable: &Callable, docstring: &Option<String>) -> String {
    let mut parts = vec![Cow::from(docstring.as_ref().unwrap_or(&callable.name))];
    for arg in callable.arguments.iter() {
        let type_name = arg.ty.jsdoc_name();
        let arg_name = &arg.name;
        parts.push(format!("@param {{{type_name}}} {arg_name}").into());
    }
    if let Some(return_ty) = &callable.return_type {
        let type_name = &return_ty.ty.jsdoc_name();
        parts.push(if callable.is_js_async {
            format!("@returns {{Promise<{type_name}>}}}}").into()
        } else {
            format!("@returns {{{type_name}}}").into()
        });
    }
    format_docstring(&parts.join("\n"))
}
