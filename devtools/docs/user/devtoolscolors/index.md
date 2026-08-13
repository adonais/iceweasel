---
myst:
  substitutions:
    br: |-
      ```{raw} html
      <br/><br/>```
---

# DevToolsColors

:::{warning}
**Firefox developers**: Don't change any of these values without UX approval. If any of these values need to be changed, you will need to change some CSS code in `/browser/themes/*/devtools/`. File a DevTools bug accordingly.
:::

This chart lists colors and CSS variables as implemented in the dark theme and light theme for developer tools.

```{eval-rst}
.. raw:: html

   <br/>

.. list-table::
   :widths: 25 22 22 31
   :header-rows: 1

   * -
     - Dark Theme
     - Light Theme
     - CSS Variables

   * - **Chrome Colors**
     -
     -
     -

   * - **Tab Toolbar**
     - #252c33 rgba(37, 44, 51, 1)
     - #ebeced rgba(235, 236, 237, 1)
     - ``--theme-tab-toolbar-background``

   * - **Toolbars**
     - #343c45 rgba(52, 60, 69, 1)
     - #f0f1f2 rgba(240, 241, 242, 1)
     - ``--theme-toolbar-background``

   * - **Selection Background**
     - #1d4f73 rgba(29, 79, 115, 1)
     - #4c9ed9 rgba(76, 158, 217, 1)
     - ``--theme-selection-background``

   * - **Selection Text Color**
     - #f5f7fa rgba(245, 247, 250, 1)
     - #f5f7fa rgba(245, 247, 250, 1)
     - ``--theme-selection-color``

   * - **Splitters**
     - #000000 rgba(0, 0, 0, 1)
     - #aaaaaa rgba(170, 170, 170, 1)
     - ``--theme-splitter-color``

   * - **Comment**
     - #5c6773 rgba(92, 103, 115, 1)
     - #747573 rgba(116, 117, 115, 1)
     - ``--theme-comment``

   * - **Content Colors**
     -
     -
     -

   * - **Background - Body**
     - #14171a rgba(17, 19, 21, 1)
     - #fcfcfc rgba(252, 252, 252, 1)
     - ``--theme-body-background``

   * - **Background - Sidebar**
     - #181d20 rgba(24, 29, 32, 1)
     - #f7f7f7 rgba(247, 247, 247, 1)
     - ``--theme-sidebar-background``

   * - **Background - Attention**
     - #b28025 rgba(178, 128, 37, 1)
     - #e6b064 rgba(230, 176, 100, 1)
     - ``--theme-contrast-background``

   * - **Text Colors**
     -
     -
     -

   * - **Body Text**
     - #8fa1b2 rgba(143, 161, 178, 1)
     - #18191a rgba(24, 25, 26, 1)
     - ``--theme-body-color``

   * - **Foreground (Text) - Grey**
     - #b6babf rgba(182, 186, 191, 1)
     - #585959 rgba(88, 89, 89, 1)
     - ``--theme-body-color-alt``

   * - **Content (Text) - High Contrast**
     - #a9bacb rgba(169, 186, 203, 1)
     - #292e33 rgba(41, 46, 51, 1)
     - ``--theme-content-color1``

   * - **Content (Text) - Grey**
     - #8fa1b2 rgba(143, 161, 178, 1)
     - #8fa1b2 rgba(143, 161, 178, 1)
     - ``--theme-content-color2``

   * - **Content (Text) - Dark Grey**
     - #667380 rgba(102, 115, 128, 1)
     - #667380 rgba(102, 115, 128, 1)
     - ``--theme-content-color3``

   * - **Highlight Colors**
     -
     -
     -

   * - **Blue**
     - #46afe3 rgba(70, 175, 227, 1)
     - #0088cc rgba(0, 136, 204, 1)
     - ``--theme-highlight-blue``

   * - **Purple**
     - #6b7abb rgba(107, 122, 187, 1)
     - #5b5fff rgba(91, 95, 255, 1)
     - ``--theme-highlight-purple``

   * - **Pink**
     - #df80ff rgba(223, 128, 255, 1)
     - #b82ee5 rgba(184, 46, 229, 1)
     - ``--theme-highlight-pink``

   * - **Red**
     - #eb5368 rgba(235, 83, 104, 1)
     - #ed2655 rgba(237, 38, 85, 1)
     - ``--theme-highlight-red``

   * - **Orange**
     - #d96629 rgba(217, 102, 41, 1)
     - #f13c00 rgba(241, 60, 0, 1)
     - ``--theme-highlight-orange``

   * - **Light Orange**
     - #d99b28 rgba(217, 155, 40, 1)
     - #d97e00 rgba(217, 126, 0, 1)
     - ``--theme-highlight-lightorange``

   * - **Green**
     - #70bf53 rgba(112, 191, 83, 1)
     - #2cbb0f rgba(44, 187, 15, 1)
     - ``--theme-highlight-green``

   * - **Blue-Grey**
     - #5e88b0 rgba(94, 136, 176, 1)
     - #0072ab rgba(0, 114, 171, 1)
     - ``--theme-highlight-bluegrey``

   * - **Yellow**
     - #ffffb4 rgba(255, 255, 180, 1)
     - #ffffb4 rgba(255, 255, 180, 1)
     - ``--theme-highlight-yellow``

```

:::{warning}
Not yet finalized. See [bug 916766](https://bugzilla.mozilla.org/show_bug.cgi?id=916766) for progress.
:::
