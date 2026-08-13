# use-console-createInstance

Rejects usage of Console.sys.mjs or Log.sys.mjs, preferring use of
`console.createInstance` instead. See [Javascript Logging](/toolkit/javascript-logging.html) for more information.

## Examples of incorrect code for this rule

```js
"resource://gre/modules/Console.sys.mjs"
"resource://gre/modules/Log.sys.mjs"
```

## Examples of correct code for this rule

```js
console.createInstance({ prefix: "Foo" });
```
