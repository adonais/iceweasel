/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;

pub fn map_record(input: general::Record, context: &Context) -> Result<Record> {
    Ok(Record {
        js_docstring: js_docstrings::format_docstring(
            input.docstring.as_ref().unwrap_or(&input.name),
        ),
        name: input.name.to_upper_camel_case(),
        fields_kind: input.fields_kind,
        fields: map_fields(input.fields, context)?,
        docstring: input.docstring.map_node(context)?,
        self_type: input.self_type.map_node(context)?,
    })
}

pub fn map_fields(input: Vec<general::Field>, context: &Context) -> Result<Vec<Field>> {
    input
        .into_iter()
        .enumerate()
        .map(|(index, field)| {
            let ty = field.ty.map_node(context)?;
            let type_docstring = format!("@type {{{}}}", ty.jsdoc_name());
            let full_docstring = match &field.docstring {
                Some(docstring) => format!("{docstring}\n{type_docstring}"),
                None => type_docstring.to_string(),
            };
            let js_docstring = js_docstrings::format_docstring(&full_docstring);

            Ok(Field {
                js_docstring,
                ty,
                name: if field.name.is_empty() {
                    format!("v{index}")
                } else {
                    field.name.to_lower_camel_case()
                },
                default: field.default.map_node(context)?,
                docstring: field.docstring.map_node(context)?,
            })
        })
        .collect()
}
