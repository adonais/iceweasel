# A Glossary of Common Terms

Some areas maintain their own glossary:

- {doc}`Build system glossary </build/buildsystem/glossary>`
- {doc}`Messaging system glossary </browser/components/asrouter/docs/messaging-glossary>`
  (Nimbus, experiments, rollouts, etc.)
- The Definitions section of the
  {doc}`Pocket Guide: Shipping Firefox </contributing/pocket-guide-shipping-firefox>`
  (release process terms such as uplift, merge day, backfill or backstop)

:::{glossary}
:sorted: true

a11y
  An abbreviation for Accessibility.

Actor
  A pair of parent and child classes used to communicate between the parent
  process and content processes. JS actors are documented in
  {doc}`JSActors </dom/ipc/jsactors>`.

Artifact build
  A build that downloads compiled C++ and Rust code from CI instead of
  compiling it locally, useful when only working on front-end code. See
  {doc}`Artifact builds </contributing/build/artifact_builds>`.

Autoland
  The integration repository where patches landed with Lando go first. Its
  changes are merged to firefox-main once CI is green.

Backout
  Reverting a patch that broke the build, caused test failures or regressions,
  usually done by a sheriff.

Chrome
  Usually the parts of the application UI outside of the rendered webpage.
  Code is also said to be "chrome-privileged" when it runs with the system
  principal, as opposed to web content.

Content
  Usually refers to webpages being rendered, may also be seen as "running in
  content" in which case it can include UI privileged code running in a process
  that is rendering webpages.

Content process
  A process rendering web content, with fewer privileges than the parent
  process. See the {doc}`process model </dom/ipc/process_model>`.

e10s
  *Numeronym* for Electrolysis, the project which moved web content out of the
  parent process into separate content processes.

Fission
  The project which isolates sites in separate processes (site isolation).

Gecko
  The browser engine of Firefox: networking, DOM, layout, graphics, etc.

i18n
  An abbreviation for Internationalization.

IPDL
  Inter-process communication Protocol Definition Language, used to describe
  the messages exchanged between processes. See {doc}`IPDL </ipc/ipdl>`.

l10n
  *Numeronym* for {term}`Localization`: *l*, 10 chars, *n*.

l10n-merge
  Nickname for the process of merging `en-US` and a particular
  localization into one joint artifact without any missing strings, and
  without technical errors, as far as possible.

Localizability
  Enabling a piece of software to be localized. This is mostly
  externalizing English strings, and writing build support to
  pick up localized search engines etc.

Localization
  The process of creating content in a native language, including
  translation, but also customizations like Search.

mach
  The command line interface to the build system and most developer tools.
  See {doc}`mach </mach/index>`.

mots
  The tool used to manage the list of modules, their owners and peers. See
  {doc}`mots </mots/index>`.

Parent process
  The main, most privileged process of Firefox, which runs the browser UI.
  Also known as the chrome process.

Pref
  Short for preference, a named value used to configure behavior or toggle
  features. See {doc}`libpref </modules/libpref/index>`.

Principal
  The security context of a piece of code or document, used to perform
  security checks. The system principal is the most privileged one.

Sheriff
  A member of the team monitoring the trees, who stars intermittent failures,
  backs out breaking patches and merges autoland to firefox-main.

SpiderMonkey
  The JavaScript and WebAssembly engine of Firefox. See
  {doc}`SpiderMonkey </js/index>`.

Stylo
  The CSS engine of Firefox, written in Rust and shared with Servo.

Taskcluster
  The CI system running builds and tests. See {doc}`Taskcluster </taskcluster/index>`.

Treeherder
  The web interface showing the results of the CI tasks for each push.

Try
  A repository where developers can push patches to run them in CI without
  landing them. See {doc}`Try </tools/try/index>`.

WebIDL
  The language used to describe the interfaces exposed to web content. See
  {doc}`WebIDL bindings </dom/webIdlBindings/index>`.

WebRender
  The GPU-based rendering engine of Firefox, written in Rust.

XPCOM
  Cross Platform Component Object Model, the component system used through the
  Gecko codebase. See {doc}`XPCOM </xpcom/index>`.

XPIDL
  The interface description language for XPCOM interfaces. See
  {doc}`XPIDL </xpcom/xpidl>`.

XUL
  A Mozilla-specific XML UI definition language that we are slowly phasing out
  and replacing with standard HTML.
:::
