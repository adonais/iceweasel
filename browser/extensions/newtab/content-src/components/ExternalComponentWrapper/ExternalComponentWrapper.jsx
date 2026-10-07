/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { useSelector } from "react-redux";

/**
 * A React component that dynamically loads and embeds external custom elements
 * into the newtab page.
 *
 * This component serves as a bridge between React's declarative rendering and
 * browser-native custom elements that are registered and managed outside of
 * React's control. It:
 *
 * 1. Looks up the component configuration by type from the ExternalComponents
 *    registry
 * 2. Dynamically imports the component's script module (which registers the
 *    custom element)
 * 3. Creates an instance of the custom element using imperative DOM APIs
 * 4. Appends it to a React-managed container div
 * 5. Cleans up the custom element on unmount
 *
 * This approach is necessary because:
 * - Custom elements have their own lifecycle separate from React
 * - They need to be created imperatively (document.createElement) rather than
 *   declaratively (JSX)
 * - React shouldn't try to diff/reconcile their internal DOM, as they manage
 *   their own shadow DOM
 * - We need manual cleanup to prevent memory leaks when the component unmounts
 *
 * @param {object} props
 * @param {string} props.type - The component type to load (e.g., "SEARCH")
 * @param {string} props.className - CSS class name(s) to apply to the wrapper div
 * @param {Function} props.importModule - Function to import modules (for testing)
 * @param {object} props.props - Properties to assign to the component, where
 *   each key is the property name, and the value is the property value.
 */
// eslint-disable-next-line no-unsanitized/method
const defaultImportModule = url => import(/* webpackIgnore: true */ url);

/**
 * Assigns each prop as a property on the custom element. Lit-based elements
 * already skip re-rendering when a reactive property is assigned an unchanged
 * value, so we don't guard against that here.
 *
 * @param {Element} element The custom element to update.
 * @param {object} props Properties to assign, keyed by property name.
 */
function applyProps(element, props) {
  for (const [propName, propValue] of Object.entries(props)) {
    element[propName] = propValue;
  }
}

/**
 * Creates a `<link>` without adding it to the document.
 *
 * @param {string} rel The `rel` attribute for the link.
 * @param {string} href The URL to link.
 * @returns {HTMLLinkElement} The link, not yet in the document.
 */
function createLink(rel, href) {
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  return link;
}

/**
 * Resolves once a link has loaded. Errors resolve too: a stylesheet that fails
 * to load must not block (or hide) the element indefinitely, so this never
 * rejects.
 *
 * @param {HTMLLinkElement} link A link that has not been appended yet, so that
 *   it cannot finish loading before it is being observed.
 * @returns {Promise<void>}
 */
function whenLoaded(link) {
  return new Promise(resolve => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
  });
}

/**
 * Creates and appends a `<link>` for each URL. Callers that need to observe
 * loading should use `createLink` instead, so their listeners are attached
 * before the link is appended.
 *
 * @param {Node} root Where the links are appended.
 * @param {string} rel The `rel` attribute given to every link.
 * @param {string[]} [urls] The hrefs to link, in order.
 * @returns {HTMLLinkElement[]} The appended links, in the order given.
 */
function appendLinks(root, rel, urls) {
  return (urls ?? []).map(href => {
    const link = createLink(rel, href);
    root.appendChild(link);
    return link;
  });
}

/**
 * Creates the custom element for a configuration, applying its declared
 * attributes, CSS variables and properties while it is still unconnected.
 *
 * @param {object} config The component configuration.
 * @param {object} props Properties to assign to the element.
 * @returns {Element} The element, not yet in the document.
 */
function createCustomElement(config, props) {
  const element = document.createElement(config.tagName);

  for (const [key, value] of Object.entries(config.attributes ?? {})) {
    element.setAttribute(key, value);
  }

  for (const [variable, style] of Object.entries(config.cssVariables ?? {})) {
    element.style.setProperty(variable, style);
  }

  applyProps(element, props);

  return element;
}

function ExternalComponentWrapper({
  type,
  className,
  // importModule can be overridden for testing.
  importModule = defaultImportModule,
  ...props
}) {
  const containerRef = React.useRef(null);
  const customElementRef = React.useRef(null);
  const cleanupRef = React.useRef(null);
  const scriptRef = React.useRef(null);
  const shadowRootRef = React.useRef(null);
  const l10nLinksRef = React.useRef([]);
  const stylesLinksRef = React.useRef([]);
  // Holds the latest props so the custom element can be created with current
  // values even though loadComponent runs asynchronously (kept updated by the
  // sync effect below).
  const latestPropsRef = React.useRef(props);
  const [error, setError] = React.useState(null);
  const { components } = useSelector(state => state.ExternalComponents);

  React.useEffect(() => {
    const container = containerRef.current;

    const mountReactBundle = async config => {
      if (!shadowRootRef.current) {
        shadowRootRef.current =
          container.shadowRoot ?? container.attachShadow({ mode: "open" });
        document.l10n.connectRoot(shadowRootRef.current);
      }
      const shadowRoot = shadowRootRef.current;

      appendLinks(shadowRoot, "stylesheet", config.stylesURLs);

      if (config.moduleURLs?.length) {
        await Promise.all(config.moduleURLs.map(url => importModule(url)));
      }

      const mountPoint = document.createElement("div");
      shadowRoot.appendChild(mountPoint);

      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = config.bundleURL;
        script.onload = () => {
          cleanupRef.current = window[config.mountFunction](mountPoint, props);
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
        scriptRef.current = script;
      });
    };

    const mountCustomElement = async config => {
      // If stylesURLs are declared for the component, we load those
      // stylesheets before mounting it so it is never in the document
      // unstyled.
      stylesLinksRef.current = (config.stylesURLs ?? []).map(url =>
        createLink("stylesheet", url)
      );

      const stylesLoaded = Promise.all(stylesLinksRef.current.map(whenLoaded));

      for (const link of stylesLinksRef.current) {
        document.head.appendChild(link);
      }

      await importModule(config.componentURL);
      await stylesLoaded;

      if (containerRef.current && !customElementRef.current) {
        const element = createCustomElement(config, latestPropsRef.current);
        customElementRef.current = element;
        containerRef.current.appendChild(element);
      }
    };

    const loadComponent = async () => {
      try {
        const config = components.find(c => c.type === type);

        if (!config) {
          console.warn(
            `No external component configuration found for type: ${type}`
          );
          return;
        }

        l10nLinksRef.current = appendLinks(
          document.head,
          "localization",
          config.l10nURLs
        );

        if (config.mountStrategy === "react-bundle") {
          await mountReactBundle(config);
        } else {
          await mountCustomElement(config);
        }
      } catch (err) {
        console.error(
          `Failed to load external component for type ${type}:`,
          err
        );
        setError(err);
      }
    };

    loadComponent();

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      scriptRef.current?.remove();
      scriptRef.current = null;

      if (shadowRootRef.current) {
        document.l10n.disconnectRoot(shadowRootRef.current);
        while (shadowRootRef.current.firstChild) {
          shadowRootRef.current.firstChild.remove();
        }
        shadowRootRef.current = null;
      }

      if (customElementRef.current && container) {
        container.removeChild(customElementRef.current);
        customElementRef.current = null;
      }

      for (const link of l10nLinksRef.current) {
        link.remove();
      }
      l10nLinksRef.current = [];

      for (const link of stylesLinksRef.current) {
        link.remove();
      }
      stylesLinksRef.current = [];
    };
    // props is intentionally excluded from the dependency array because it creates
    // a new object reference on every render, which would cause the effect to
    // re-run unnecessarily. The props are only used during initial element creation,
    // which is guarded by the !customElementRef.current check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, components, importModule]);

  // Keep the latest props tracked (for asynchronous element creation above) and
  // forward prop updates to the already-created custom element. The creation
  // effect only assigns props once, so without this, later changes to props
  // like `isIntersecting` would never reach the element.
  React.useEffect(() => {
    latestPropsRef.current = props;
    if (customElementRef.current) {
      applyProps(customElementRef.current, props);
    }
  });

  if (error) {
    return null;
  }

  return <div ref={containerRef} className={className} />;
}

export { ExternalComponentWrapper };
