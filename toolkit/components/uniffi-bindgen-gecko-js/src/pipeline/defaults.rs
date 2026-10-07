/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;
use heck::{ToShoutySnakeCase, ToUpperCamelCase};

pub fn map_literal_node(input: general::Literal, context: &Context) -> Result<LiteralNode> {
    let lit = input.map_node(context)?;
    Ok(LiteralNode {
        js_lit: js_lit(&lit),
        lit,
    })
}

pub fn map_default_value_node(
    input: general::DefaultValue,
    context: &Context,
) -> Result<DefaultValueNode> {
    let default = input.map_node(context)?;
    let js_lit = render_default(&default)?;
    Ok(DefaultValueNode { default, js_lit })
}

pub(super) fn render_default(default: &DefaultValue) -> Result<String> {
    Ok(match default {
        DefaultValue::Default(tn) => match &tn.ty {
            Type::UInt8
            | Type::UInt16
            | Type::UInt32
            | Type::UInt64
            | Type::Int8
            | Type::Int16
            | Type::Int32
            | Type::Int64 => "0".to_string(),
            Type::Float32 | Type::Float64 => "0.0".to_string(),
            Type::Boolean => "false".to_string(),
            Type::Bytes => "new Uint8Array(0)".to_string(),
            Type::String => "\"\"".to_string(),
            Type::Record { .. }
            | Type::Enum { .. }
            | Type::Interface { .. }
            | Type::CallbackInterface { .. } => {
                let name = tn
                    .ty
                    .name()
                    .ok_or_else(|| anyhow!("{:?} returned None for name", tn.ty))?;
                format!("new {name}()")
            }
            Type::Optional { .. } => "null".to_string(),
            Type::Map { .. } => "{}".to_string(),
            Type::Sequence { .. } => "[]".to_string(),
            Type::Custom { builtin, .. } => {
                return render_default(&DefaultValue::Default(TypeNode {
                    ty: *builtin.clone(),
                    ..tn.clone()
                }))
                .map_err(|_err| anyhow::anyhow!("Default values not supported for {:?}", tn.ty))
            }
            _ => bail!("Default values not supported for {:?}", tn.ty),
        },
        // We assume the Literal pass has already run, so `js_lit` already has a value.
        DefaultValue::Literal(lit) => lit.js_lit.clone(),
    })
}

fn js_lit(lit: &Literal) -> String {
    match lit {
        Literal::Boolean(inner) => inner.to_string(),
        Literal::String(inner) => format!("\"{}\"", inner),
        Literal::UInt(num, radix, _) => number_lit(radix, num).to_string(),
        Literal::Int(num, radix, _) => number_lit(radix, num).to_string(),
        Literal::Float(num, _) => num.clone(),
        Literal::Enum(name, typ) => enum_lit(&typ.ty, name),
        Literal::EmptyMap => "{}".to_string(),
        Literal::EmptySet => "new Set()".to_string(),
        Literal::EmptySequence => "[]".to_string(),
        Literal::Some { inner } => inner.js_lit.clone(),
        Literal::None => "null".to_string(),
    }
}

fn number_lit(
    radix: &Radix,
    num: impl std::fmt::Display + std::fmt::LowerHex + std::fmt::Octal,
) -> String {
    match radix {
        Radix::Decimal => format!("{}", num),
        Radix::Hexadecimal => format!("{:#x}", num),
        Radix::Octal => format!("{:#o}", num),
    }
}

fn enum_lit(typ: &Type, variant_name: &str) -> String {
    if let Type::Enum { name, .. } = typ {
        format!(
            "{}.{}",
            name.to_upper_camel_case(),
            variant_name.to_shouty_snake_case()
        )
    } else {
        panic!("Rendering an enum literal on a type that is not an enum")
    }
}
