// |jit-test| --fast-warmup

function check(str, index, match, label) {
  assertEq(RegExp.lastMatch, match, label + ": lastMatch");
  assertEq(RegExp.leftContext.length, index, label + ": leftContext");
  assertEq(RegExp.input, str, label + ": input");
}

const re = /([aeiou])(\w)/g;
const stable = "the quick brown fox jumps over the lazy dog";

for (let i = 0; i < 300; i++) {
  const fresh = (stable + "!").slice(0, -1);
  const rope = "the quick brown fox jumps " + ["over", "the", "lazy", "dog"].join(" ");
  const inputs = [stable, fresh, rope, rope];

  for (const str of inputs) {
    re.lastIndex = 0;
    let m, last;
    while ((m = re.exec(str))) {
      last = m;
      if (m.index === 5) {
        minorgc();
      }
    }
    check(str, last.index, last[0], "exec loop " + i);

    str.replace(re, (whole, v, c, index) => {
      if (index === 12) {
        minorgc();
      }
      return whole;
    });
    check(str, last.index, last[0], "replace " + i);

    if (i % 50 === 0) {
      gc();
    }
  }
}
