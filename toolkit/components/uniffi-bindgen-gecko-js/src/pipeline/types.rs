/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;
use heck::ToUpperCamelCase;

pub fn map_external_type(input: general::ExternalType, context: &Context) -> Result<ExternalType> {
    Ok(ExternalType {
        self_type: input.self_type.map_node(context)?,
        namespace: namespaces::format_module_name(&input.namespace),
        name: input.name.to_upper_camel_case(),
    })
}

impl TypeNode {
    pub fn ffi_converter(&self) -> String {
        format!("FfiConverter{}", self.canonical_name)
    }

    /// Name of the JS class for this type (only set for user-defined types like
    /// enums/records/interfaces).
    pub fn class_name(&self) -> Option<String> {
        class_name(&self.ty)
    }

    pub fn jsdoc_name(&self) -> String {
        jsdoc_name(&self.ty)
    }
}

fn class_name(ty: &Type) -> Option<String> {
    match ty {
        Type::Interface { name, .. }
        | Type::Record { name, .. }
        | Type::Enum { name, .. }
        | Type::CallbackInterface { name, .. }
        | Type::Custom { name, .. } => Some(name.clone()),
        Type::UInt8
        | Type::Int8
        | Type::UInt16
        | Type::Int16
        | Type::UInt32
        | Type::Int32
        | Type::UInt64
        | Type::Int64
        | Type::Float32
        | Type::Float64
        | Type::Boolean
        | Type::String
        | Type::Bytes
        | Type::Timestamp
        | Type::Duration
        | Type::Sequence { .. }
        | Type::Map { .. }
        | Type::Set { .. } => None,
        Type::Optional { inner_type } | Type::Box { inner_type } => class_name(inner_type),
    }
}

fn jsdoc_name(ty: &Type) -> String {
    match ty {
        Type::Int8
        | Type::UInt8
        | Type::Int16
        | Type::UInt16
        | Type::Int32
        | Type::UInt32
        | Type::Int64
        | Type::UInt64
        | Type::Float32
        | Type::Float64 => "number".into(),
        Type::String => "string".into(),
        // TODO: should be Uint8Array
        Type::Bytes => "string".into(),
        Type::Boolean => "boolean".into(),
        Type::Interface { name, .. }
        | Type::Record { name, .. }
        | Type::CallbackInterface { name, .. }
        | Type::Custom { name, .. } => name.to_upper_camel_case(),
        Type::Enum { name, .. } => {
            let name = name.to_upper_camel_case();
            format!("{name}[keyof {name}]")
        }
        Type::Optional { inner_type } => format!("?{}", jsdoc_name(inner_type)),
        Type::Box { inner_type } => format!("{}", jsdoc_name(inner_type)),
        Type::Sequence { inner_type } => format!("Array.<{}>", jsdoc_name(inner_type)),
        Type::Map { .. } => "Map".into(),
        Type::Set { .. } => "Set".into(),
        Type::Timestamp => unimplemented!("Timestamp"),
        Type::Duration => unimplemented!("Duration"),
    }
}
