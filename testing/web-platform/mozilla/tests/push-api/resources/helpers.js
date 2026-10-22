import { pushMessage } from "/push-api/resources/helpers.js"

/**
 * Convenience function for sending a push message and waiting until either
 *  - The service worker gets a push event and sends a message back,
 *    in which case {swPush: messageData} is returned, or
 *  - Declarative Web Push notification with the navigate URL
 *    /_mozilla/notifications/resources/broadcast-when-opened.html
 *    is shown and auto-clicked, in which case {dwp: true} is returned.
 */
export async function pushMessageAndWait(t, subscription, options) {
  // Enable auto-click so that we can detect when DWP is received.
  await MockAlertsService.register(t);
  await MockAlertsService.enableAutoClick(options.actionToClick);

  const { promise, resolve } = Promise.withResolvers();
  const controller = new AbortController();
  navigator.serviceWorker.addEventListener("message", ev => {
    if (ev.data.type !== "push") {
      return;
    }
    controller.abort();
    resolve({ swPush: ev.data });
  }, { signal: controller.signal });

  new BroadcastChannel("broadcast-when-opened").addEventListener("message", ev => {
    assert_equals(ev.data, "opened");
    controller.abort();
    resolve({ dwp: true });
  }, { signal: controller.signal });

  await pushMessage(subscription, options);
  return promise;
}
