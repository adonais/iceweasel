registerModule("a", parseModule("export let v = 1;"));
let m = parseModule("import {v} from 'a'; import x from 'a' with {type: 'foo'};");
let threw = false;
try {
  moduleLoadAndLink(m);
} catch (e) {
  threw = e instanceof TypeError;
}
assertEq(threw, true);
