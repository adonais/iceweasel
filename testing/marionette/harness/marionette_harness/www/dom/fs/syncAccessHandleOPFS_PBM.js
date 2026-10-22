onmessage = async function (event) {
  const { name, value } = event.data;
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(name, { create: true });

    const handle = await fileHandle.createSyncAccessHandle();
    try {
      handle.write(new TextEncoder().encode(value), { at: 0 });
      handle.flush();
    } finally {
      handle.close();
    }

    postMessage({ ok: true });
  } catch (e) {
    postMessage({ ok: false, error: e.toString() });
  }
};
