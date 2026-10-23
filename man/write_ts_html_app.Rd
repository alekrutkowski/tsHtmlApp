% Generated documentation for write_ts_html_app().
\name{write_ts_html_app}
\alias{write_ts_html_app}
\title{Write a Self-Contained HTML Time-Series Explorer}
\usage{
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
}
\arguments{
\item{dt}{A non-empty \code{data.table} with unique, non-empty column names.
Exactly one column must be named \code{time} or \code{time_period}, matched
case-insensitively. Other numeric columns are measures; other atomic columns
are categorical dimensions. The time column plus all categorical columns must
uniquely identify every row. Convert numeric-coded dimensions to character or
factor before calling this function.}
\item{out_dir}{A non-empty directory name, created recursively if needed.}
\item{app_file}{The HTML file name, without a directory component. Its
extension must be \code{.html} or \code{.htm}, case-insensitively.}
\item{data_file}{File name offered by the application's original-RDS download
button. The RDS bytes are embedded in the HTML; no file with this name is
written alongside it. Retained for API compatibility.}
\item{title}{A single non-missing character string used as the app title.}
\item{cascading}{A single non-missing logical. With \code{TRUE}, selections in
earlier categorical columns restrict the choices in later filters, in their
original column order. Invalid downstream selections are cleared.}
\item{overwrite}{A single non-missing logical. Allow replacement of an
existing HTML output file. Other files in the directory are untouched.}
\item{compress}{Compression for the embedded original RDS data, passed to
\code{\link[base]{saveRDS}}. Use \code{FALSE}, \code{TRUE}, \code{"gzip"},
\code{"bzip2"} or \code{"xz"}. Other names supported by the installed R,
such as \code{"zstd"} on supported R versions and platforms, are passed
through to \code{saveRDS()}. This does not compress the HTML or the
JavaScript-readable data.}
}
\value{
Invisibly, a list containing \code{directory} and \code{app} (absolute paths),
\code{data} (\code{NULL}, because there is no sidecar), \code{time_column},
\code{numeric_columns}, \code{categorical_columns}, \code{cascading},
\code{data_file} (the embedded download name), and \code{embedded}
(\code{TRUE}).
}
\description{
Creates one portable HTML file containing the data, styles, JavaScript and
Plotly charting library. Open it directly in a modern browser, including
offline. No R session, Shiny server, installation or network is needed to view
the generated application.
}
\details{
The argument names and order match
\code{tsShinyApp::write_ts_shiny_app()}. The output defaults are
\code{"html-ts-app"} and \code{"index.html"}; \code{data_file} and
\code{compress} describe the embedded RDS download instead of a sidecar.

The generated application has searchable multi-select category filters, one
Plotly chart per measure, shared time-window controls, optional rebasing to
100 at a selected period, point markers (initially off), drag zoom, resizable
and full-screen chart cards, and CSV and original-RDS downloads. Mouse-wheel
zoom is disabled. If more than ten series match the categorical filters, a
shared random sample of ten is plotted. That sample is stable while changing
the time window, base period, markers or chart size.

Time ordering follows the original package: numeric values and numeric
strings, ordered factors, dates, POSIX date-times, years, quarters,
half-years, month codes, week codes and English month-name forms are
recognised. Other labels use case-insensitive lexical ordering. Missing time
values are retained in the embedded original but omitted from charts.
All-missing time columns are rejected. Distinct source times that collapse to
the same character label are rejected with advice to format them explicitly,
rather than silently merge them.

Missing categorical values and empty strings are distinct choices, labelled
\code{(Missing)} and \code{(Blank)}. Series identities use the original
categorical values, not concatenated display labels. Distinct categorical
values that become identical character labels are rejected; format such
columns as character explicitly with sufficient precision. This also applies
when distinct missing representations, such as \code{NA} and \code{NaN} in
a date-time dimension, would share one missing choice. Missing, infinite and
NaN measures appear as chart gaps; their original values are preserved in
the RDS data. A zero, missing or non-finite index base makes that series
unavailable for that measure. The base period may lie outside the visible
time window.

\code{integer64} columns are rejected. Convert them explicitly to character
for dimensions or to double for measures, after considering precision.
Standard R doubles and JavaScript numbers use binary floating-point; the
embedded RDS download preserves the original R object and its attributes.

All input data are embedded, including rows excluded by current filters.
The HTML is therefore a complete data snapshot, not an access-control
mechanism. Data are held in browser memory, so practical size limits depend
on the browser and device. The function does not modify \code{dt}.
}
\examples{
dt <- data.table::data.table(
  country = rep(c("A", "B"), each = 4L),
  time = rep(c("2024-Q1", "2024-Q2", "2024-Q3", "2024-Q4"), 2L),
  value = seq_len(8L)
)
out <- file.path(tempdir(), "ts-html-example")
app <- write_ts_html_app(dt, out_dir = out, overwrite = TRUE)
# Open app$app in a browser. R is not required after generation.
unlink(out, recursive = TRUE)
}
\seealso{\code{\link[data.table]{data.table}}, \code{\link[base]{saveRDS}}}
