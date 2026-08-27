function f() {
  let registry = evalcx("new FinalizationRegistry(v => {})",
                        newGlobal({newCompartment: true}));
  for (let i = 0; i < 500; ++i) registry.register({}, 1);
}
f();
for (let i = 0; i < 100; ++i) gcslice(10000);
