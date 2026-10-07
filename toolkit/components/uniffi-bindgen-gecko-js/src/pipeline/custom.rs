/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;

pub fn map_custom_type(input: general::CustomType, context: &Context) -> Result<CustomType> {
    let config = context
        .current_namespace_config()?
        .custom_types
        .get(&input.name);

    Ok(CustomType {
        js_docstring: js_docstrings::format_docstring(
            input.docstring.as_ref().unwrap_or(&input.name),
        ),
        name: input.name.map_node(context)?,
        builtin: input.builtin.map_node(context)?,
        docstring: input.docstring.map_node(context)?,
        self_type: input.self_type.map_node(context)?,
        type_name: config.and_then(|c| c.type_name.clone()),
        lift_expr: config.map(|c| c.lift.replace("{}", "builtinVal")),
        lower_expr: config.map(|c| c.lower.replace("{}", "value")),
    })
}
