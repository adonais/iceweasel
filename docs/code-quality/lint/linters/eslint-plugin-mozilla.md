# Mozilla ESLint Plugin

This is the documentation of Mozilla ESLint PLugin.

## Rules

The plugin implements the following rules:

```{toctree}
:glob: true
:maxdepth: 1

eslint-plugin-mozilla/rules/*
```

## Tests

The tests for eslint-plugin-mozilla are run via [mochajs] on top of node. Most
of the tests use the [ESLint Rule Unit Test framework].

### Running Tests

The tests for eslint-plugin-mozilla are run via [mochajs] on top of node. Most
of the tests use the [ESLint Rule Unit Test framework].

The rules have some self tests, these can be run via:

```shell
cd tools/lint/eslint/eslint-plugin-mozilla
npm install
npm run test
```

### Disabling tests

In the unlikely event of needing to disable a test, currently the only way is
by commenting-out. Please file a bug if you have to do this. Bugs should be filed
in the *Testing* product under *Lint*.

[eslint rule unit test framework]: http://eslint.org/docs/developer-guide/working-with-rules#rule-unit-tests
[mochajs]: https://mochajs.org/
