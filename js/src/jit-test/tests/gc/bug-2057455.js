// |jit-test| skip-if: helperThreadCount() === 0

evalInWorker(`a = Symbol.match\n    addMarkObservers([a])\n    getMarks()`);
