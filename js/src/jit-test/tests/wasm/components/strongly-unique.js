// |jit-test| skip-if: !wasmComponentsEnabled()

const specOkImports = `
  (import "foo" (type $foo (sub resource)))
  (import "foo-bar" (func))
  (import "[constructor]foo" (func (result (own $foo))))
  (import "[method]foo.bar" (func (param "self" (borrow $foo))))
  (import "[static]foo.baz" (func))
  (import "[get]prop" (func (result u32)))
  (import "[set]prop" (func (param "v" u32)))
  (import "[method][get]foo.prop" (func (param "self" (borrow $foo)) (result u32)))
  (import "[method][set]foo.prop" (func (param "self" (borrow $foo)) (param "v" u32)))
  (import "[static][get]foo.prop-2" (func (result u32)))
  (import "[static][set]foo.prop-2" (func (param "v" u32)))
  ;; For now this is allowed. In the future these are expected to conflict with
  ;; [method][get]foo.prop and [method][set]foo.prop.
  (import "[method]foo.get-prop" (func (param "self" (borrow $foo))))
  (import "[method]foo.set-prop" (func (param "self" (borrow $foo))))
`;
wasmValidateText(`(component
  ${specOkImports}
)`);

function assertNotStronglyUnique(badName) {
  wasmFailValidateText(`(component
    ${specOkImports}
    (import "${badName}" (func))
  )`, /not strongly-unique/);
}

// Conflicts with "foo"
assertNotStronglyUnique("foo");
assertNotStronglyUnique("FOO");
assertNotStronglyUnique("[method]foo.foo");
assertNotStronglyUnique("[get]foo");
assertNotStronglyUnique("[method][get]foo.foo");
assertNotStronglyUnique("[static][set]foo.FOO");

// Conflicts with "foo-bar"
assertNotStronglyUnique("foo-BAR");
assertNotStronglyUnique("[static]foo-BAR.FOO-bar");

// Conflicts with "[constructor]foo"
assertNotStronglyUnique("[constructor]FOO");

// Conflicts with "[method]foo.bar"
assertNotStronglyUnique("[method]foo.BAR");
assertNotStronglyUnique("[static]foo.bar");

// Conflicts with "[static]foo.baz"
assertNotStronglyUnique("[method]foo.baz");

// Conflicts with "[get]prop"
assertNotStronglyUnique("prop");

// Conflicts with "[set]prop"
assertNotStronglyUnique("[set]PROP");

// Conflicts with "[method][get]foo.prop"
assertNotStronglyUnique("[method]foo.prop");
assertNotStronglyUnique("[static]foo.PROP");
assertNotStronglyUnique("[method][get]foo.PROP");
assertNotStronglyUnique("[static][get]foo.prop");

// Conflicts with "[method][set]foo.prop"
assertNotStronglyUnique("[method][set]foo.PROP");
assertNotStronglyUnique("[static][set]foo.prop");
