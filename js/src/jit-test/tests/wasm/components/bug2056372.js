// |jit-test| skip-if: !wasmComponentsEnabled() || !hasFunction["gczeal"]

// ComponentInstance::coreInstances_ used to hold raw WasmInstanceObject*
// pointers, and was missing barriers.

const component = new WebAssembly.Component(wasmTextToBinary(`
  (component
    (core module $M)
    (core instance (instantiate $M))
    (core instance (instantiate $M))
    (core instance (instantiate $M))
  )
`));

const holder = [];
for (let i = 0; i < 20; i++) {
  holder.push(new WebAssembly.ComponentInstance(component));
}

gczeal(0);
gcslice(1);
while (gcstate() !== "Mark" && gcstate() !== "NotActive") {
  gcslice(1);
}
while (gcstate() === "Mark") {
  gcslice(1000);
}
finishgc();
