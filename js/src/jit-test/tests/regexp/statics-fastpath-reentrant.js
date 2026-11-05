// |jit-test| --fast-warmup

function checkStatics(str, m, label) {
  assertEq(RegExp.lastMatch, m[0], label + ": lastMatch");
  assertEq(RegExp.leftContext, str.slice(0, m.index), label + ": leftContext");
  assertEq(RegExp.rightContext, str.slice(m.index + m[0].length),
           label + ": rightContext");
  assertEq(RegExp.$1, m[1] ?? "", label + ": $1");
  assertEq(RegExp.$2, m[2] ?? "", label + ": $2");
  assertEq(RegExp.input, str, label + ": input");
}

function lastMatchOf(re, str) {
  let last = null;
  for (const m of str.matchAll(re)) {
    last = m;
  }
  return last;
}

const outerStr = "a1-b2-c3-d4-e5-f6-g7-h8";
const innerStr = "x9y8z7";
const outerRe = /([a-h])(\d)/g;
const outerLast = lastMatchOf(outerRe, outerStr);

for (let i = 0; i < 200; i++) {
  let lastRun = [outerStr, outerLast];
  outerStr.replace(outerRe, (m, letter, digit, index) => {
    const mine = Object.assign([m, letter, digit], { index });
    switch (i % 4) {
      case 0: {
        const im = /([xyz])(\d)/.exec(innerStr);
        checkStatics(innerStr, im, "different input");
        lastRun = [innerStr, im];
        break;
      }
      case 1: {
        const im = /(\d)-([a-h])/.exec(outerStr);
        checkStatics(outerStr, im, "same input, different regexp");
        lastRun = [outerStr, im];
        break;
      }
      case 2: {
        const re = /([a-h])(\d)/g;
        re.lastIndex = index;
        const im = re.exec(outerStr);
        checkStatics(outerStr, im, "same input and source");
        lastRun = [outerStr, im];
        break;
      }
      case 3:
        checkStatics(outerStr, mine, "statics read in callback");
        break;
    }
    return "";
  });
  checkStatics(lastRun[0], lastRun[1], "after replace " + (i % 4));
}

const reA = /([a-h])(\d)/g;
const reB = /(\d)-/g;
for (let i = 0; i < 200; i++) {
  reA.lastIndex = 0;
  reB.lastIndex = 0;
  let ma, mb;
  while ((ma = reA.exec(outerStr))) {
    checkStatics(outerStr, ma, "interleaved A");
    mb = reB.exec(outerStr);
    if (mb) {
      checkStatics(outerStr, mb, "interleaved B");
    }
    if (i % 2) {
      RegExp.$1;
    }
  }
}
