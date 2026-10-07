"use strict";

const InspectorUtils = SpecialPowers.InspectorUtils;

var tests = [];

function getElementWithinVideo(video, aValue) {
  const shadowRoot = SpecialPowers.wrap(video).openOrClosedShadowRoot;
  return shadowRoot.getElementById(aValue);
}

/**
 * Runs querySelectorAll on an element's shadow root.
 *
 * @param {Element} element
 * @param {string} selector
 */
function shadowRootQuerySelectorAll(element, selector) {
  const shadowRoot = SpecialPowers.wrap(element).openOrClosedShadowRoot;
  return shadowRoot?.querySelectorAll(selector);
}

function executeTests() {
  return tests
    .map(fn => () => new Promise(fn))
    .reduce((promise, task) => promise.then(task), Promise.resolve());
}

function once(target, name, cb) {
  let p = new Promise(function (resolve) {
    target.addEventListener(
      name,
      function () {
        resolve();
      },
      { once: true }
    );
  });
  if (cb) {
    p.then(cb);
  }
  return p;
}
