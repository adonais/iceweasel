/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, waitFor } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { ExternalComponentWrapper } from "content-src/components/ExternalComponentWrapper/ExternalComponentWrapper";

const DEFAULT_PROPS = {
  type: "SEARCH",
  className: "test-wrapper",
};

const flushPromises = () => new Promise(resolve => queueMicrotask(resolve));

const createMockConfig = (overrides = {}) => ({
  type: "SEARCH",
  componentURL: "chrome://test/content/component.mjs",
  tagName: "test-component",
  l10nURLs: [],
  ...overrides,
});

const createStateWithConfig = config => ({
  ...INITIAL_STATE,
  ExternalComponents: {
    components: [config],
  },
});

const createMockElement = () => {
  const element = document.createElement("div");
  jest.spyOn(element, "setAttribute");
  jest.spyOn(element.style, "setProperty");
  return element;
};

describe("<ExternalComponentWrapper>", () => {
  const TestWrapper = ExternalComponentWrapper;

  // The legacy test used a sinon sandbox (via GlobalOverrider) restored in
  // afterEach; jest.restoreAllMocks() is the direct equivalent.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const stubCreateElement = handlers => {
    const originalCreateElement = document.createElement.bind(document);
    return jest.spyOn(document, "createElement").mockImplementation(tagName => {
      if (handlers[tagName]) {
        return handlers[tagName]();
      }
      return originalCreateElement(tagName);
    });
  };

  it("should render a container div", () => {
    const { container } = render(
      <WrapWithProvider state={createStateWithConfig(createMockConfig())}>
        <TestWrapper
          {...DEFAULT_PROPS}
          importModule={jest.fn(() => Promise.resolve())}
        />
      </WrapWithProvider>
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(container.querySelectorAll("div")).toHaveLength(1);
  });

  it("should apply className to container div", () => {
    const { container } = render(
      <WrapWithProvider state={createStateWithConfig(createMockConfig())}>
        <TestWrapper
          {...DEFAULT_PROPS}
          importModule={jest.fn(() => Promise.resolve())}
        />
      </WrapWithProvider>
    );
    expect(container.querySelectorAll("div.test-wrapper")).toHaveLength(1);
  });

  it("should warn when no configuration is found for type", async () => {
    const consoleWarnStub = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    render(
      <WrapWithProvider>
        <TestWrapper {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(consoleWarnStub).toHaveBeenCalledWith(
        "No external component configuration found for type: SEARCH"
      );
    });
  });

  it("should not render custom element without configuration", async () => {
    const consoleWarnStub = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const importModuleStub = jest.fn(() => Promise.resolve());
    const { unmount } = render(
      <WrapWithProvider>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(consoleWarnStub).toHaveBeenCalledWith(
        "No external component configuration found for type: SEARCH"
      );
    });

    expect(importModuleStub).not.toHaveBeenCalled();
    unmount();
  });

  it("should load component module when configuration is available", async () => {
    const mockConfig = createMockConfig();
    const stateWithConfig = createStateWithConfig(mockConfig);
    const importModuleStub = jest.fn(() => Promise.resolve());

    const { unmount } = render(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(importModuleStub).toHaveBeenCalledWith(mockConfig.componentURL);
    });
    unmount();
  });

  it("should create custom element with correct tag name", async () => {
    const mockConfig = createMockConfig();
    const stateWithConfig = createStateWithConfig(mockConfig);
    const mockElement = createMockElement();
    const importModuleStub = jest.fn(() => Promise.resolve());

    const createElementStub = stubCreateElement({
      "test-component": () => mockElement,
    });

    const { unmount } = render(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(createElementStub).toHaveBeenCalledWith("test-component");
    });
    unmount();
  });

  it("should add l10n link elements to document head", async () => {
    const mockConfig = createMockConfig({
      l10nURLs: ["browser/test.ftl", "browser/test2.ftl"],
    });
    const stateWithConfig = createStateWithConfig(mockConfig);
    const mockLinkElement = { rel: "", href: "", remove: jest.fn() };
    const importModuleStub = jest.fn(() => Promise.resolve());

    stubCreateElement({
      link: () => mockLinkElement,
      "test-component": () => createMockElement(),
    });

    const appendChildStub = jest
      .spyOn(document.head, "appendChild")
      .mockImplementation(() => {});

    const { unmount } = render(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(appendChildStub).toHaveBeenCalledTimes(2);
    });
    expect(mockLinkElement.rel).toBe("localization");
    unmount();
  });

  it("should set attributes on custom element", async () => {
    const mockConfig = createMockConfig({
      attributes: {
        "data-test": "value",
        role: "search",
      },
    });
    const stateWithConfig = createStateWithConfig(mockConfig);
    const mockElement = createMockElement();
    const importModuleStub = jest.fn(() => Promise.resolve());

    stubCreateElement({
      "test-component": () => mockElement,
    });

    const { unmount } = render(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(mockElement.setAttribute).toHaveBeenCalledWith(
        "data-test",
        "value"
      );
    });
    expect(mockElement.setAttribute).toHaveBeenCalledWith("role", "search");
    unmount();
  });

  it("should set CSS variables on custom element", async () => {
    const mockConfig = createMockConfig({
      cssVariables: {
        "--test-color": "blue",
        "--test-size": "10px",
      },
    });
    const stateWithConfig = createStateWithConfig(mockConfig);
    const mockElement = createMockElement();
    const importModuleStub = jest.fn(() => Promise.resolve());

    stubCreateElement({
      "test-component": () => mockElement,
    });

    const { unmount } = render(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(mockElement.style.setProperty).toHaveBeenCalledWith(
        "--test-color",
        "blue"
      );
    });
    expect(mockElement.style.setProperty).toHaveBeenCalledWith(
      "--test-size",
      "10px"
    );
    unmount();
  });

  it("should handle component load errors gracefully", async () => {
    const mockConfig = createMockConfig();
    const stateWithConfig = createStateWithConfig(mockConfig);
    const consoleErrorStub = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const importModuleStub = jest.fn(() =>
      Promise.reject(new Error("Module load failed"))
    );

    const { container, unmount } = render(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(consoleErrorStub).toHaveBeenCalledWith(
        "Failed to load external component for type SEARCH:",
        expect.any(Error)
      );
    });

    // wrapper.html() === "" in the legacy test: the component renders null on
    // error, so the container ends up empty.
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
    unmount();

    // Restore inline so the jest-setup guard (which fails tests that log to
    // console.error) doesn't see this expected error.
    consoleErrorStub.mockRestore();
  });

  it("should clean up l10n links on unmount", async () => {
    const mockConfig = createMockConfig({
      l10nURLs: ["browser/test.ftl"],
    });
    const stateWithConfig = createStateWithConfig(mockConfig);
    const mockLinkElements = [];
    const importModuleStub = jest.fn(() => Promise.resolve());

    stubCreateElement({
      "test-component": () => createMockElement(),
      link: () => {
        const linkEl = { remove: jest.fn() };
        mockLinkElements.push(linkEl);
        return linkEl;
      },
    });

    jest.spyOn(document.head, "appendChild").mockImplementation(() => {});

    const { unmount } = render(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(mockLinkElements).toHaveLength(1);
    });

    unmount();

    expect(mockLinkElements[0].remove).toHaveBeenCalled();
  });

  it("should not create duplicate elements on multiple renders", async () => {
    const mockConfig = createMockConfig();
    const stateWithConfig = createStateWithConfig(mockConfig);
    const mockElement = createMockElement();
    const importModuleStub = jest.fn(() => Promise.resolve());

    const createElementStub = stubCreateElement({
      "test-component": () => mockElement,
    });

    const { rerender, unmount } = render(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper {...DEFAULT_PROPS} importModule={importModuleStub} />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(createElementStub).toHaveBeenCalledWith("test-component");
    });

    const initialCallCount = createElementStub.mock.calls.length;

    rerender(
      <WrapWithProvider state={stateWithConfig}>
        <TestWrapper
          {...DEFAULT_PROPS}
          className="new-class"
          importModule={importModuleStub}
        />
      </WrapWithProvider>
    );
    await flushPromises();

    expect(createElementStub).toHaveBeenCalledTimes(initialCallCount);
    unmount();
  });

  it("forwards prop updates to the custom element after creation", async () => {
    const mockConfig = createMockConfig({ tagName: "test-message-component" });
    const importModule = jest.fn(() => Promise.resolve());
    const state = createStateWithConfig(mockConfig);

    const { container, rerender } = render(
      <WrapWithProvider state={state}>
        <ExternalComponentWrapper
          {...DEFAULT_PROPS}
          importModule={importModule}
          isIntersecting={false}
        />
      </WrapWithProvider>
    );

    let element;
    await waitFor(() => {
      element = container.querySelector("test-message-component");
      expect(element).toBeInTheDocument();
    });
    expect(element.isIntersecting).toBe(false);

    rerender(
      <WrapWithProvider state={state}>
        <ExternalComponentWrapper
          {...DEFAULT_PROPS}
          importModule={importModule}
          isIntersecting={true}
        />
      </WrapWithProvider>
    );

    await waitFor(() => {
      expect(
        container.querySelector("test-message-component").isIntersecting
      ).toBe(true);
    });
  });
});
