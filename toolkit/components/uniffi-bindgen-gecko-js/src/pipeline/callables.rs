/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::*;
use crate::ConcurrencyMode;

use anyhow::{anyhow, bail, Result};

pub fn map_function(input: general::Function, context: &Context) -> Result<Function> {
    let callable = input.callable.map_node(context)?;
    Ok(Function {
        js_docstring: js_docstrings::format_callable_docstring(&callable, &input.docstring),
        callable,
        docstring: input.docstring,
    })
}

pub fn map_constructor(input: general::Constructor, context: &Context) -> Result<Constructor> {
    let callable = input.callable.map_node(context)?;
    Ok(Constructor {
        js_docstring: js_docstrings::format_callable_docstring(&callable, &input.docstring),
        callable,
        docstring: input.docstring,
    })
}

pub fn map_method(input: general::Method, context: &Context) -> Result<Method> {
    let callable = input.callable.map_node(context)?;
    Ok(Method {
        js_docstring: js_docstrings::format_callable_docstring(&callable, &input.docstring),
        callable,
        docstring: input.docstring,
    })
}

pub fn map_argument(input: general::Argument, context: &Context) -> Result<Argument> {
    let ty = input.ty.map_node(context)?;
    let ffi_value_class = ffi_types::ffi_value_class(&ty)?;
    Ok(Argument {
        name: input.name.to_lower_camel_case(),
        ty,
        by_ref: input.by_ref,
        optional: input.optional,
        default: input.default.map_node(context)?,
        ffi_value_class,
    })
}

pub fn check_for_unconfigured_callables(
    namespace: &general::Namespace,
    config: &Config,
) -> Result<()> {
    let mut unconfigured_callables = vec![];
    namespace.visit(|callable: &general::Callable| {
        if lookup_concurrency_mode(callable, config).is_none() {
            let spec = callable_config_spec(callable);
            let source_info = match &callable.kind {
                general::CallableKind::Function => {
                    format!("Function '{spec}' in module '{}'", namespace.name)
                }
                general::CallableKind::Method { .. } => {
                    format!("Method '{spec}' in module '{}'", namespace.name)
                }
                general::CallableKind::Constructor { .. } => {
                    format!("Constructor '{spec}' in module '{}'", namespace.name)
                }
                general::CallableKind::VTableMethod { .. } => {
                    format!("VTable method '{spec}' in module '{}'", namespace.name)
                }
            };
            let example = match &callable.kind {
                general::CallableKind::Function
                | general::CallableKind::Method { .. }
                | general::CallableKind::Constructor { .. } => {
                    "\"AsyncWrapped\"  # or \"Sync\"".to_string()
                }
                general::CallableKind::VTableMethod { .. } => {
                    "\"FireAndForget\"  # or \"Sync\"".to_string()
                }
            };
            unconfigured_callables.push((spec, source_info, example));
        }
    });

    if unconfigured_callables.is_empty() {
        Ok(())
    } else {
        let mut message = format!(
            "Found {} callables in module '{}' without explicit async/sync configuration in config.toml:\n",
            unconfigured_callables.len(),
            namespace.name,
        );

        for (spec, info, _) in &unconfigured_callables {
            message.push_str(&format!("  - {}: {}\n", spec, info));
        }

        message.push_str(
            "\nPlease add these callables to the `toolkit/components/uniffi-bindgen-gecko-js/config.toml` file with explicit configuration:\n",
        );
        message.push_str(&format!("[{}.async_wrappers]\n", namespace.crate_name));

        for (spec, _, example) in &unconfigured_callables {
            message.push_str(&format!("\"{spec}\" = {example}\n"));
        }
        Err(anyhow!(message))
    }
}

pub fn map_callable(input: general::Callable, context: &Context) -> Result<Callable> {
    let concurrency_mode = lookup_concurrency_mode(&input, context.current_namespace_config()?)
        .ok_or_else(|| anyhow!("Failed to find concurrent_mode ({input:?})"))?;
    let spec = callable_config_spec(&input);
    let kind = input.kind.map_node(context)?;
    let (is_js_async, uniffi_scaffolding_method) = match concurrency_mode {
        ConcurrencyMode::Sync => (false, "UniFFIScaffolding.callSync".to_string()),
        ConcurrencyMode::Async => (true, "UniFFIScaffolding.callAsync".to_string()),
        ConcurrencyMode::AsyncWrapped => {
            if matches!(kind, CallableKind::VTableMethod { .. }) {
                bail!(
                    "VTable method '{spec}' cannot be AsyncWrapped as foreign-implemented trait interfaces don't support async wrapping",
                );
            }
            (true, "UniFFIScaffolding.callAsyncWrapper".to_string())
        }
        ConcurrencyMode::FireAndForget => {
            if !matches!(
                kind,
                CallableKind::VTableMethod {
                    for_callback_interface: true,
                    ..
                }
            ) {
                bail!(
                    "VTable method '{spec}' cannot be FireAndForget as Rust-implemented functions don't support fire-and-forget wrapping",
                );
            }
            // Use placeholder values since these can only be called from Rust.
            (false, "".to_string())
        }
    };

    let name = match &kind {
        CallableKind::Constructor { primary: true, .. } => "init".into(),
        _ => input.name.to_lower_camel_case(),
    };

    Ok(Callable {
        id: context.map_callable_id(input.id),
        name,
        async_data: input.async_data.map_node(context)?,
        is_js_async,
        uniffi_scaffolding_method,
        kind,
        concurrency_mode,
        arguments: input.arguments.map_node(context)?,
        return_type: input
            .return_type
            .ty
            .map(|type_node| {
                let ty: TypeNode = type_node.map_node(context)?;
                anyhow::Ok(ReturnType {
                    ffi_value_class: ffi_types::ffi_value_class(&ty)?,
                    ty,
                })
            })
            .transpose()?,
        throws_type: input
            .throws_type
            .ty
            .map(|type_node| {
                let ty: TypeNode = type_node.map_node(context)?;
                anyhow::Ok(ThrowsType { ty })
            })
            .transpose()?,
        checksum: input.checksum,
        ffi_func: input.ffi_func,
    })
}

fn lookup_concurrency_mode(
    callable: &general::Callable,
    config: &Config,
) -> Option<ConcurrencyMode> {
    let spec = callable_config_spec(callable);
    let concurrency_mode = config.async_wrappers.get(&spec);
    // If the config is not set, check for a parent config
    let concurrency_mode = match concurrency_mode {
        Some(c) => Some(c),
        None => match &callable.kind {
            general::CallableKind::Method { self_type, .. }
            | general::CallableKind::Constructor { self_type, .. }
            | general::CallableKind::VTableMethod { self_type, .. } => {
                let parent = self_type
                    .ty
                    .name()
                    .unwrap_or_else(|| panic!("Invalid self type: {:?}", self_type.ty));
                config.async_wrappers.get(parent)
            }
            _ => None,
        },
    };
    // Finally, default to `Async` for async methods
    match concurrency_mode {
        Some(c) => Some(*c),
        None => {
            if callable.async_data.is_some() {
                Some(ConcurrencyMode::Async)
            } else {
                None
            }
        }
    }
}

fn callable_config_spec(callable: &general::Callable) -> String {
    let name = &callable.name;
    match &callable.kind {
        general::CallableKind::Function => name.clone(),
        general::CallableKind::Method { self_type, .. }
        | general::CallableKind::Constructor { self_type, .. } => {
            let interface_name = self_type
                .ty
                .name()
                .unwrap_or_else(|| panic!("Invalid self type: {:?}", self_type.ty));
            format!("{interface_name}.{name}")
        }
        general::CallableKind::VTableMethod { self_type, .. } => {
            let trait_name = self_type
                .ty
                .name()
                .unwrap_or_else(|| panic!("Invalid self type: {:?}", self_type.ty));
            format!("{trait_name}.{name}")
        }
    }
}

impl Argument {
    /// C++ class field name for this arg
    pub fn field_name_cpp(&self) -> String {
        format!("m{}", self.name.to_upper_camel_case())
    }

    /// C++ function variable name for this arg
    pub fn var_name_cpp(&self) -> String {
        self.name.to_lower_camel_case()
    }

    /// C++ function argument name for this arg
    pub fn arg_name_cpp(&self) -> String {
        format!("a{}", self.name.to_upper_camel_case())
    }
}
