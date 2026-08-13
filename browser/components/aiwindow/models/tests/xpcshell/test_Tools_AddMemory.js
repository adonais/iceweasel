/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { TOOLS, toolsConfig, addMemory, ADD_MEMORY } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
  );
const { MemoriesManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(function test_add_memory_in_tools() {
  Assert.ok(TOOLS.includes(ADD_MEMORY), `${ADD_MEMORY} is in the TOOLS array`);
  const config = toolsConfig.find(t => t.function?.name === ADD_MEMORY);
  Assert.ok(config, `${ADD_MEMORY} tool config exists`);
  Assert.deepEqual(
    config.function.parameters.required,
    ["memorySummary", "containsPersonallyIdentifiableInfo"],
    "only two parameters are required"
  );
});

add_task(async function test_add_memory_blocks_model_pii_flag() {
  const sandbox = sinon.createSandbox();
  const saveStub = sandbox.stub(MemoriesManager, "saveRequestedMemory");
  const conversation = makeConversation();
  try {
    const result = await addMemory(
      {
        memorySummary: "Lives at 123 Main Street",
        containsPersonallyIdentifiableInfo: true,
      },
      conversation
    );
    Assert.ok(
      result.includes("Failed to save memory"),
      "returns failure when model flags PII"
    );
    Assert.ok(saveStub.notCalled, "saveRequestedMemory not called");
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_add_memory_happy_path_created() {
  const sandbox = sinon.createSandbox();
  const saveStub = sandbox
    .stub(MemoriesManager, "saveRequestedMemory")
    .resolves({
      ok: true,
      action: "created",
      memory: {
        id: "mem_abc123",
        memory_summary: "Prefers Walmart for shopping",
      },
    });
  const classifyStub = sandbox
    .stub(MemoriesManager, "enrichExistingMemory")
    .resolves();
  const conversation = makeConversation();
  try {
    const result = await addMemory(
      {
        memorySummary: "Prefers Walmart for shopping",
        containsPersonallyIdentifiableInfo: false,
      },
      conversation
    );
    Assert.ok(saveStub.calledOnce, "saveRequestedMemory called once");
    Assert.ok(
      classifyStub.calledOnceWith("mem_abc123", "Prefers Walmart for shopping"),
      "enrichExistingMemory called with memory id and summary"
    );
    Assert.ok(
      result.includes("Prefers Walmart for shopping"),
      "Return value should include the memory summary"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_add_memory_propagates_save_failure() {
  const sandbox = sinon.createSandbox();
  sandbox.stub(MemoriesManager, "saveRequestedMemory").resolves({
    ok: false,
    reason: "Memory summary is empty.",
  });
  const conversation = makeConversation();
  try {
    const result = await addMemory(
      {
        memorySummary: "",
        containsPersonallyIdentifiableInfo: false,
      },
      conversation
    );
    Assert.ok(
      result.startsWith("Error: "),
      "Return value should start with error prefix"
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_add_memory_fail_with_untrusted_input() {
  const sandbox = sinon.createSandbox();
  const saveStub = sandbox.stub(MemoriesManager, "saveRequestedMemory");
  const conversation = makeConversation({
    privateData: false,
    untrustedInput: true,
  });
  try {
    await addMemory(
      {
        memorySummary: "Prepares meals for the week each weekend",
        containsPersonallyIdentifiableInfo: false,
      },
      conversation
    );
    Assert.ok(
      saveStub.notCalled,
      "saveRequestedMemory should not be called when untrustedInput flag is set"
    );
  } finally {
    sandbox.restore();
  }
});
