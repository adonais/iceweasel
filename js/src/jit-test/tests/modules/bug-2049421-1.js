// |jit-test| error: SyntaxError

var x = parseModule('export var v = 1;');
registerModule("x", x);
var m = parseModule('import { "*namespace*" as foo } from "x"; print(foo);');
moduleLink(m);
moduleEvaluate(m);
