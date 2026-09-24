// META: script=/resources/testdriver.js
// META: script=/resources/testdriver-vendor.js
// META: script=resources/MockAlertsService.js
// META: script=/notifications/resources/helpers.js

const OPEN_URI = 'resources/broadcast-when-opened.html';

function waitUntilOpened() {
  const {promise, resolve} = Promise.withResolvers();
  new BroadcastChannel('broadcast-when-opened').addEventListener('message', e => {
    assert_equals(e.data, 'opened');
    resolve();
  }, {once: true});
  return promise;
}

let registration;
let notificationclickFired = false;
promise_setup(async () => {
  registration = await prepareActiveServiceWorker('navigate-sw.js');
  addEventListener('message', () => {
    notificationclickFired = true;
  });
  await trySettingPermission('granted');
});

promise_test(async t => {
  await MockAlertsService.register(t);
  await MockAlertsService.enableAutoClick();
  const wait = waitUntilOpened();
  const notification = new Notification('test', {navigate: OPEN_URI});
  let clicked = false;
  notification.onclick = () => {
    clicked = true;
  };
  await wait;
  assert_false(clicked, 'Should not fire click event when navigate is set.');
}, 'Test navigate option for Notification constructor');

promise_test(async t => {
  await MockAlertsService.register(t);
  await MockAlertsService.enableAutoClick('bar');
  const wait = waitUntilOpened();
  const notification = new Notification('test', {actions: [
    {title: 'foo', action: 'foo'},
    {title: 'bar', action: 'bar', navigate: OPEN_URI},
  ]});
  let clicked = false;
  notification.onclick = () => {
    clicked = true;
  };
  await wait;
  assert_false(clicked, 'Should not fire click event when navigate is set.');
}, 'Test action navigate option for Notification constructor');

promise_test(async t => {
  await MockAlertsService.register(t);
  await MockAlertsService.enableAutoClick();
  const wait = waitUntilOpened();
  registration.showNotification('test', {navigate: OPEN_URI});
  await wait;
  assert_false(notificationclickFired,
               'Should not fire notificationclick if navigate is set.');
}, 'Test navigate option for showNotification()');

promise_test(async t => {
  await MockAlertsService.register(t);
  await MockAlertsService.enableAutoClick('bar');
  const wait = waitUntilOpened();
  registration.showNotification('test', {actions: [
    {title: 'foo', action: 'foo'},
    {title: 'bar', action: 'bar', navigate: OPEN_URI},
  ]});
  await wait;
  assert_false(notificationclickFired,
               'Should not fire notificationclick if navigate is set.');
}, 'Test action navigate option for showNotification()');
