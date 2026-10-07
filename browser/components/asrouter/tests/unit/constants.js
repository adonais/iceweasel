export const CHILD_TO_PARENT_MESSAGE_NAME = "ASRouter:child-to-parent";
export const PARENT_TO_CHILD_MESSAGE_NAME = "ASRouter:parent-to-child";

export const FAKE_LOCAL_MESSAGES = [
  {
    id: "foo",
    template: "fake_template",
    content: { title: "Foo", body: "Foo123" },
  },
  {
    id: "foo1",
    template: "fancy_template",
    bundled: 2,
    order: 1,
    content: { title: "Foo1", body: "Foo123-1" },
  },
  {
    id: "foo2",
    template: "fancy_template",
    bundled: 2,
    order: 2,
    content: { title: "Foo2", body: "Foo123-2" },
  },
  {
    id: "bar",
    template: "fancy_template",
    content: { title: "Foo", body: "Foo123" },
  },
  { id: "baz", content: { title: "Foo", body: "Foo123" } },
  {
    id: "newsletter",
    template: "fancy_template",
    content: { title: "Foo", body: "Foo123" },
  },
  {
    id: "fxa",
    template: "fancy_template",
    content: { title: "Foo", body: "Foo123" },
  },
  {
    id: "belowsearch",
    template: "fancy_template",
    content: { text: "Foo" },
  },
  {
    id: "experimentL10n",
    template: "fancy_template",
    content: { text: { $l10n: { text: "UniqueText" } } },
  },
];
export const FAKE_LOCAL_PROVIDER = {
  id: "onboarding",
  type: "local",
  localProvider: "FAKE_LOCAL_PROVIDER",
  enabled: true,
  cohort: 0,
};
export const FAKE_LOCAL_PROVIDERS = {
  FAKE_LOCAL_PROVIDER: {
    getMessages: () => Promise.resolve(FAKE_LOCAL_MESSAGES),
  },
};

export const FAKE_REMOTE_MESSAGES = [
  {
    id: "qux",
    template: "fancy_template",
    content: { title: "Qux", body: "hello world" },
  },
];
export const FAKE_REMOTE_PROVIDER = {
  id: "remotey",
  type: "remote",
  url: "http://fake.com/endpoint",
  enabled: true,
};

export const FAKE_REMOTE_SETTINGS_PROVIDER = {
  id: "remotey-settingsy",
  type: "remote-settings",
  collection: "collectionname",
  enabled: true,
};
