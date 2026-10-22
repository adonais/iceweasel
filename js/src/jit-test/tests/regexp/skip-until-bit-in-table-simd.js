// |jit-test| --regexp-warmup-threshold=0

// Exercise the vectorized SkipUntilBitInTable scan with the first match at
// every lane of a chunk, preceded by false candidates in the same chunk.

const filler = "z";
const patterns = [
  [/[aeiqwx]\d/, "q7", "q"],
  [/[bdf]ar/, "far", "fa"],
  [/[a-c]\d\d/, "b12", "b1"],
  [/[#@$%^&]+\w/, "%%k", "%"],
  [/[aeiqwx]/, "w", ""],
  [/[aeiqwx]\d{5}/, "a12345", "a1234"],
];

for (const [re, hit, near] of patterns) {
  for (let pos = 0; pos < 70; pos++) {
    for (let tail = 0; tail < 20; tail++) {
      const plain = filler.repeat(pos) + hit + filler.repeat(tail);
      assertEq(re.exec(plain)?.index, pos);

      if (pos >= near.length + 1) {
        const decoyAt = (pos * 7) % (pos - near.length);
        const decoyed =
          filler.repeat(decoyAt) + near + "\xe1" +
          filler.repeat(pos - decoyAt - near.length - 1) + hit +
          filler.repeat(tail);
        assertEq(decoyed.length, pos + hit.length + tail);
        assertEq(re.exec(decoyed)?.index, pos);
      }
    }
    const miss = filler.repeat(pos) + near + "\xe1" + filler.repeat(20);
    assertEq(re.exec(miss), null);
  }
}

const g = /[aeiqwx]\d/g;
const s = "zzzzzzzzzzzzzzzza1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzx9zzzz";
const found = [];
let m;
while ((m = g.exec(s))) {
  found.push(m.index);
}
assertEq(found.join(), "16,64");
