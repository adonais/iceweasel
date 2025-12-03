===========================
use-background-color-tokens
===========================

This rule checks that CSS declarations use background-color design token variables
instead of hard-coded values. This ensures consistent background-color across
the application and makes it easier to maintain design system adoption.

Examples of incorrect code for this rule:
-----------------------------------------

.. code-block:: css

  .card {
    background-color: #191919;
  }

.. code-block:: css

  .custom-button {
    background: url('image.png') rgba(42 42 42 / 0.15);
  }

.. code-block:: css

  button:hover {
    background: rgba(0 0 0 / 0.25);
  }

.. code-block:: css

  :root {
    --my-token: blue;
  }

  .my-button {
    background: url('image.png') no-repeat center center / auto var(--my-token, oklch(55% 0.21 15));
  }

.. code-block:: css

  .accent-background-color {
    background-color: AccentColor;
  }

Examples of correct token usage for this rule:
----------------------------------------------

.. code-block:: css

  .card {
    background-color: var(--background-color-box);
  }

.. code-block:: css

  .custom-button {
    background: url('image.png') var(--background-color-box);
  }

.. code-block:: css

  button:hover {
    background: var(--background-color-box);
  }

.. code-block:: css

  /* You may set a fallback for a token. */

  .my-button {
    background: var(--background-color-box, oklch(55% 0.21 15));
  }

.. code-block:: css

  /* Local CSS variables that reference valid border-radius tokens are allowed */

  :root {
    --my-token: var(--background-color-box);
  }

  .my-button {
    background-color: var(--my-token, oklch(55% 0.21 15));
  }

The rule also allows these non-token values:

.. code-block:: css

  .transparent-background-color {
    background-color: transparent;
  }

.. code-block:: css

  .inherited-background-color{
    background-color: inherit;
  }

.. code-block:: css

  .unset-background-color {
    background-color: unset;
  }

.. code-block:: css

  .initial-background-color {
    background-color: initial;
  }

.. code-block:: css

  .current-background-color {
    background-color: currentColor;
  }
