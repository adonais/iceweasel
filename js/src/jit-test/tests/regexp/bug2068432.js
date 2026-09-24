var r1 = /(?!(?i:a|b))[c]/.test("C");
if (r1 !== false) throw new Error("case-sensitive [c] matched 'C': " + r1);
var r2 = /(?!(?-i:a|b))[c]/i.test("C");
if (r2 !== true) throw new Error("case-insensitive [c] did not match 'C': " + r2);
var r3 = /(?<!(?i:a|b))[d]/.test("D");
if (r3 !== false) throw new Error("case-sensitive [d] matched 'D': " + r3);
