/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;

pub fn map_interface(input: general::Interface, context: &Context) -> Result<Interface> {
    let imp = input.imp.map_node(context)?;
    let methods = input.methods.map_node(context)?;
    let name = input.name.to_upper_camel_case();

    let (interface_base_class, js_class_name) = match &imp {
        ObjectImpl::Trait(kind) if kind.has_foreign() => {
            // Trait interface that can be implemented in Rust or Python. Give the protocol the
            // main name and append the `Impl` suffix to the interface.
            (
                InterfaceBaseClass {
                    name: name.clone(),
                    methods: methods.clone(),
                    docstring: input.docstring.clone(),
                    js_docstring: js_docstrings::format_docstring(
                        input.docstring.as_ref().unwrap_or(&name),
                    ),
                },
                format!("{}Impl", name),
            )
        }
        _ => {
            let interface_name = format!("{}Interface", name);
            // Interface that's only implemented in Rust. Give the interface the main name and
            // append the `Protocol` suffix to the protocol.
            (
                InterfaceBaseClass {
                    js_docstring: js_docstrings::format_docstring(
                        input.docstring.as_ref().unwrap_or(&interface_name),
                    ),
                    name: interface_name,
                    methods: methods.clone(),
                    docstring: input.docstring.clone(),
                },
                name.clone(),
            )
        }
    };
    let js_docstring = js_docstrings::format_docstring(input.docstring.as_ref().unwrap_or(&name));
    let self_type = input.self_type.map_node(context)?;
    let pointer_id = context.pointer_id(self_type.id)?;
    let vtable = match input.vtable {
        None => None,
        Some(v) => Some(callback_interfaces::map_vtable(v, &self_type, context)?),
    };

    Ok(Interface {
        name,
        js_class_name,
        interface_base_class,
        constructors: input.constructors.map_node(context)?,
        methods,
        uniffi_trait_methods: input.uniffi_trait_methods.map_node(context)?,
        trait_impls: input.trait_impls.map_node(context)?,
        imp: input.imp,
        docstring: input.docstring,
        js_docstring,
        self_type,
        pointer_id,
        vtable,
        ffi_func_clone: input.ffi_func_clone.map_node(context)?,
        ffi_func_free: input.ffi_func_free.map_node(context)?,
    })
}
