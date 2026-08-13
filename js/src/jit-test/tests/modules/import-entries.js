// |jit-test|

// Test importEntries property

function attributeEq(actual, expected) {

    return actual.moduleType === expected.moduleType;
}

function importEntryEq(a, b) {
    var r1 = a['moduleRequest']['specifier'] === b['moduleRequest']['specifier'] &&
        a['importName'] === b['importName'] &&
        a['importNameValueType'] === b['importNameValueType'] &&
        a['localName'] === b['localName'];

    return r1 && attributeEq(a['moduleRequest'], b['moduleRequest']);
}

function findImportEntry(array, target)
{
    for (let i = 0; i < array.length; i++) {
        if (importEntryEq(array[i], target))
            return i;
    }
    return -1;
}

function testImportEntries(source, expected) {
    var module = parseModule(source);
    var actual = module.importEntries.slice(0);
    assertEq(actual.length, expected.length);
    for (var i = 0; i < expected.length; i++) {
        let index = findImportEntry(actual, expected[i]);
        assertEq(index >= 0, true);
        actual.splice(index, 1);
    }
}

testImportEntries('', []);

testImportEntries('import v from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: 'default', importNameValueType: 'string', localName: 'v'}]);

// "default" is an ordinary string import name, not a special value type.
testImportEntries('import { default as v } from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: 'default', importNameValueType: 'string', localName: 'v'}]);

testImportEntries('import { "default" as v } from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: 'default', importNameValueType: 'string', localName: 'v'}]);

testImportEntries('import * as ns from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: null, importNameValueType: 'namespace', localName: 'ns'}]);

testImportEntries('import {x} from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: 'x', importNameValueType: 'string', localName: 'x'}]);

testImportEntries('import {x as v} from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: 'x', importNameValueType: 'string', localName: 'v'}]);

// A named import spelled like an internal sentinel is still an ordinary string
// import name.
testImportEntries('import { "*namespace*" as x } from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: '*namespace*', importNameValueType: 'string', localName: 'x'}]);

testImportEntries('import { "*source*" as x } from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: '*source*', importNameValueType: 'string', localName: 'x'}]);

testImportEntries('import "mod";',
                  []);

testImportEntries('import {x} from "a"; import {y} from "b";',
                  [{moduleRequest: {specifier: 'a', moduleType: 'js'}, importName: 'x', importNameValueType: 'string', localName: 'x'},
                   {moduleRequest: {specifier: 'b', moduleType: 'js'}, importName: 'y', importNameValueType: 'string', localName: 'y'}]);


testImportEntries('import v from "mod" with {};',
              [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: 'default', importNameValueType: 'string', localName: 'v'}]);

testImportEntries('import v from "mod" with { type: "json"};',
    [{moduleRequest: {specifier: 'mod', moduleType: 'json'}, importName: 'default', importNameValueType: 'string', localName: 'v'}]);

testImportEntries('import {x} from "mod" with { type: "json"};',
              [{moduleRequest: {specifier: 'mod', moduleType: 'json'}, importName: 'x', importNameValueType: 'string', localName: 'x'}]);

testImportEntries('import {x as v} from "mod" with { type: "json"};',
              [{moduleRequest: {specifier: 'mod', moduleType: 'json'}, importName: 'x', importNameValueType: 'string', localName: 'v'}]);

testImportEntries('import source ns from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: null, importNameValueType: 'source', localName: 'ns'}]);

testImportEntries('import source v from "mod";',
                  [{moduleRequest: {specifier: 'mod', moduleType: 'js'}, importName: null, importNameValueType: 'source', localName: 'v'}]);
