/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parses A2UI JSON objects to prepare for rendering
 */
export class A2UI {
  #components;
  #dataModel;
  #hydrators;
  #surface;

  /**
   * @param {object} a2ui
   */
  constructor(a2ui) {
    this.#surface = structuredClone(a2ui);

    this.#hydrators = new Map();
    this.#hydrators.set("Highlights", this.#hydrateHighlights.bind(this));
    this.#hydrators.set("SourceLinks", this.#hydrateSourceLinks.bind(this));
    this.#hydrators.set("TextBlock", this.#hydrateTextBlock.bind(this));
    this.#hydrators.set("RankedTable", this.#hydrateRankedTable.bind(this));
    this.#hydrators.set("Cards", this.#hydrateCards.bind(this));
    this.#hydrators.set("Timeline", this.#hydrateTimeline.bind(this));
    this.#hydrators.set("List", this.#hydrateList.bind(this));
  }

  /**
   * Iterates the A2UI JSON and prepares for rendering
   */
  toUI() {
    const surface = structuredClone(this.#surface);
    this.#dataModel = surface.dataModel;
    this.#components = new Map();
    surface.components.forEach(component => {
      this.#components.set(component.id, component);
    });

    const root = this.#components.get("root");
    if (!root) {
      return {
        component: "Page",
        children: [],
      };
    }

    const page = {
      component: root.component,
      children: [],
    };

    this.#getHeader(root, page);
    this.#getChildren(root, page);

    return page;
  }

  #hydrateList(component, dataModel = undefined) {
    if (component.title) {
      component.title = this.#resolveValue(component.title, "", dataModel);
    }

    if (component.description) {
      component.description = this.#resolveValue(
        component.description,
        "",
        dataModel
      );
    }

    component.groups = this.#resolveArray(component.groups, [], dataModel);

    return component;
  }

  #hydrateTimeline(component, dataModel = undefined) {
    if (component.title) {
      component.title = this.#resolveValue(component.title, "", dataModel);
    }

    if (component.description) {
      component.description = this.#resolveValue(
        component.description,
        "",
        dataModel
      );
    }

    component.items = this.#resolveArray(component.items, [], dataModel);

    return component;
  }

  #hydrateCards(component, dataModel = undefined) {
    if (component.title) {
      component.title = this.#resolveValue(component.title, "", dataModel);
    }

    component.items = this.#resolveArray(component.items, [], dataModel);

    return component;
  }

  #hydrateRankedTable(component, dataModel = undefined) {
    if (component.title) {
      component.title = this.#resolveValue(component.title, "", dataModel);
    }

    if (component.description) {
      component.description = this.#resolveValue(
        component.description,
        "",
        dataModel
      );
    }

    component.rows = this.#resolveArray(component.rows, [], dataModel);

    return component;
  }

  #hydrateTextBlock(component, dataModel = undefined) {
    if (component.lead) {
      component.lead = this.#resolveValue(component.lead, "", dataModel);
    }

    if (component.paragraphs) {
      component.paragraphs = this.#resolveArray(
        component.paragraphs,
        [],
        dataModel
      );
    }

    return component;
  }

  #hydrateHighlights(component, dataModel = undefined) {
    component.title = component.title
      ? this.#resolveValue(component.title, "", dataModel)
      : undefined;

    component.items = this.#resolveArray(
      component.items,
      [],
      dataModel,
      highlightItem => this.#hydrateHighlightItem(highlightItem, dataModel)
    );

    return component;
  }

  #getHeader(root, page) {
    if (!root.header || !this.#components.has(root.header)) {
      return;
    }

    const header = this.#components.get(root.header);

    if (header.eyebrow) {
      header.eyebrow = this.#resolveValue(header.eyebrow, "");
    }

    if (header.title) {
      header.title = this.#resolveValue(header.title, "");
    }

    if (header.subhead) {
      header.subhead = this.#resolveValue(header.subhead, "");
    }

    if (header.references) {
      header.references = this.#hydrateSourceLinks(header.references);
    }

    page.children.push(header);
  }

  #hydrateSourceLinks(sourceLinks, dataModel = undefined) {
    if (sourceLinks.title) {
      sourceLinks.title = this.#resolveValue(sourceLinks.title, "", dataModel);
    }

    if (sourceLinks.items) {
      sourceLinks.items = this.#resolveArray(sourceLinks.items, [], dataModel);
    }

    return sourceLinks;
  }

  #getChildren(root, page) {
    if (!root.children) {
      return;
    }

    if (Array.isArray(root.children)) {
      for (const child of root.children) {
        if (!this.#components.has(child)) {
          continue;
        }

        const component = this.#components.get(child);
        page.children.push(this.#hydrateComponent(component));
      }

      return;
    }

    const { componentId, path } = root.children;
    if (
      typeof componentId !== "string" ||
      typeof path !== "string" ||
      !this.#components.has(componentId)
    ) {
      return;
    }

    const dataModels = this.#resolvePath(path, []);
    if (!Array.isArray(dataModels)) {
      return;
    }

    const template = this.#components.get(componentId);
    for (const dataModel of dataModels) {
      const component = structuredClone(template);
      page.children.push(this.#hydrateComponent(component, dataModel));
    }
  }

  #hydrateComponent(component, dataModel = undefined) {
    const hydrator = this.#hydrators.get(component.component);
    if (typeof hydrator === "function") {
      return hydrator(component, dataModel);
    }

    return component;
  }

  #resolveValue(target, defaultValue = undefined, dataModel = undefined) {
    if (!target) {
      return null;
    }

    if (
      typeof target === "object" &&
      !Array.isArray(target) &&
      typeof target.path === "string"
    ) {
      return this.#resolvePath(target.path, defaultValue, dataModel);
    }

    return target;
  }

  #resolveArray(
    target,
    defaultValue = [],
    dataModel = undefined,
    itemMapper = undefined
  ) {
    const value = this.#resolveValue(target, defaultValue, dataModel);
    if (!Array.isArray(value)) {
      return defaultValue;
    }

    return itemMapper ? value.map(itemMapper) : value;
  }

  #hydrateHighlightItem(highlightItem, dataModel = undefined) {
    if (highlightItem.sources) {
      highlightItem.sources = this.#hydrateSourceLinks(
        highlightItem.sources,
        dataModel
      );
    }

    return highlightItem;
  }

  #resolvePath(path, defaultValue = undefined, dataModel = undefined) {
    const absolutePath = path.startsWith("/");
    if (!absolutePath && !dataModel) {
      return defaultValue;
    }

    let value = absolutePath ? this.#dataModel : dataModel;
    const fieldPath = path.split("/");
    if (absolutePath) {
      fieldPath.shift();
    }

    while (fieldPath.length) {
      if (value == null || typeof value !== "object") {
        return undefined;
      }

      let key = fieldPath.shift();
      key = key.replace(/~1/g, "/").replace(/~0/g, "~");

      value = value[key];
    }

    return value;
  }
}
