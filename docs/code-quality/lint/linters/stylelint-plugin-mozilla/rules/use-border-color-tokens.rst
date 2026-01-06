=======================
use-border-color-tokens
=======================

This rule checks that CSS declarations use border-color design token variables
instead of hard-coded values. This ensures consistent border-color across
the application and makes it easier to maintain design system adoption.

Examples of incorrect code for this rule:
-----------------------------------------

.. code-block:: css

    .card {
      border-color: #191919;
    }

.. code-block:: css

    .custom-button {
      border: 3px dashed rgba(42 42 42 / 0.15);
    }

.. code-block:: css

    button:hover {
      outline-color: rgba(0 0 0 / 0.25);
    }

.. code-block:: css

  :root {
    --my-token: blue;
  }

  .my-button {
    border: 1px solid var(--my-token, oklch(55% 0.21 15));
  }

Examples of correct token usage for this rule:
----------------------------------------------

.. code-block:: css

  .card {
    border-color: var(--border-color);
  }

.. code-block:: css

  .custom-button {
    border: 3px dashed var(--border-color);
  }

.. code-block:: css

  button:hover {
    outline-color: --outline-color;
  }

.. code-block:: css

  /* You may set a fallback for a token. */

  .my-button {
    border: 1px solid var(--border-color, oklch(55% 0.21 15));
  }

.. code-block:: css

  /* Local CSS variables that reference valid border-radius tokens are allowed */

  :root {
    --my-token: var(--border-color);
  }

  .my-button {
    border: 1px solid var(--my-token, oklch(55% 0.21 15));
  }

The rule also allows these values non-token values:

.. code-block:: css

  .transparent-border-color {
    border-color: transparent;
  }

.. code-block:: css

  .current-border-color {
    border-color: currentColor;
  }

.. code-block:: css

  .white-border-color {
    border-color: white;
  }

.. code-block:: css

  .black-border-color {
    border-color: black;
  }

.. code-block:: css

  .inherited-border-color{
    border-colors: inherit;
  }

.. code-block:: css

  .unset-border-color {
    border-color: unset;
  }

.. code-block:: css

  .initial-border-color {
    border-color: initial;
  }

.. code-block:: css

  .current-border-color {
    border-color: currentColor;
  }

Autofix functionality
---------------------

This rule can automatically fix some violations by replacing hex color values with
appropriate color names. Examples of autofixable violations:

.. code-block:: css

  /* Before */
  .a {
    border-color: #fff;
  }

  /* After autofix */
  .a {
    border-color: white;
  }

.. code-block:: css

  /* Before */
  .a {
    border-color: #ffffff;
  }

  /* After autofix */
  .a {
    border-color: white;
  }

.. code-block:: css

  /* Before */
  .a {
    border-color: #FFF;
  }

  /* After autofix */
  .a {
    border-color: white;
  }

.. code-block:: css

  /* Before */
  .a {
    border-color: #FFFFFF;
  }

  /* After autofix */
  .a {
    border-color: white;
  }

.. code-block:: css

  /* Before */
  .a {
    border-color: #000;
  }

  /* After autofix */
  .a {
    border-color: black;
  }

.. code-block:: css

  /* Before */
  .a {
    border-color: #000000;
  }

  /* After autofix */
  .a {
    border-color: black;
  }
