// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use std::marker::PhantomData;

use malloc_size_of::MallocSizeOf;

use glean_core::metrics::{JsonValue, MetricIdentifier};
use glean_core::traits;

use crate::ErrorType;

// We need to wrap the glean-core type: otherwise if we try to implement
// the trait for the metric in `glean_core::metrics` we hit error[E0117]:
// only traits defined in the current crate can be implemented for arbitrary
// types.

/// Developer-facing API for recording object metrics.
///
/// Instances of this class type are automatically generated by the parsers
/// at build time, allowing developers to record values that were previously
/// registered in the metrics.yaml file.
#[derive(Clone)]
pub struct ObjectMetric<K> {
    pub(crate) inner: glean_core::metrics::ObjectMetric,
    object_type: PhantomData<K>,
}

impl<K> MallocSizeOf for ObjectMetric<K> {
    fn size_of(&self, ops: &mut malloc_size_of::MallocSizeOfOps) -> usize {
        self.inner.size_of(ops)
    }
}

impl<'a, K> MetricIdentifier<'a> for ObjectMetric<K> {
    fn get_identifiers(&'a self) -> (&'a str, &'a str, Option<&'a str>) {
        self.inner.get_identifiers()
    }
}

impl<K: traits::ObjectSerialize> ObjectMetric<K> {
    /// The public constructor used by automatically generated metrics.
    pub fn new(meta: glean_core::CommonMetricData) -> Self {
        let inner = glean_core::metrics::ObjectMetric::new(meta);
        Self {
            inner,
            object_type: PhantomData,
        }
    }

    /// Sets to the specified structure.
    ///
    /// # Arguments
    ///
    /// * `object` - the object to set.
    pub fn set(&self, object: K) {
        let obj = object
            .into_serialized_object()
            .expect("failed to serialize object. This should be impossible.");
        self.inner.set(obj);
    }

    /// Sets to the specified structure.
    ///
    /// Parses the passed JSON string.
    /// If it can't be parsed into a valid object it records an invalid value error.
    ///
    /// # Arguments
    ///
    /// * `object` - JSON representation of the object to set.
    pub fn set_string(&self, object: String) {
        let data = match K::from_str(&object) {
            Ok(data) => data,
            Err(_) => {
                self.inner.record_schema_error();
                return;
            }
        };
        self.set(data)
    }

    /// **Test-only API (exported for FFI purposes).**
    ///
    /// Gets the currently stored value as JSON-encoded string.
    ///
    /// This doesn't clear the stored value.
    pub fn test_get_value<'a, S: Into<Option<&'a str>>>(&self, ping_name: S) -> Option<JsonValue> {
        let ping_name = ping_name.into().map(|s| s.to_string());
        self.inner.test_get_value(ping_name)
    }

    /// **Exported for test purposes.**
    ///
    /// Gets the number of recorded errors for the given metric and error type.
    ///
    /// # Arguments
    ///
    /// * `error` - The type of error
    ///
    /// # Returns
    ///
    /// The number of errors reported.
    pub fn test_get_num_recorded_errors(&self, error: ErrorType) -> i32 {
        self.inner.test_get_num_recorded_errors(error)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::common_test::{lock_test, new_glean};
    use crate::CommonMetricData;

    use serde_json::json;

    #[test]
    fn simple_array() {
        let _lock = lock_test();
        let _t = new_glean(None, true);

        type SimpleArray = Vec<i64>;

        let metric: ObjectMetric<SimpleArray> = ObjectMetric::new(CommonMetricData {
            name: "object".into(),
            category: "test".into(),
            send_in_pings: vec!["store1".into()],
            ..Default::default()
        });

        let arr = SimpleArray::from([1, 2, 3]);
        metric.set(arr);

        let data = metric.test_get_value(None).expect("no object recorded");
        let expected = json!([1, 2, 3]);
        assert_eq!(expected, data);
    }

    #[test]
    fn complex_nested_object() {
        let _lock = lock_test();
        let _t = new_glean(None, true);

        type BalloonsObject = Vec<BalloonsObjectItem>;

        #[derive(
            Debug, Hash, Eq, PartialEq, traits::__serde::Deserialize, traits::__serde::Serialize,
        )]
        #[serde(crate = "traits::__serde")]
        #[serde(deny_unknown_fields)]
        struct BalloonsObjectItem {
            #[serde(skip_serializing_if = "Option::is_none")]
            colour: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            diameter: Option<i64>,
        }

        let metric: ObjectMetric<BalloonsObject> = ObjectMetric::new(CommonMetricData {
            name: "object".into(),
            category: "test".into(),
            send_in_pings: vec!["store1".into()],
            ..Default::default()
        });

        let balloons = BalloonsObject::from([
            BalloonsObjectItem {
                colour: Some("red".to_string()),
                diameter: Some(5),
            },
            BalloonsObjectItem {
                colour: Some("green".to_string()),
                diameter: None,
            },
        ]);
        metric.set(balloons);

        let data = metric.test_get_value(None).expect("no object recorded");
        let expected = json!([
            { "colour": "red", "diameter": 5 },
            { "colour": "green" },
        ]);
        assert_eq!(expected, data);
    }

    #[test]
    fn set_string_api() {
        let _lock = lock_test();
        let _t = new_glean(None, true);

        type SimpleArray = Vec<i64>;

        let metric: ObjectMetric<SimpleArray> = ObjectMetric::new(CommonMetricData {
            name: "object".into(),
            category: "test".into(),
            send_in_pings: vec!["store1".into()],
            ..Default::default()
        });

        let arr_str = String::from("[1, 2, 3]");
        metric.set_string(arr_str);

        let data = metric.test_get_value(None).expect("no object recorded");
        let expected = json!([1, 2, 3]);
        assert_eq!(expected, data);
    }

    #[test]
    fn set_string_api_complex() {
        let _lock = lock_test();
        let _t = new_glean(None, true);

        #[derive(
            Debug, Hash, Eq, PartialEq, traits::__serde::Deserialize, traits::__serde::Serialize,
        )]
        #[serde(crate = "traits::__serde")]
        #[serde(deny_unknown_fields)]
        struct StackTrace {
            #[serde(skip_serializing_if = "Option::is_none")]
            error: Option<String>,
            #[serde(
                skip_serializing_if = "Vec::is_empty",
                default = "Vec::new",
                deserialize_with = "traits::__serde_helper::vec_null"
            )]
            modules: Vec<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            thread_info: Option<StackTraceThreadInfo>,
        }

        #[derive(
            Debug, Hash, Eq, PartialEq, traits::__serde::Serialize, traits::__serde::Deserialize,
        )]
        #[serde(crate = "traits::__serde")]
        #[serde(deny_unknown_fields)]
        struct StackTraceThreadInfo {
            base_address: Option<String>,
        }

        let metric: ObjectMetric<StackTrace> = ObjectMetric::new(CommonMetricData {
            name: "object".into(),
            category: "test".into(),
            send_in_pings: vec!["store1".into()],
            ..Default::default()
        });

        let arr_str = json!({
            "error": "error",
            "modules": null,
            "thread_info": null,
        })
        .to_string();
        metric.set_string(arr_str);

        let data = metric.test_get_value(None).expect("no object recorded");
        let expected = json!({
            "error": "error"
        });
        assert_eq!(expected, data);
        assert_eq!(
            0,
            metric.test_get_num_recorded_errors(ErrorType::InvalidValue)
        );
    }
}
