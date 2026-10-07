const port = browser.runtime.connectNative("browser");
port.onMessage.addListener(async () => {
  const [tab] = await browser.tabs.query({ url: "*://*/*?tabToClose" });
  browser.tabs.remove(tab.id);
});
