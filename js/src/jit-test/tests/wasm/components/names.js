// |jit-test| skip-if: !wasmComponentsEnabled()

// ----------------------------------------------------------------------------
// Name well-formedness

function validName(name) {
  return wasmValidateText(`(component
    (type (record (field "${name}" u32)))
  )`);
}
function invalidName(name, err) {
  wasmFailValidateText(`(component
    (type (record (field "${name}" u32)))
  )`, err);
}

// Labels can have many segments.
validName("make-REALLY-cool-cube");

// Labels must start with a letter.
validName("good");
validName("GOOD");
invalidName("0bad", /must start with a letter/);
invalidName("-bad", /invalid character/);
invalidName("@bad", /invalid character/);

// Segments after the first can start with digits.
validName("make-4D-cube");

// In fact, segments after the first can be entirely numeric.
validName("make-9000-cubes");

// Mixed case within a segment is not allowed.
invalidName("Mixed-Case", /mixed case/);
invalidName("mIXED-cASE", /mixed case/);
invalidName("mixed-CAse", /mixed case/);
invalidName("MIXED-caSE", /mixed case/);
invalidName("mixed-11cASE", /mixed case/);
invalidName("MIXED-22Case", /mixed case/);

// Labels cannot contain underscores.
invalidName("no_underscores", /invalid character/);

// Labels cannot contain spaces.
invalidName("no spaces", /invalid character/);

// Labels cannot be empty.
invalidName("", /cannot be empty/);

// Labels cannot have consecutive hyphens.
invalidName("no--double", /invalid character/);

// Labels cannot end with a hyphen.
invalidName("trailing-", /ended unexpectedly/);

// ----------------------------------------------------------------------------
// Plain name annotations
//
// Annotations like [constructor] and [method] are only valid on function names
// per the component model spec, so we use function imports to test this.

// Note: These will have to be updated when we actually start validating
// function signatures for annotations.
function validFuncName(name) {
  wasmValidateText(`(component
    (import "${name}" (func))
  )`);
}
function invalidFuncName(name, err) {
  wasmFailValidateText(`(component
    (import "${name}" (func))
  )`, err);
}

// [constructor] accepts a single label.
validFuncName("[constructor]foo");
validFuncName("[constructor]my-resource");

// [constructor] does not accept a dotted name.
invalidFuncName("[constructor]foo.bar", /invalid character/);

// [constructor] is incompatible with [get] and [set].
invalidFuncName("[constructor][get]foo", /cannot use \[get\] or \[set\]/);
invalidFuncName("[constructor][set]foo", /cannot use \[get\] or \[set\]/);

// [method] requires <label>.<label>.
validFuncName("[method]foo.bar");
validFuncName("[method]foo.BAR");
validFuncName("[method]my-resource.my-method");
validFuncName("[method][get]foo.bar");
validFuncName("[method][set]foo.bar");
invalidFuncName("[method]foo", /ended unexpectedly/);
invalidFuncName("[method]foo.", /ended unexpectedly/);
invalidFuncName("[method].bar", /invalid character/);
invalidFuncName("[method]foo.bar.baz", /invalid character/);

// [static] requires <label>.<label>.
validFuncName("[static]foo.bar");
validFuncName("[static]FOO.bar");
validFuncName("[static]my-resource.my-method");
validFuncName("[static][get]foo.bar");
validFuncName("[static][set]foo.bar");
invalidFuncName("[static]foo", /ended unexpectedly/);
invalidFuncName("[static]foo.", /ended unexpectedly/);
invalidFuncName("[static].bar", /invalid character/);
invalidFuncName("[static]foo.bar.baz", /invalid character/);

// [get] and [set] require just <label>.
validFuncName("[get]foo");
validFuncName("[set]foo");
validFuncName("[get]foo-BAR");
validFuncName("[set]foo-BAR");
invalidFuncName("[get]foo.bar", /invalid character/);
invalidFuncName("[set]foo.bar", /invalid character/);

// Unrecognized annotations are rejected.
invalidFuncName("[unknown]foo", /invalid character/);

// Unclosed annotation bracket is rejected.
invalidFuncName("[methodfoo.bar", /invalid character/);

// Invalid label after a valid annotation.
invalidFuncName("[constructor]0bad", /start with a letter/);

// Annotations must come in the correct order, and some are mutually exclusive.
invalidFuncName("[constructor][constructor]foo", /invalid character/);
invalidFuncName("[constructor][method]foo", /invalid character/);
invalidFuncName("[constructor][static]foo", /invalid character/);
invalidFuncName("[method][constructor]foo", /invalid character/);
invalidFuncName("[static][constructor]foo", /invalid character/);
invalidFuncName("[method][method]foo.foo", /invalid character/);
invalidFuncName("[method][static]foo.foo", /invalid character/);
invalidFuncName("[static][static]foo.foo", /invalid character/);
invalidFuncName("[static][method]foo.foo", /invalid character/);
invalidFuncName("[get][constructor]foo", /invalid character/);
invalidFuncName("[set][constructor]foo", /invalid character/);
invalidFuncName("[get][method]foo", /invalid character/);
invalidFuncName("[set][method]foo", /invalid character/);
invalidFuncName("[get][static]foo", /invalid character/);
invalidFuncName("[get][static]foo", /invalid character/);
invalidFuncName("[get][get]foo", /invalid character/);
invalidFuncName("[get][set]foo", /invalid character/);
invalidFuncName("[set][set]foo", /invalid character/);
invalidFuncName("[set][get]foo", /invalid character/);
