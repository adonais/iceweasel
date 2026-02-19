=====
space
=====

The ``use-design-tokens`` rule checks that CSS spacing declarations (e.g. margins,
padding, gaps, inset, etc.) use design token variables instead of hardcoded values.
This ensures consistent spacing across the application and makes it easier to
maintain design system consistency.

Examples of incorrect code for this rule:
-----------------------------------------

.. code-block:: css

  .custom-button {
    padding: 0.5rem;
  }

.. code-block:: css

  .card {
    margin-inline: 8px;
  }

.. code-block:: css

  .overlay {
    inset: 1rem;
  }

.. code-block:: css

  .grid {
    gap: 4px 12px;
  }

Examples of correct token usage for this rule:
----------------------------------------------

.. code-block:: css

  .custom-button {
    padding-block: var(--space-small);
  }

.. code-block:: css

  .custom-button {
    padding-inline: var(--space-medium);
  }

.. code-block:: css

  .custom-button {
    column-gap: var(--space-xxsmall);
  }

.. code-block:: css

  .custom-button {
    margin-block-start: var(--space-large);
  }

.. code-block:: css

  /* Local CSS variables that reference valid space tokens are allowed */
  :root {
    --custom-space: var(--space-xsmall);
  }

  .custom-button {
    padding: var(--custom-space);
  }

.. code-block:: css

  .custom-button {
    margin-inline-end: var(--custom-space, --space-xlarge);
  }

The rule also allows these values to be non-token values:

.. code-block:: css

  .inherited-inset {
    inset: inherit;
  }

.. code-block:: css

  .unset-padding {
    padding: unset;
  }

.. code-block:: css

  .initial-row-gap {
    row-gap: initial;
  }

.. code-block:: css

  .auto-margin {
    margin-inline: auto;
  }

.. code-block:: css

  .zero-padding {
    padding: 0;
  }

Autofix functionality
---------------------

This rule can automatically fix some violations by replacing common pixel values with
appropriate space tokens. Examples of autofixable violations:

.. code-block:: css

  /* Before */
  .a {
    margin: 2px;
  }

  /* After autofix */
  .a {
    margin: var(--space-xxsmall);
  }

.. code-block:: css

  /* Before */
  .a {
    padding: 8px 16px;
  }

  /* After autofix */
  .a {
    padding: var(--space-small) var(--space-large);
  }

.. code-block:: css

  /* Before */
  .a {
    gap: 24px 32px;
  }

  /* After autofix */
  .a {
    gap: var(--space-xlarge) var(--space-xxlarge);
  }
