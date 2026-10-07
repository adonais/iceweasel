/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


// Callback interface FfiValueClasses
//
// These need to come first so they're defined for the scaffolding call code
{%- for lib in root.libraries() %}
{{ lib.ifdef_start() }}

{%- for cbi in lib.callback_interfaces %}
{%- if let Some(ffi_value_class) = cbi.ffi_value_class %}

// Forward declare the free function, which is defined later on in `CallbackInterfaces.cpp`
extern "C" void {{ cbi.free_fn }}(uint64_t uniffiHandle);

// FfiValue class for {{ cbi.name }} callback interface handles
//
// This works like the `FfiValueInt<uint64_t>`, except it has extra code to
// cleanup the callback handles.
class {{ ffi_value_class }} {
 private:
  uint64_t mValue = 0;

 public:
  {{ ffi_value_class }}() = default;
  explicit {{ ffi_value_class }}(uint64_t aValue) : mValue(aValue) {}

  void Lower(const dom::OwningUniFFIScaffoldingValue& aValue,
             ErrorResult& aError) {
    if (!aValue.IsDouble()) {
      aError.ThrowTypeError("Bad argument type"_ns);
      return;
    }
    double floatValue = aValue.GetAsDouble();

    uint64_t intValue = static_cast<uint64_t>(floatValue);
    if (intValue != floatValue) {
      aError.ThrowTypeError("Not an integer"_ns);
      return;
    }
    ReleaseHandleIfSet();
    mValue = intValue;
  }

  void Lift(JSContext* aContext, dom::OwningUniFFIScaffoldingValue* aDest,
            ErrorResult& aError) {
    aDest->SetAsDouble() = mValue;
    mValue = 0;
  }

  uint64_t IntoRust() {
    auto handle = mValue;
    mValue = 0;
    return handle;
  }

  static {{ ffi_value_class }} FromRust(uint64_t aValue) { return {{ ffi_value_class }}(aValue); };

  void ReleaseHandleIfSet() {
    // A non-zero value indicates that we own a callback handle that was never passed to Rust or
    // lifted to JS.  Call the free function to decrease the refcount.
    if (mValue != 0) {
        {{ cbi.free_fn }}(mValue);
        mValue = 0;
    }
  }

  ~{{ ffi_value_class }}() {
    ReleaseHandleIfSet();
  }
};

{%- endif %}
{%- endfor %}
{{ lib.ifdef_end() }}
{%- endfor %}
