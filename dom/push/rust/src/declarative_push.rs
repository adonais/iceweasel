/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use nsstring::{nsACString, nsCString, nsString};
use serde::{Deserialize, Deserializer};
use thin_vec::ThinVec;
use url::Url;

#[derive(Clone, Copy, Deserialize, Default)]
#[repr(u8)]
pub enum DeclarativePushDir {
    #[serde(rename = "ltr")]
    Ltr,
    #[serde(rename = "rtl")]
    Rtl,
    #[serde(rename = "auto")]
    #[default]
    Auto,
}

// Deserializes as Ok(T) for valid values, and WrongType(json_value) if
// the deserialization as T failed.
#[derive(Deserialize)]
#[serde(untagged)]
enum Forgiving<T> {
    Ok(T),
    #[allow(dead_code)]
    WrongType(serde_json::Value),
}

// serde_json deserialization for Option fails if the value is present
// but with the wrong type. However, the spec instead ignores such values,
// so we need our own deserializer. This uses T::default() if the value has
// the wrong type.
fn forgiving_deserialize<'a, T: Deserialize<'a> + Default, D: Deserializer<'a>>(
    deserializer: D,
) -> Result<T, D::Error> {
    let result: Forgiving<T> = Deserialize::deserialize(deserializer)?;
    Ok(match result {
        Forgiving::Ok(value) => value,
        _ => T::default(),
    })
}

#[repr(C)]
pub struct DeclarativePushAction {
    action: nsString,
    title: nsString,
    navigate: nsCString,
}

#[repr(C)]
pub struct DeclarativePushData {
    title: nsString,
    navigate: nsCString,
    lang: nsString,
    body: nsString,
    icon: nsCString,
    tag: nsString,
    data: nsString,
    actions: ThinVec<DeclarativePushAction>,
    dir: DeclarativePushDir,
    silent: bool,
    require_interaction: bool,
    mutable: bool,
}

#[derive(Deserialize)]
struct ActionJSON {
    action: String,
    title: String,
    navigate: String,
}

/// notification member of https://w3c.github.io/push-api/#members
#[derive(Deserialize)]
#[allow(non_snake_case)]
struct NotificationJSON {
    title: String,
    navigate: String,
    data: Option<serde_json::Value>,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    dir: DeclarativePushDir,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    lang: String,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    body: String,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    tag: String,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    icon: Option<String>,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    silent: bool,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    requireInteraction: bool,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    actions: Vec<Forgiving<ActionJSON>>,
    #[serde(default, deserialize_with = "forgiving_deserialize")]
    mutable: bool,
}

/// Declarative push message data. https://w3c.github.io/push-api/#members
#[derive(Deserialize)]
struct DeclarativePushJSON {
    web_push: u16,
    notification: NotificationJSON,
}

// https://w3c.github.io/push-api/#dfn-declarative-push-message-parser
fn parse_declarative_push_option(
    data: &[u8],
    base_url: &nsACString,
) -> Option<DeclarativePushData> {
    let base_url = base_url.to_utf8();
    // Step 1: Let message be the result of parsing JSON bytes to an Infra value given bytes.
    //         If that throws an exception, then return failure.
    // (Leads to https://encoding.spec.whatwg.org/#utf-8-decode which does lossy decoding)
    let string = String::from_utf8_lossy(data);
    let data: DeclarativePushJSON = serde_json::from_str(string.as_ref()).ok()?;
    if data.web_push != 8030 {
        return None;
    }
    let notification = data.notification;
    let data = match notification.data {
        None => nsString::new(),
        Some(data) => {
            let string = serde_json::to_string(&data)
                .expect("Serializing serde_json::Value as JSON should never fail");
            nsString::from(&string)
        }
    };
    let base_url = Url::parse(base_url.as_ref()).ok()?;
    let mut actions = ThinVec::with_capacity(notification.actions.len());
    for action in notification.actions {
        // We skip actions which don't have required members:
        // Step 25.2.1: If actionInput["action"] does not exist or is not a string,
        //              then continue.
        //           2: If actionInput["title"] does not exist or is not a string,
        //              then continue.
        //           3: If actionInput["navigate"] does not exist or is not a string,
        //              then continue.
        let Forgiving::Ok(action) = action else {
            continue;
        };
        // But fail parsing entirely if the navigate URL is invalid:
        // Step 28: If the navigation URL of any notification action of
        //          notification's actions is null, then return failure.
        let navigate: String = base_url.join(&action.navigate).ok()?.into();
        actions.push(DeclarativePushAction {
            action: nsString::from(&action.action),
            title: nsString::from(&action.title),
            navigate: nsCString::from(navigate),
        });
    }
    // https://notifications.spec.whatwg.org/#create-a-notification
    // Step 13: If options["icon"] exists, then parse it using baseURL,
    //          and if that does not return failure, set notification’s icon URL
    //          to the return value. (Otherwise notification’s icon URL is not set.)
    let mut icon = String::new();
    if let Some(icon_relative) = notification.icon
        && let Ok(url) = base_url.join(&icon_relative) {
        icon = url.into();
    };
    // https://w3c.github.io/push-api/#dfn-declarative-push-message-parser
    // Step 27: If notification's navigation URL is null, then return failure.
    let navigate: String = base_url.join(&notification.navigate).ok()?.into();
    Some(DeclarativePushData {
        title: nsString::from(&notification.title),
        navigate: nsCString::from(navigate),
        data,
        dir: notification.dir,
        lang: nsString::from(&notification.lang),
        body: nsString::from(&notification.body),
        icon: nsCString::from(icon),
        tag: nsString::from(&notification.tag),
        silent: notification.silent,
        require_interaction: notification.requireInteraction,
        actions,
        mutable: notification.mutable,
    })
}

/// Parse declarative push message.
/// https://w3c.github.io/push-api/#dfn-declarative-push-message-parser
#[unsafe(no_mangle)]
pub unsafe extern "C" fn parse_declarative_push(
    data: *const u8,
    length: usize,
    base_url: &nsACString,
    output: &mut DeclarativePushData,
) -> bool {
    let data = unsafe { std::slice::from_raw_parts(data, length) };
    match parse_declarative_push_option(data, base_url) {
        Some(push) => {
            *output = push;
            true
        }
        None => false,
    }
}
