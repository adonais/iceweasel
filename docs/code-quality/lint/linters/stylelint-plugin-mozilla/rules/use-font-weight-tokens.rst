========================
use-font-weight-tokens
========================

This rule checks that CSS declarations use font-weight design token variables
instead of hardcoded values. This ensures consistent font-weight usage across
the application and makes it easier to maintain design system consistency.

This rule is autofixable and can automatically replace some font-weight values
with appropriate design tokens where possible.

Examples of incorrect code for this rule:
-----------------------------------------

.. code-block:: css

  .normal-text {
    font-weight: normal;
  }

.. code-block:: css

  .bold-text {
    font-weight: bold;
  }

.. code-block:: css

  .bolder-text {
    font-weight: bolder;
  }

.. code-block:: css

  .lighter-text {
    font-weight: lighter;
  }

.. code-block:: css

  .custom-text {
    font-weight: 400;
  }

.. code-block:: css

  .heading {
    font-weight: 600;
  }

.. code-block:: css

  .bold-text {
    font-weight: 700;
  }

.. code-block:: css

  .light-text {
    font-weight: 300;
  }

.. code-block:: css

  .heavy-text {
    font-weight: 900;
  }

Examples of correct token usage for this rule:
----------------------------------------------

.. code-block:: css

  .normal-text {
    font-weight: var(--font-weight);
  }

.. code-block:: css

  .bold-text {
    font-weight: var(--font-weight-bold);
  }

.. code-block:: css

  .button-text {
    font-weight: var(--button-font-weight);
  }

.. code-block:: css

  .heading-text {
    font-weight: var(--heading-font-weight);
  }

.. code-block:: css

  /* Local CSS variables that reference valid font-weight tokens are allowed */
  :root {
    --custom-font-weight: var(--font-weight-bold);
  }

  .custom-text {
    font-weight: var(--custom-font-weight);
  }

.. code-block:: css

  .custom-text {
    font-weight: var(--custom-font-weight, var(--font-weight-bold));
  }

The rule also allows these non-token values:

.. code-block:: css

  .inherited-text {
    font-weight: inherit;
  }

.. code-block:: css

  .initial-text {
    font-weight: initial;
  }

.. code-block:: css

  .unset-text {
    font-weight: unset;
  }

Autofix functionality
---------------------

This rule can automatically fix some violations by replacing values with
appropriate design tokens:

- ``normal`` → ``var(--font-weight)``
- ``600`` → ``var(--font-weight-bold)``

Examples of autofixable violations:

.. code-block:: css

  /* Before */
  .normal-text {
    font-weight: normal;
  }

  /* After autofix */
  .normal-text {
    font-weight: var(--font-weight);
  }

.. code-block:: css

  /* Before */
  .bold-text {
    font-weight: 600;
  }

  /* After autofix */
  .bold-text {
    font-weight: var(--font-weight-bold);
  }
