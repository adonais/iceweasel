=====
color
=====

The ``use-design-tokens`` rule checks that CSS ``color`` declarations use
design token variables instead of hardcoded values. This ensures consistent
text-color usage across the application and makes it easier to maintain design
system consistency.

Examples of incorrect code for this rule:
-----------------------------------------

.. code-block:: css

  .card {
    color: #191919;
  }

.. code-block:: css

  .custom-button {
    color: rgba(42 42 42 / 0.15);
  }

.. code-block:: css

  button:hover {
    color: rgba(0 0 0 / 0.25);
  }

.. code-block:: css

  .element {
    color: oklch(69% 0.19 15);
  }

.. code-block:: css

  :root {
    --my-token: blue;
  }

  .my-button {
    color: var(--my-token, oklch(55% 0.21 15));
  }

Examples of correct token usage for this rule:
----------------------------------------------

.. code-block:: css

  .card {
    color: var(--text-color);
  }

.. code-block:: css

  .custom-button {
    color: var(--text-color);
  }

.. code-block:: css

  button:hover {
    color: var(--text-color);
  }

.. code-block:: css

  /* You may set a fallback for a token. */

  .my-button {
    color: var(--text-color, oklch(55% 0.21 15));
  }

.. code-block:: css

  /* Local CSS variables that reference valid text-color tokens are allowed */

  :root {
    --my-token: var(--text-color);
  }

  .my-button {
    color: var(--my-token);
  }

The rule also allows these non-token values:

.. code-block:: css

  .inherited-text-color {
    color: inherit;
  }

.. code-block:: css

  .initial-text-color {
    color: initial;
  }

.. code-block:: css

  .revert-text-color {
    color: revert;
  }

.. code-block:: css

  .revert-layer-text-color {
    color: revert-layer;
  }

.. code-block:: css

  .unset-text-color {
    color: unset;
  }

.. code-block:: css

  .current-text-color {
    color: currentColor;
  }

.. code-block:: css

  .current-text-color {
    color: white;
  }

.. code-block:: css

  .current-text-color {
    color: black;
  }

Autofix functionality
---------------------

This rule can automatically fix some violations by replacing hex color values with
appropriate color names. Examples of autofixable violations:

.. code-block:: css

  /* Before */
  .a {
    color: #fff;
  }

  /* After autofix */
  .a {
    color: white;
  }

.. code-block:: css

  /* Before */
  .a {
    color: #ffffff;
  }

  /* After autofix */
  .a {
    color: white;
  }

.. code-block:: css

  /* Before */
  .a {
    color: #FFF;
  }

  /* After autofix */
  .a {
    color: white;
  }

.. code-block:: css

  /* Before */
  .a {
    color: #FFFFFF;
  }

  /* After autofix */
  .a {
    color: white;
  }

.. code-block:: css

  /* Before */
  .a {
    color: #000;
  }

  /* After autofix */
  .a {
    color: black;
  }

.. code-block:: css

  /* Before */
  .a {
    color: #000000;
  }

  /* After autofix */
  .a {
    color: black;
  }
