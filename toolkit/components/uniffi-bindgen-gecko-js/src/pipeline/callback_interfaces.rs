/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;

pub fn map_callback_interface(
    input: general::CallbackInterface,
    context: &Context,
) -> Result<CallbackInterface> {
    let self_type = input.self_type.map_node(context)?;
    let vtable = map_vtable(input.vtable, &self_type, context)?;
    let interface_base_class = InterfaceBaseClass {
        name: input.name.clone(),
        methods: vtable
            .methods
            .iter()
            .map(|vtable_meth| {
                Method {
                    callable: vtable_meth.callable.clone(),
                    // We don't have docstrings in this case, but that's probably fine
                    docstring: None,
                    js_docstring: js_docstrings::format_callable_docstring(
                        &vtable_meth.callable,
                        &None,
                    ),
                }
            })
            .collect(),
        docstring: input.docstring.clone(),
        js_docstring: js_docstrings::format_docstring(
            input.docstring.as_ref().unwrap_or(&input.name),
        ),
    };

    Ok(CallbackInterface {
        js_docstring: js_docstrings::format_docstring(
            input.docstring.as_ref().unwrap_or(&input.name),
        ),
        interface_base_class,
        name: input.name,
        vtable,
        docstring: input.docstring,
        self_type,
    })
}

pub fn map_vtable(
    input: general::VTable,
    self_type: &TypeNode,
    context: &Context,
) -> Result<VTable> {
    Ok(VTable {
        interface_name: input.interface_name,
        callback_interface: matches!(self_type.ty, Type::CallbackInterface { .. }),
        callback_interface_id: context.callback_interface_id(self_type.id)?,
        struct_type: input.struct_type.map_node(context)?,
        init_fn: input.init_fn,
        methods: input.methods.map_node(context)?,
    })
}

pub fn cpp_callback_interface(
    interface_name: &str,
    self_type: &TypeNode,
    vtable: &VTable,
    context: &Context,
) -> Result<CppCallbackInterface> {
    let id = context.callback_interface_id(self_type.id)?;
    let ffi_value_class = match &self_type.ty {
        // Only generate FFI value class for callback interfaces.  For trait
        // interfaces, we're going to generate one `PointerTypes.cpp` instead.
        Type::CallbackInterface { .. } => Some(format!("FfiValueObjectHandle{}", self_type.id)),
        _ => None,
    };

    Ok(CppCallbackInterface {
        id,
        name: interface_name.to_string(),
        ffi_value_class,
        handler_var: format!("gUniffiCallbackHandler{id}"),
        vtable_var: format!("kUniffiVtable{id}"),
        vtable_struct_type: vtable.struct_type.clone(),
        init_fn: vtable.init_fn.clone(),
        free_fn: format!("callback_free_{id}"),
        clone_fn: format!("callback_clone_{id}"),
        methods: vtable
            .methods
            .iter()
            .enumerate()
            .map(|(i, meth)| cpp_callback_interface_method(meth.clone(), id, i, context))
            .collect::<Result<Vec<_>>>()?,
    })
}

fn cpp_callback_interface_method(
    meth: VTableMethod,
    callback_id: u64,
    method_index: usize,
    context: &Context,
) -> Result<CppCallbackInterfaceMethod> {
    let (return_ty, out_pointer_ty) = match &meth.callable.return_type {
        Some(return_ty) => {
            let out_pointer_ty = FfiType::MutReference(Box::new(return_ty.ty.ffi_type.ty.clone()));
            (Some(return_ty.clone()), out_pointer_ty)
        }
        None => (None, FfiType::VoidPointer),
    };

    let kind = match meth.callable.async_data {
        // Callback interface methods defined as sync in the Rust code are either `Sync` or
        // `FireAndForget`, depending on the configuration.
        None => match &meth.callable.concurrency_mode {
            ConcurrencyMode::Sync => CallbackMethodKind::Sync,
            ConcurrencyMode::FireAndForget => CallbackMethodKind::FireAndForget,
            _ => bail!(
                "Invalid concurrency_mode for callback method: {} ({:?})",
                meth.callable.name,
                meth.callable.concurrency_mode,
            ),
        },
        // Callback interface methods defined as async in the Rust code are always `Async`.
        Some(async_data) => CallbackMethodKind::Async(async_data),
    };

    let return_handler_class_name = match &return_ty {
        None => "CallbackLowerReturnVoid".to_string(),
        Some(return_ty) => match &return_ty.ty.ffi_type.ty {
            FfiType::UInt8 => "CallbackLowerReturnUInt8".to_string(),
            FfiType::Int8 => "CallbackLowerReturnInt8".to_string(),
            FfiType::UInt16 => "CallbackLowerReturnUInt16".to_string(),
            FfiType::Int16 => "CallbackLowerReturnInt16".to_string(),
            FfiType::UInt32 => "CallbackLowerReturnUInt32".to_string(),
            FfiType::Int32 => "CallbackLowerReturnInt32".to_string(),
            FfiType::UInt64 => "CallbackLowerReturnUInt64".to_string(),
            FfiType::Int64 => "CallbackLowerReturnInt64".to_string(),
            FfiType::Float32 => "CallbackLowerReturnFloat32".to_string(),
            FfiType::Float64 => "CallbackLowerReturnFloat64".to_string(),
            FfiType::RustBuffer(_) => "CallbackLowerReturnRustBuffer".to_string(),
            FfiType::Handle(HandleKind::TraitInterface {
                namespace,
                interface_name,
            }) => {
                format!("CallbackLowerReturnCallbackInterface{namespace}_{interface_name}")
            }
            FfiType::Handle(HandleKind::StructInterface { .. }) => {
                "CallbackLowerReturnUInt8".to_string()
            }
            ty => bail!("Invalid callback return FFI type: {ty:?}"),
        },
    };

    Ok(CppCallbackInterfaceMethod {
        kind,
        arguments: meth.callable.arguments,
        fn_name: format!("callback_interface_method_{callback_id}_{method_index}",),
        return_handler_class_name,
        async_handler_class_name: format!("CallbackInterfaceMethod{callback_id}{method_index}",),
        return_ty,
        out_pointer_ty: out_pointer_ty.map_node(context)?,
    })
}

impl CppCallbackReturnHandlerClass {
    pub fn return_type_name(&self) -> &str {
        match &self.return_ty {
            Some(return_ty) => &return_ty.ty.ffi_type.type_name,
            None => "void",
        }
    }
}

impl VTable {
    pub fn js_handler_var(&self) -> String {
        format!("uniffiCallbackHandler{}", self.interface_name)
    }
}
