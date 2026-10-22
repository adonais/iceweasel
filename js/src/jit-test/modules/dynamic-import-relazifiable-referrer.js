function importFromModule() {
  return import("module2.js");
}

globalThis.importFromModule = importFromModule;
