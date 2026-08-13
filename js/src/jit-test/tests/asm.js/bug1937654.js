load(libdir + "asm.js");

// asm.js has been removed, so this input (originally an asm.js module from
// bug 1937654) is now parsed as ordinary JavaScript. A call expression may not
// have more than 65535 arguments, so parsing the body throws a SyntaxError.
//
// With lazy parsing the inner function is only fully parsed when it is first
// run; coverage builds parse it eagerly at creation. Drive the code all the
// way to running the inner function so the SyntaxError is raised either way.

let template = `
  'use asm';
  var imported = foreign.imported;
  function main() {
    imported(ARGS);
  }
  return main;
  `;
let args = new Array(100000).fill('0').join(', ');
let body = template.replace('ARGS', args);

assertThrowsInstanceOf(() => {
  let main = new Function('stdlib', 'foreign', body)({}, { imported() {} });
  main();
}, SyntaxError);
