/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;

pub fn map_enum(input: general::Enum, context: &Context) -> Result<Enum> {
    let mut context = context.clone();
    context.update_from_enum(&input);

    Ok(Enum {
        js_docstring: js_docstrings::format_docstring(
            input.docstring.as_ref().unwrap_or(&input.name),
        ),
        name: input.name.to_upper_camel_case(),
        is_flat: input.is_flat.map_node(&context)?,
        shape: input.shape.map_node(&context)?,
        variants: input.variants.map_node(&context)?,
        discr_type: input.discr_type.map_node(&context)?,
        docstring: input.docstring.map_node(&context)?,
        self_type: input.self_type.map_node(&context)?,
    })
}

pub fn map_variant(input: general::Variant, context: &Context) -> Result<Variant> {
    let en = context.current_enum()?;
    let name = if en.is_flat && !en.self_type.is_used_as_error {
        input.name.to_shouty_snake_case()
    } else {
        input.name.to_upper_camel_case()
    };

    Ok(Variant {
        js_docstring: js_docstrings::format_docstring(input.docstring.as_ref().unwrap_or(&name)),
        name,
        discr: input.discr.map_node(context)?,
        fields_kind: input.fields_kind,
        fields: records::map_fields(input.fields, context)?,
        docstring: input.docstring.map_node(context)?,
    })
}
