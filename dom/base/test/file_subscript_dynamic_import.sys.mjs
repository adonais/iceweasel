export function loadSubScript(url) {
  const target = {};
  Services.scriptloader.loadSubScript(url, target);
  return target.result;
}

export async function executePrecompiledScript(url) {
  const script = await ChromeUtils.compileScript(url);
  // The script defines a temporary property that is deleted below.
  // eslint-disable-next-line mozilla/reject-globalThis-modification
  script.executeInGlobal(globalThis);
  const result = globalThis.precompiledScriptResult;
  delete globalThis.precompiledScriptResult;
  return result;
}
