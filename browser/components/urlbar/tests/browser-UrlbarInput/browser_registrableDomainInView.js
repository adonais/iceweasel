/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that the registrable domain is always visible in the URL bar.

/**
 * Tests that the registrable domain in a URL is visible within the URL bar bounds.
 * The registrable domain should be wrapped in "<" and ">" chars to indicate which
 * part should be tested for visibility.
 *
 * @param {string} urlRegistrableDomainSpanString The URL to test with the registrable
 *        domain wrapped in "<" and ">" characters.
 */
async function testVal(urlRegistrableDomainSpanString) {
  const url = urlRegistrableDomainSpanString.replace(/[<>]/g, "");
  const registrableDomain =
    urlRegistrableDomainSpanString.match(/<([^>]*)>/)?.[1] ?? null;

  info("Setting the value property directly");
  gURLBar.value = url;
  gBrowser.selectedBrowser.focus();
  await new Promise(resolve => window.requestAnimationFrame(resolve));

  const textNode = gURLBar.editor.rootElement.firstChild;

  const registrableDomainIndex =
    textNode.textContent.indexOf(registrableDomain);

  Assert.notStrictEqual(
    registrableDomainIndex,
    -1,
    `Registrable domain "${registrableDomain}" not found in "${textNode.textContent}"`
  );

  const registrableDomainRange = document.createRange();
  registrableDomainRange.setStart(textNode, registrableDomainIndex);
  registrableDomainRange.setEnd(
    textNode,
    registrableDomainIndex + registrableDomain.length
  );
  await new Promise(resolve => window.requestAnimationFrame(resolve));

  const registrableDomainRect = registrableDomainRange.getBoundingClientRect();
  const urlbarRect = gURLBar.inputField.getBoundingClientRect();

  // Allow 1px tolerance for subpixel rendering / device pixel rounding.
  const tolerance = 1;
  Assert.ok(
    registrableDomainRect.left >= urlbarRect.left - tolerance &&
      registrableDomainRect.right <= urlbarRect.right + tolerance,
    `Registrable domain "${registrableDomain}" should be fully visible in URL bar. ` +
      `Registrable domain bounds: [${registrableDomainRect.left.toFixed(1)}, ${registrableDomainRect.right.toFixed(1)}], ` +
      `URLBar bounds: [${urlbarRect.left.toFixed(1)}, ${urlbarRect.right.toFixed(1)}]`
  );

  // The overflowing edges of the URL bar are faded out, so the registrable
  // domain should also be kept clear of them.
  const input = gURLBar.inputField;
  const isRTLDomain = /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(
    registrableDomain
  );
  const inputStyle = getComputedStyle(input);
  const fadeSize = parseFloat(
    inputStyle.getPropertyValue("--urlbar-overflow-fade-size")
  );
  const schemeSize = parseFloat(
    inputStyle.getPropertyValue("--urlbar-scheme-size")
  );

  const leftHidden = input.scrollLeft > input.scrollLeftMin;
  const rightHidden = input.scrollLeft < input.scrollLeftMax;
  if (leftHidden) {
    let masked = fadeSize;
    // The scheme box is shown when an RTL domain only overflows to the left.
    if (isRTLDomain && !rightHidden) {
      masked += schemeSize;
    }
    Assert.greaterOrEqual(
      registrableDomainRect.left + tolerance,
      urlbarRect.left + masked,
      `Registrable domain "${registrableDomain}" should be clear of the left fade`
    );
  }
  if (rightHidden) {
    Assert.lessOrEqual(
      registrableDomainRect.right - tolerance,
      urlbarRect.right - fadeSize,
      `Registrable domain "${registrableDomain}" should be clear of the right fade`
    );
  }

  // Check over-scrolling.
  const atEdge =
    input.scrollLeft == input.scrollLeftMin ||
    input.scrollLeft == input.scrollLeftMax;
  const aligned = isRTLDomain
    ? Math.abs(registrableDomainRect.left - (urlbarRect.left + fadeSize)) <=
      tolerance
    : Math.abs(registrableDomainRect.right - (urlbarRect.right - fadeSize)) <=
      tolerance;
  Assert.ok(atEdge || aligned, "Should scroll only as much as needed");
}

add_task(async function () {
  await testVal(`https://${"sub".repeat(100)}.<mozilla.org>/`);
  await testVal(`https://<mozilla.org>/${"path".repeat(100)}`);
  await testVal(
    `https://${"sub".repeat(100)}.<mozilla.org>/${"path".repeat(100)}`
  );
  await testVal(`https://<اختبار.اختبار>/${"path".repeat(100)}`);
  await testVal(
    `https://${"مثال.".repeat(40)}<اختبار.اختبار>/${"path".repeat(100)}`
  );
});
