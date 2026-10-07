/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;
use askama::Result;
use uniffi_bindgen::to_askama_error;

#[askama::filter_fn]
pub fn class_name(ty: &TypeNode, _: &dyn askama::Values) -> Result<String> {
    match ty.class_name() {
        Some(class_name) => Ok(class_name.clone()),
        None => Err(to_askama_error(&format!(
            "Trying to get class name for {:?}",
            ty
        ))),
    }
}

// Render an expression to check if two instances of this type are equal
#[askama::filter_fn]
pub fn field_equals(
    field: &Field,
    _: &dyn askama::Values,
    first_obj: &str,
    second_obj: &str,
) -> Result<String> {
    let name = &field.name;
    Ok(match &field.ty.ty {
        Type::Record { .. } => format!("{first_obj}.{name}.equals({second_obj}.{name})"),
        _ => format!("{first_obj}.{name} == {second_obj}.{name}"),
    })
}

// Remove the trailing comma from a block of text.
//
// This can make generating argument lists more convenient.
#[askama::filter_fn]
pub fn remove_trailing_comma<T: std::fmt::Display>(
    text: T,
    _: &dyn askama::Values,
) -> Result<String> {
    let text = text.to_string();
    let Some(last_comma) = text.rfind(',') else {
        return Ok(text.to_string());
    };
    if !text[last_comma + 1..].chars().all(char::is_whitespace) {
        return Ok(text.to_string());
    }
    Ok(text[..last_comma].to_string())
}
