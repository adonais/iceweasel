// Set to true to emit ' +' instead of the unreadable '\s+'.
var SPACEDEBUG = false;

// Any hex string
var HEX = '[0-9a-fA-F]'
var HEXES = `${HEX}+`;

function wrap(options, funcs) {
    if ('memory' in options)
        return `(module (memory ${options.memory}) ${funcs})`;
    return `(module ${funcs})`;
}

function fixlines(s) {
    return s.split(/\n+/)
        .map(strip)
        .filter(x => x.length > 0)
        .map(spaces)
        .join('\n');
}

function stripencoding(s, insEncoding) {
    var encoding = RegExp(`^(?:0x)?${HEX}+\\s+${insEncoding}\\s+(.*)$`);
    return s.split('\n')
        .map(x => x.match(encoding)?.[1] ?? x)
        .join('\n');
}

function strip(s) {
    var start = 0, end = s.length;
    while (start < s.length && isspace(s.charAt(start)))
        start++;
    while (end > start && isspace(s.charAt(end - 1)))
        end--;
    return s.substring(start, end);
}

function striplines(s) {
    return s.split('\n').map(strip).join('\n');
}

function spaces(s) {
    let t = '';
    let i = 0;
    while (i < s.length) {
        if (isspace(s.charAt(i))) {
            t += SPACEDEBUG ? ' +' : '\\s+';
            i++;
            while (i < s.length && isspace(s.charAt(i)))
                i++;
        } else {
            t += s.charAt(i++);
        }
    }
    return t;
}

function isspace(c) {
    return c == ' ' || c == '\t';
}

// For when nothing else applies: `module_text` is the complete source text of
// the module, `export_name` is the name of the function to be tested,
// `expected` is the non-preprocessed pattern, and options is an options bag,
// described in codegen-x64-test.js.
function codegenTestShared_adhoc(arch, module_text, export_name, expected, options) {
    assertEq(hasDisassembler(), true);

    const {name, prefix, suffix, encoding} = arch;

    let ins = wasmEvalText(module_text, {}, options.features);
    if (options.instanceBox)
        options.instanceBox.value = ins;
    let tier = options.baseline ? "baseline" : "ion";
    let output = wasmDis(ins.exports[export_name], {tier, asString: true});

    const expected_initial = expected;
    if (!options.no_prefix)
        expected = prefix + '\n' + expected;
    if (!options.no_suffix)
        expected = expected + '\n' + suffix;
    expected = fixlines(expected);

    const output_simple = stripencoding(output, encoding);
    const output_matches_expected = output_simple.match(new RegExp(expected)) != null;
    if (!output_matches_expected) {
        print(`---- codegen-${name}-test.js: TEST FAILED ----`);
    }
    if (options.log && output_matches_expected) {
        print(`---- codegen-${name}-test.js: TEST PASSED ----`);
    }
    if (options.log || !output_matches_expected) {
        print("---- module text");
        print(module_text);
        print("---- actual");
        print(output);
        print("---- expected (initial)");
        print(expected_initial);
        print("---- expected (as used)");
        print(expected);
        print("----");
    }

    assertEq(output_matches_expected, true);
}
