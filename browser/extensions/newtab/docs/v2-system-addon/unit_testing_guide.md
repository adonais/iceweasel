# Unit testing

## Overview

Our unit tests are written with [Jest](https://jestjs.io) and, for React
components, [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
They run in Node with a simulated DOM (jsdom), so they do not need a Firefox
build. They cover both content code (React components, etc.) and `.sys.mjs`s.

You can find unit tests in `test/jest`.

## Execution

To run lint and the unit tests once, execute `npm test`. To run only the unit
tests, use `npm run testmc:jest`, and add `-- path/to/file.test.jsx` to run a
single file.

To run unit tests continuously (i.e. in "test-driven development" mode), run
`npm run tdd`.

To generate a coverage report in `logs/coverage`, run
`npm run testmc:jest:coverage`, then `npm run debugcoverage` to open it.

## Where to put new tests

Add new tests to the subdirectory of `test/jest` that corresponds to the file
you are testing. Tests should end with `.test.js`, or `.test.jsx` if the test
includes any JSX.

For example, if the file you are testing is `lib/Foo.sys.mjs`, the test file
should be `test/jest/lib/Foo.test.js`.

## Writing tests

Jest provides `describe`, `it`, `beforeEach`, `expect`, and the rest as globals.
Use `jest.fn()` and `jest.spyOn()` for stubs and spies, and `jest.useFakeTimers()`
for timers.

```js
describe("FooModule", () => {
  it("should eventually get the meaning of life", async () => {
    const foo = new FooModule();
    expect(await foo.meaningOfLife()).toBe(42);
  });
});
```

## Overriding globals in `.sys.mjs`s

Most `.sys.mjs`s read globals such as `Services` or lazily imported modules. To
replace them for a test, use `stubGlobals` from `test/jest/test-utils`. It
returns a function that restores the originals:

```js
import { stubGlobals } from "test/jest/test-utils";

describe("MyModule", () => {
  let restoreGlobals;
  beforeEach(() => {
    restoreGlobals = stubGlobals({ AboutNewTab: { override: jest.fn() } });
  });
  afterEach(() => restoreGlobals());
});
```

`mockServices(["obs", "prefs"])` builds a `Services`-shaped object of stubs to
pass to `stubGlobals`.

## Testing React components

Render components with React Testing Library and query them the way a user
would find them. Wrap connected components in `WrapWithProvider` from
`test/jest/test-utils`, which supplies a Redux store built from
`INITIAL_STATE` (or a `state` you pass in):

```jsx
import { render, screen } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";

it("should render the heading", () => {
  render(
    <WrapWithProvider>
      <Foo />
    </WrapWithProvider>
  );
  expect(screen.getByRole("heading")).toBeInTheDocument();
});
```
