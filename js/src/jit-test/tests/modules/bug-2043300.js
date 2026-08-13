// |jit-test| allow-oom; skip-if: !hasFunction.oomAtAllocation

const spec = 'javascript:{"a":1}';
const attrs = {with: {type: "json"}};

ignoreUnhandledRejections();
gczeal(0);

let state;
let value;

function importJson() {
  state = "pending";
  value = undefined;

  try {
    import(spec, attrs).then(
      ns => {
        state = "fulfilled";
        value = ns;
      },
      err => {
        state = "rejected";
        value = err;
      }
    );
    try {
      drainJobQueue();
    } catch (err) {
      state = "thrown";
      value = err;
    }
  } catch (err) {
    state = "thrown";
    value = err;
  }
}

for (let n = 1; n < 200; n++) {
  clearModules();
  state = undefined;
  value = undefined;

  try {
    oomAtAllocation(n);
    importJson();
  } catch (err) {
    state = "thrown";
    value = err;
  } finally {
    resetOOMFailure();
  }

  let firstState = state;
  importJson();
  
  if (firstState !== "fulfilled" && state === "fulfilled" &&
      value.default === undefined &&
      Object.getOwnPropertyDescriptor(value, "default") === undefined) {
    throw new Error("module namespace has an exported default name without a default binding");
  }
}
