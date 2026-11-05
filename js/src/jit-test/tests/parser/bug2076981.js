load(libdir + "asserts.js");

assertThrowsInstanceOf(() => Function("value => counter++\n`\\8`"), SyntaxError);
assertThrowsInstanceOf(() => eval("value => counter++\n`\\8`"), SyntaxError);
