const K = 105;
const V = 58;
let body = [];
for (let k = 0; k < K; k++) {
  let init = [];
  let rot = [];
  let sum = ["(local.get 1)"];
  for (let i = 0; i < V; i++) {
    init.push(`(local.set ${i + 1} (i32.const ${k * 1000 + i + 1}))`);
    rot.push(`(local.set ${i + 1} (local.get ${((i + 1) % V) + 1}))`);
    if (i > 0) sum.push(`(local.get ${i + 1}) (i32.add)`);
  }
  body.push(`
    ${init.join(" ")}
    (local.set 0 (local.get ${V + 1}))
    (loop $l${k}
      ${rot.join(" ")}
      (br_if $l${k} (local.tee 0 (i32.sub (local.get 0) (i32.const 1))))
    )
    ${sum.join(" ")}
    (local.set ${V + 2} (i32.add (local.get ${V + 2})))
  `);
}
const wat = `(module
  (func (export "run") (param i32) (result i32)
    (local ${Array(V + 2).fill("i32").join(" ")})
    (local.set ${V + 1} (local.get 0))
    ${body.join("\n")}
    (local.get ${V + 2})
  )
)`;

const inst = wasmEvalText(wat);
