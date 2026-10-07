/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;

pub fn map_ffi_type_node(input: general::FfiType, _context: &Context) -> Result<FfiTypeNode> {
    Ok(FfiTypeNode {
        type_name: ffi_type_name(&input),
        ty: input,
    })
}

fn ffi_type_name(ty: &FfiType) -> String {
    match ty {
        FfiType::UInt8 => "uint8_t".to_owned(),
        FfiType::Int8 => "int8_t".to_owned(),
        FfiType::UInt16 => "uint16_t".to_owned(),
        FfiType::Int16 => "int16_t".to_owned(),
        FfiType::UInt32 => "uint32_t".to_owned(),
        FfiType::Int32 => "int32_t".to_owned(),
        FfiType::UInt64 => "uint64_t".to_owned(),
        FfiType::Int64 => "int64_t".to_owned(),
        FfiType::Float32 => "float".to_owned(),
        FfiType::Float64 => "double".to_owned(),
        FfiType::RustBuffer(_) => "RustBuffer".to_owned(),
        FfiType::ForeignBytes => "ForeignBytes".to_owned(),
        FfiType::Handle(_) => "uint64_t".to_owned(),
        FfiType::RustCallStatus => "RustCallStatus".to_owned(),
        FfiType::Function(name) => name.0.to_owned(),
        FfiType::Struct(name) => name.0.to_owned(),
        FfiType::VoidPointer => "void*".to_owned(),
        FfiType::MutReference(inner) | FfiType::Reference(inner) => {
            format!("{}*", ffi_type_name(inner.as_ref()))
        }
    }
}

pub fn ffi_value_class(type_node: &TypeNode) -> Result<String> {
    let type_name = &type_node.ffi_type.type_name;
    Ok(match &type_node.ffi_type.ty {
        FfiType::UInt8
        | FfiType::Int8
        | FfiType::UInt16
        | FfiType::Int16
        | FfiType::UInt32
        | FfiType::Int32
        | FfiType::UInt64
        | FfiType::Int64 => format!("FfiValueInt<{type_name}>"),
        FfiType::Float32 | FfiType::Float64 => {
            format!("FfiValueFloat<{type_name}>")
        }
        FfiType::RustBuffer(_) => "FfiValueRustBuffer".to_owned(),
        FfiType::Handle(HandleKind::StructInterface { .. })
        | FfiType::Handle(HandleKind::TraitInterface { .. }) => {
            format!("FfiValueObjectHandle{}", type_node.id)
        }
        FfiType::ForeignBytes => "FfiValueTodo".into(),
        ty => bail!("No FfiValue class for: {ty:?}"),
    })
}

impl FfiFunction {
    pub fn arg_types(&self) -> Vec<&str> {
        self.arguments
            .iter()
            .map(|a| a.ty.type_name.as_str())
            .chain(self.has_rust_call_status_arg.then_some("RustCallStatus*"))
            .collect()
    }
}

impl FfiFunctionType {
    pub fn arg_types(&self) -> Vec<&str> {
        self.arguments
            .iter()
            .map(|a| a.ty.type_name.as_str())
            .chain(self.has_rust_call_status_arg.then_some("RustCallStatus*"))
            .collect()
    }
}

impl FfiReturnType {
    pub fn type_name(&self) -> &str {
        match &self.ty {
            Some(ffi_type_node) => &ffi_type_node.type_name,
            None => "void",
        }
    }
}

impl FfiDefinition {
    pub fn name(&self) -> &str {
        match self {
            Self::RustFunction(f) => f.name.0.as_str(),
            Self::FunctionType(f) => f.name.0.as_str(),
            Self::Struct(s) => s.name.0.as_str(),
        }
    }
}
