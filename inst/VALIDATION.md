# Validation record

Validated on 23 October 2026.

## R generator

The package was loaded with `pkgload::load_all()` and exercised in R 4.6.0
through WebR. Its testthat suite passed **15 test groups and 127 assertions**,
with zero failures, errors or warnings. The actual public writer generated
the delivered workforce example and the browser edge-case fixtures.

The R tests cover argument compatibility, one-file output, no mutation of the
input, original RDS recovery with compression settings, singleton JSON arrays,
overwrite protection, duplicate-key rejection, supported time ordering,
missing and nonfinite values, factor/logical ordering, unusual column names,
script-safe labels, and rejection of ambiguous time/category representations.

The `DESCRIPTION` check and `tools::checkRd()` produced no diagnostics.

## JavaScript engine

All **17 Node.js regression tests** passed. They cover category filtering,
cascades, stable sampling, missing labels, unambiguous series identities,
base periods outside the time window, missing/zero/nonfinite bases, empty
states, CSV quoting and export scopes, and reset behavior.

## Browser integration

The generated files were opened directly through `file://` in Chromium
134.0.6998.35, with the browser context set to offline. **Ten integration
checks** passed, including:

- Every numeric measure renders with the intended initial controls.
- Time-window, marker and index changes update the actual charts and retain
  the same sampled series.
- Both CSV download scopes match the expected records, and the downloaded RDS
  bytes match the embedded original exactly.
- Searchable controls and cascading choices work through user interactions.
- Chart resizing, full-screen viewing, Escape, and PNG downloads work.
- The mobile layout fits a 390-pixel viewport and exposes collapsible filters.
- Hostile HTML/script-like labels remain inert text.
- A 6,001-period, single-series fixture uses the WebGL path and handles a zero
  index base and missing values correctly.
- No external HTTP requests or browser JavaScript errors occurred.

Desktop and mobile screenshots were visually inspected. The source includes
the browser test runner and an R script that generates its fixtures.

## Scope

These are local execution results, not claims about GitHub Actions runs.
The included CI configuration checks R on Windows, Linux and macOS and runs
the JavaScript suite. Native checks on those platforms are delegated to that
workflow when the project is placed in a repository.

The example uses the synthetic dataset supplied with the original package:
6,660 rows, five categorical dimensions, five measures, 333 series and
20 quarters. It contains no observed economic statistics.
