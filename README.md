# tsHtmlApp

Create a reactive time-series explorer as **one self-contained HTML file**.
The exported file includes all data, styles, JavaScript and Plotly.js. Open it
directly in a browser, including from a local `file://` path, and use it offline.

The package exposes one function, `write_ts_html_app()`. Its eight argument
names and their order match `tsShinyApp::write_ts_shiny_app()`. The interface
keeps the original sidebar filters, time-window controls, index rebasing and
interactive chart cards. All reactive work runs in the browser.

## Installation

Install the generation dependencies once:

```r
install.packages(c("data.table", "jsonlite", "magrittr"))
```

For a source archive:

```r
install.packages("tsHtmlApp_0.1.0.tar.gz", repos = NULL, type = "source")
```

For the source-project ZIP, extract it first, then install its `tsHtmlApp`
directory:

```r
install.packages("path/to/tsHtmlApp", repos = NULL, type = "source")
```

`tsHtmlApp` contains no C, C++ or Rust code to compile. R and its generation
dependencies are used to write the HTML. The recipient only needs a modern
browser to use the finished application.

## Quick start

```r
library(data.table)
library(magrittr)
library(tsHtmlApp)

set.seed(1)
app <- CJ(
  country = c("Belgium", "Netherlands"),
  age = c("15-24", "25-64"),
  time = paste0("2024-Q", 1:4)
) %>%
  .[, `:=`(
    employment = round(runif(.N, 60, 80), 1),
    unemployment = round(runif(.N, 3, 12), 1)
  )] %>%
  write_ts_html_app(
    out_dir = "economic-indicators",
    title = "Economic indicators",
    cascading = TRUE
  )

utils::browseURL(app$app)
```

The only generated file is `economic-indicators/index.html`. Copy that file
to another computer, attach it to a message, or host it on a static web server.
No installation or running R process is needed to view it. Some email and
file-preview services disable scripts; download the HTML and open the saved
file in the browser in that case.

## Included synthetic example

The package includes the synthetic regional-workforce data from `tsShinyApp`.
It contains five categorical dimensions and five numeric measures. The values
are illustrative and are not observed economic data.

```r
app <- system.file(
  "extdata", "synthetic_regional_workforce_quarterly.csv",
  package = "tsHtmlApp", mustWork = TRUE
) %>%
  fread() %>%
  write_ts_html_app(
    out_dir = "regional-workforce",
    title = "Regional workforce | Synthetic data",
    cascading = TRUE,
    overwrite = TRUE
  )

utils::browseURL(app$app)
```

The same example is installed as `examples/regional_workforce.R`.

## Function signature

```r
write_ts_html_app(
  dt,
  out_dir = "html-ts-app",
  app_file = "index.html",
  data_file = "data.rds",
  title = "Time-series explorer",
  cascading = FALSE,
  overwrite = FALSE,
  compress = "gzip"
)
```

| Argument | Meaning |
|---|---|
| `dt` | A non-empty `data.table` satisfying the input contract below. The function does not modify it. |
| `out_dir` | Output directory, created recursively when necessary. |
| `app_file` | A file name ending in `.html` or `.htm`, without a directory component. |
| `data_file` | File name used when downloading the embedded original RDS data. No separate data file is written. |
| `title` | Application and browser-tab title. Text is escaped for HTML. |
| `cascading` | With `TRUE`, choices in each categorical filter are restricted by selections in earlier categorical columns. The default is `FALSE`. |
| `overwrite` | Set `TRUE` to replace an existing output HTML file. The default prevents replacement. |
| `compress` | Passed to `saveRDS()` for the embedded original-data download. Common values are `FALSE`, `TRUE`, `"gzip"`, `"bzip2"` and `"xz"`; additional compressors supported by the installed R are also accepted. It does not compress chart JSON or the HTML itself. |

`out_dir` and `app_file` have HTML-appropriate defaults. The other defaults
match the Shiny generator. Calls with positional arguments remain valid when
the application filename is changed to an HTML filename. Existing scripts
that explicitly pass `app_file = "app.R"` should use `"index.html"` instead.
For example, `compress = "zstd"` requires R 4.5.0 or later with the relevant
operating-system support; `saveRDS()` reports unsupported compression choices.

The result is returned invisibly:

| Field | Value |
|---|---|
| `directory` | Absolute output directory. |
| `app` | Absolute path to the HTML file. |
| `data` | `NULL`, because data are embedded. |
| `time_column` | Detected time-column name. |
| `numeric_columns` | Numeric measure-column names, in input order. |
| `categorical_columns` | Categorical column names, in input order. |
| `cascading` | The supplied cascading setting. |
| `data_file` | Embedded original-data download name. |
| `embedded` | `TRUE`. |

## Input contract

The input must be a `data.table` with unique, non-empty column names and exactly
one column named `time` or `time_period`, ignoring case. `TIME`, `Time` and
`TIME_PERIOD` are accepted; including both candidate names is an error.

Every numeric column other than the time column is a measure and gets a chart.
Every non-numeric column other than time becomes a categorical dimension.
Convert numeric category codes explicitly:

```r
DT %>% .[, region_code := as.character(region_code)]
```

The time column together with all categorical columns must uniquely identify
each row. Duplicate keys produce an error with example duplicate combinations.
The generator does not aggregate rows. It also rejects list, matrix, complex
and raw columns that cannot be represented as supported times or categories.

`bit64::integer64` columns require explicit conversion. Use `as.character()`
for identifier dimensions and time labels, or `as.numeric()` for measures only
if the resulting double-precision representation is appropriate. This avoids
silently interpreting integer64 storage as ordinary doubles.

### Time ordering

The generator calculates the time order in R and embeds that order along with
the original display labels. It preserves ordered-factor order, sorts numeric
times numerically, and sorts `Date` and POSIX date-times chronologically. It
recognizes common character periods, including:

```text
2024        FY2024      2024-Q1      2024Q1      Q1-2024
2024-H1     H1-2024     2024-M01     202401      2024-W01
2024-Jan    Jan-2024    2024-01-15
```

Unrecognized text uses case-insensitive lexical ordering. Use an ordered factor
when a custom order is required. Missing times are omitted from the charts and
windowed CSV exports; their count is shown, and those rows remain in the
embedded original RDS. A time column with no usable values is rejected.
Distinct times that would produce the same display label are rejected;
format them explicitly as character with enough numeric or subsecond
precision before exporting.

### Categories and numeric values

Missing categorical values appear as `(Missing)` and empty strings as `(Blank)`.
Internal category identifiers distinguish these from literal strings with the
same display labels. Factor choices follow the factor levels; unused levels
are omitted. Other text choices are sorted, and logical choices use `FALSE`
then `TRUE`.

Distinct categorical values that would collapse to one character
representation are rejected. Format such values explicitly before export,
for example by converting date-times to character with sufficient subsecond
precision.

`NA`, `NaN`, `Inf` and `-Inf` measures are gaps in the charts. The original RDS
retains their R values and classes. CSV exports preserve non-finite values as
text, while missing values use empty fields. Ordinary chart numbers use
JavaScript double precision.

## Using the browser application

### Filters

Each categorical dimension has a searchable multi-select filter. Leaving it
empty includes all its available values. With `cascading = FALSE`, every
filter keeps its full choice set. With `TRUE`, choices cascade in the original
left-to-right order of categorical columns in `dt`. A later selection never
alters an earlier filter's choices. Changing an earlier selection removes
invalid selections from downstream filters.

### Time window and indexing

The From and To controls set a shared window for all charts. The index toggle
rebases each series and each measure independently to `100` at the selected
base period. The base may be outside the displayed window. A missing,
non-finite or zero base value makes that series unavailable for that measure;
the app does not substitute another period.

Point markers start off. Chart zoom is available through dragging and the
Plotly toolbar. Mouse-wheel and two-finger gestures scroll the page rather
than zooming the chart.

### Charts and the 10-series cap

Each numeric measure gets a separate Plotly chart. The same selected series
and colors are used across the charts. Cards support edge/corner resizing and
full-screen viewing. A busy indicator covers changes while rendering.

When categorical filters match more than 10 series, the app displays a warning
and a random sample of 10. That sample is shared by all measures and remains
stable while the time window, indexing, base period or markers change. Changing
categorical selections can change the sample. The cap concerns display only;
the HTML still contains the whole supplied dataset.

### Downloads

CSV downloads can include all rows matching the filters and time window, or
just the displayed sample. They contain original measure values even when the
charts are indexed. Each chart's download button exports a PNG image.

The original RDS download uses the `data_file` name and contains the complete
input table, including rows outside the filters and window. Recover it with
`readRDS("data.rds")`, using the chosen filename. Factors, attributes and
original R data types are retained there.

## Design and practical limits

All browser assets are included in the package and embedded in every export.
Generation does not need to download a JavaScript library. The generated page
does not fetch data or assets from a CDN, and filters are evaluated locally.

An export includes browser-readable data and a base64-encoded RDS copy. This
makes files larger than a data-only export and lets recipients recover the
original data. Everyone who receives the HTML receives the complete supplied
dataset, regardless of the initial chart selection. Subset the data before
generation when the exported dataset itself should be smaller.

Browser memory and rendering time limit practical dataset size. The 10-series
cap reduces chart work but does not reduce embedded size or the memory needed
for filtering. Compression affects the RDS copy only. For exceptionally large
datasets, export a relevant subset or retain a server-based workflow.

## Development

The delivered version's execution results are recorded in
[`inst/VALIDATION.md`](inst/VALIDATION.md).

Run R checks from the directory containing the package directory:

```sh
R CMD build tsHtmlApp
R CMD check --no-manual tsHtmlApp_0.1.0.tar.gz
```

Run the JavaScript regression suite from the source package directory, using
Node.js 22 or later:

```sh
node --test tests/js/*.test.js
```

### Offline browser checks

Generate the bundled regional-workforce example with `cascading = TRUE`,
then run these commands from the source package directory:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser/offline-smoke.cjs /absolute/path/workforce-explorer.html
```

Replace the last path with the generated HTML file, such as
`regional-workforce/index.html`. The script opens the local file with Chromium
in offline mode and checks chart rendering, controls, filtering, downloads,
resizing, responsive layout and the absence of network requests. Its screenshots
and downloaded verification files go to `browser-results/` by default.

The script header lists optional environment variables: `TSHTML_QA_DIR` changes
the result directory, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects an existing
Chromium executable, and `TSHTML_EDGE_FIXTURES` enables additional fixture checks.
The latter points to a directory containing `security.html` and
`single-series.html`. Generate all three fixtures with the installed package:

```sh
Rscript tests/browser/make-fixtures.R browser-fixtures
```

Then point `TSHTML_EDGE_FIXTURES` to that directory when running the smoke test
against `browser-fixtures/workforce-explorer.html`.
Playwright and Chromium are development tools, not generation or viewing
dependencies.

### Continuous integration

GitHub Actions check R on Windows, Linux and macOS, and run the JavaScript
tests separately. Pushing a tag matching `v<DESCRIPTION version>` builds and
checks the source archive before attaching it to a GitHub Release. This
package has no compiled native code and its source archive is portable across
platforms.

## License and acknowledgements

MIT license, Copyright (c) 2026 Alek Rutkowski. Contact:
<alek.rutkowski@gmail.com>.

The API, original interface behavior, validation/time-ordering logic and
synthetic example data are adapted from
[tsShinyApp](https://github.com/alekrutkowski/tsShinyApp), also MIT-licensed by
Alek Rutkowski. Plotly.js gl2d **4.1.2** is vendored with its complete upstream
license and embedded in generated pages. The bundle supports SVG scatter and
WebGL scatter charts.

The complete license notices for the package versions actually included in
the gl2d bundle are in `inst/vendor/THIRD-PARTY-LICENSES.txt` and are embedded
in every generated HTML file. `THIRD-PARTY-PROVENANCE.json` records their exact
source packages, versions, license sources and verified integrity hashes.

Generation relies on [data.table](https://r-datatable.com/),
[jsonlite](https://jeroen.r-universe.dev/jsonlite/doc/manual.html) and
[magrittr](https://magrittr.tidyverse.org/). Tests use
[testthat](https://testthat.r-lib.org/), and CI uses
[r-lib/actions](https://github.com/r-lib/actions). Their own licenses apply.
See `inst/NOTICE` and `inst/vendor/` for the complete attributions and
Plotly distribution provenance.
