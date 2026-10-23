# Copyright (c) 2026 Alek Rutkowski. MIT license.
# Validation, category ordering and time ordering are adapted from tsShinyApp.

# We qualify data.table functions explicitly, while using its subsetting API.
.datatable.aware <- TRUE

#' Write a self-contained HTML time-series explorer
#'
#' Creates one portable HTML file containing the data, styles, JavaScript and
#' Plotly charting library. Open it directly in a modern browser, including
#' offline. No R session, Shiny server, installation or network is needed to
#' view the generated application.
#'
#' @param dt A non-empty [data.table::data.table()] with unique, non-empty
#'   column names. Exactly one column must be named `time` or `time_period`
#'   (case-insensitive). Other numeric columns are measures and other atomic
#'   columns are categorical dimensions. The time column plus all categorical
#'   columns must uniquely identify every row. Convert numeric-coded dimensions
#'   to character or factor before calling this function.
#' @param out_dir A non-empty directory name, created recursively if needed.
#' @param app_file The HTML file name, without a directory component. Its
#'   extension must be `.html` or `.htm`, case-insensitively.
#' @param data_file File name offered by the application's original-RDS
#'   download button. The RDS bytes are embedded in the HTML, so no file with
#'   this name is written alongside it. Retained for API compatibility.
#' @param title A single non-missing character string used as the app title.
#' @param cascading A single non-missing logical. With `TRUE`, selections in
#'   earlier categorical columns restrict the choices in later filters, in
#'   their original column order. Invalid downstream selections are cleared.
#' @param overwrite A single non-missing logical. Allow replacement of an
#'   existing HTML output file. Other files in the directory are untouched.
#' @param compress Compression for the embedded original RDS data, passed to
#'   [base::saveRDS()]. Use `FALSE`, `TRUE`, `"gzip"`, `"bzip2"` or `"xz"`.
#'   Other names supported by the installed R, such as `"zstd"` on supported
#'   R versions and platforms, are passed through to `saveRDS()`.
#'   This does not compress the HTML or the JavaScript-readable data.
#'
#' @details
#' The argument names and order match `tsShinyApp::write_ts_shiny_app()`.
#' The output defaults are `"html-ts-app"` and `"index.html"`; `data_file`
#' and `compress` describe the embedded RDS download instead of a sidecar.
#'
#' The generated application has searchable multi-select category filters,
#' one Plotly chart per measure, shared time-window controls, optional rebasing
#' to 100 at a selected period, point markers (initially off), drag zoom,
#' resizable and full-screen chart cards, and CSV and original-RDS downloads.
#' Mouse-wheel zoom is disabled. If more than ten series match the categorical
#' filters, a shared random sample of ten is plotted. That sample is stable
#' while changing the time window, base period, markers or chart size.
#'
#' The time ordering follows the original package: numeric values and numeric
#' strings, ordered factors, dates, POSIX date-times, years, quarters,
#' half-years, month codes, week codes and English month-name forms are
#' recognised. Other labels use a case-insensitive lexical ordering. Missing
#' time values are retained in the embedded original but omitted from charts.
#' All-missing time columns are rejected. Distinct source times that collapse
#' to the same character label are rejected with advice to format them
#' explicitly, rather than silently merge them.
#'
#' Missing categorical values and empty strings are distinct choices, labelled
#' `(Missing)` and `(Blank)`. Series identities use the original categorical
#' values, not concatenated display labels. Distinct categorical values that
#' become identical character labels are rejected; format such columns as
#' character explicitly with sufficient precision. This also applies when
#' distinct missing representations, such as `NA` and `NaN` in a date-time
#' dimension, would share one missing choice. Missing, infinite and NaN measures
#' appear as chart gaps; their original values are preserved in the RDS data.
#' A zero, missing or non-finite index base makes that series unavailable for
#' that measure. The base period may lie outside the visible time window.
#'
#' `integer64` columns are rejected: convert them explicitly to character for
#' dimensions or to double for measures, after considering precision. Standard
#' R doubles and JavaScript numbers use binary floating-point; the embedded
#' RDS download preserves the original R object and its attributes.
#'
#' All input data are embedded, including rows excluded by current filters.
#' The HTML is therefore a complete data snapshot, not an access-control
#' mechanism. The data are held in browser memory, so practical size limits
#' depend on the browser and device. The function does not modify `dt`.
#'
#' @return Invisibly, a list containing `directory` and `app` (absolute paths),
#'   `data` (`NULL`, since there is no sidecar), `time_column`,
#'   `numeric_columns`, `categorical_columns`, `cascading`, `data_file` (the
#'   embedded download name), and `embedded` (`TRUE`).
#'
#' @examples
#' dt <- data.table::data.table(
#'   country = rep(c("A", "B"), each = 4L),
#'   time = rep(c("2024-Q1", "2024-Q2", "2024-Q3", "2024-Q4"), 2L),
#'   value = seq_len(8L)
#' )
#' out <- file.path(tempdir(), "ts-html-example")
#' app <- write_ts_html_app(dt, out_dir = out, overwrite = TRUE)
#' # Open app$app in a browser. R is not required after generation.
#' unlink(out, recursive = TRUE)
#'
#' @importFrom magrittr %>%
#' @export
write_ts_html_app <- function(
    dt,
    out_dir = "html-ts-app",
    app_file = "index.html",
    data_file = "data.rds",
    title = "Time-series explorer",
    cascading = FALSE,
    overwrite = FALSE,
    compress = "gzip"
) {
  .ts_scalar_string(out_dir, "out_dir", nonempty = TRUE)
  .ts_filename(app_file, "app_file")
  .ts_filename(data_file, "data_file")
  .ts_scalar_string(title, "title")
  .ts_scalar_logical(cascading, "cascading")
  .ts_scalar_logical(overwrite, "overwrite")
  if (!grepl("[.]html?$", app_file, ignore.case = TRUE))
    stop("'app_file' must have an .html or .htm extension.", call. = FALSE)
  if (!((is.logical(compress) && length(compress) == 1L && !is.na(compress)) ||
        (is.character(compress) && length(compress) == 1L &&
         !is.na(compress) && nzchar(compress))))
    stop("'compress' must be FALSE, TRUE or a compression name accepted by saveRDS().",
         call. = FALSE)

  app_path <- file.path(path.expand(out_dir), app_file)
  if (dir.exists(app_path))
    stop("The output HTML path is an existing directory: ", app_path, call. = FALSE)
  if (file.exists(app_path) && !overwrite)
    stop("Refusing to overwrite existing file: ", app_path,
         ". Use overwrite = TRUE if intended.", call. = FALSE)

  # Validate and serialise before creating an output directory or touching files.
  payload <- .ts_payload(dt, title, cascading, data_file, compress)
  html <- .ts_fill_template(.ts_asset("templates", "app.html"), list(
    TITLE = .ts_html_escape(title),
    CSS = .ts_asset("templates", "app.css"),
    PAYLOAD = .ts_script_json(payload),
    PLOTLY = .ts_inline_script(.ts_asset("vendor", "plotly-gl2d.min.js")),
    ENGINE = .ts_inline_script(.ts_asset("templates", "engine.js")),
    APP = .ts_inline_script(.ts_asset("templates", "app.js")),
    LICENSES = .ts_html_escape(paste(
      .ts_asset("LICENSE-tsHtmlApp.txt"),
      .ts_asset("NOTICE"),
      .ts_asset("vendor", "LICENSE-plotly.txt"),
      .ts_asset("vendor", "THIRD-PARTY-LICENSES.txt"),
      sep = "\n\n"
    ))
  ))

  if (!dir.exists(dirname(app_path)) &&
      !dir.create(dirname(app_path), recursive = TRUE, showWarnings = FALSE))
    stop("Could not create output directory: ", dirname(app_path), call. = FALSE)
  .ts_write_html(html, app_path, overwrite)
  app_path <- normalizePath(app_path, winslash = "/", mustWork = TRUE)
  message("Created: ", app_path, "\nOpen this HTML file directly in a browser.")
  invisible(list(
    directory = dirname(app_path), app = app_path, data = NULL,
    time_column = payload$time$name,
    numeric_columns = vapply(payload$measures, `[[`, "", "name"),
    categorical_columns = vapply(payload$dimensions, `[[`, "", "name"),
    cascading = cascading, data_file = data_file, embedded = TRUE
  ))
}

.ts_scalar_string <- function(x, name, nonempty = FALSE) {
  if (!is.character(x) || length(x) != 1L || is.na(x) ||
      (nonempty && !nzchar(trimws(x))))
    stop("'", name, "' must be one ", if (nonempty) "non-empty " else "",
         "non-missing character string.", call. = FALSE)
  invisible(x)
}

.ts_scalar_logical <- function(x, name) {
  if (!is.logical(x) || length(x) != 1L || is.na(x))
    stop("'", name, "' must be exactly TRUE or FALSE.", call. = FALSE)
  invisible(x)
}

.ts_filename <- function(x, name) {
  .ts_scalar_string(x, name, nonempty = TRUE)
  if (x %in% c(".", "..") || grepl("[/\\\\:<>\"|?*[:cntrl:]]", x) ||
      grepl("[. ]$", x) ||
      grepl("^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])([.]|$)", x,
            ignore.case = TRUE))
    stop("'", name, "' must be a portable file name, not a path.", call. = FALSE)
  invisible(x)
}

.ts_payload <- function(dt, title, cascading, data_file, compress) {
  if (!data.table::is.data.table(dt))
    stop("'dt' must be a data.table.", call. = FALSE)
  if (!nrow(dt)) stop("'dt' has no rows.", call. = FALSE)
  if (anyDuplicated(names(dt))) stop("Column names must be unique.", call. = FALSE)
  if (anyNA(names(dt)) || any(!nzchar(names(dt))))
    stop("Column names must be non-missing and non-empty.", call. = FALSE)
  integer64_cols <- names(dt)[vapply(dt, inherits, logical(1L), "integer64")]
  if (length(integer64_cols))
    stop("integer64 columns need explicit conversion to character or numeric: ",
         paste(integer64_cols, collapse = ", "),
         ". This prevents silent precision loss in JavaScript.", call. = FALSE)

  x <- data.table::copy(dt)
  time_ix <- which(tolower(names(x)) %in% c("time", "time_period"))
  if (!length(time_ix))
    stop("No time column found. Expected 'time' or 'time_period' (case-insensitive).",
         call. = FALSE)
  if (length(time_ix) != 1L)
    stop("More than one candidate time column was found: ",
         paste(names(x)[time_ix], collapse = ", "),
         ". Keep exactly one time column.", call. = FALSE)
  time_col <- names(x)[time_ix]
  bad_atomic <- function(z)
    !is.atomic(z) || !is.null(dim(z)) || is.complex(z) || is.raw(z)
  if (bad_atomic(x[[time_col]]))
    stop("The time column must be an atomic vector, not complex or raw.", call. = FALSE)
  is_measure <- vapply(x, is.numeric, logical(1L))
  numeric_cols <- setdiff(names(x)[is_measure], time_col)
  categorical_cols <- setdiff(names(x)[!is_measure], time_col)
  if (!length(numeric_cols))
    stop("No numeric measure columns were found after excluding the time column.",
         call. = FALSE)
  bad_cols <- names(x)[vapply(x, bad_atomic, logical(1L))]
  if (length(bad_cols))
    stop("These columns cannot be used as atomic measures or categorical filters: ",
         paste(bad_cols, collapse = ", "), call. = FALSE)

  key_cols <- c(time_col, categorical_cols)
  if (data.table::uniqueN(x, by = key_cols) != nrow(x)) {
    duplicates <- x[duplicated(x, by = key_cols) |
                      duplicated(x, by = key_cols, fromLast = TRUE), key_cols,
                    with = FALSE] %>% unique(by = key_cols)
    stop(
      "The input data.table is not uniquely identified by the time column plus all categorical columns.\n",
      "Key columns: ", paste(key_cols, collapse = ", "), ".\nFound ",
      nrow(duplicates), " duplicated key combination(s). Examples:\n",
      duplicates %>% utils::head(8L) %>% print() %>%
        utils::capture.output() %>% paste(collapse = "\n"),
      "\nResolve these duplicates before creating the app; coincident rows are not aggregated.",
      call. = FALSE
    )
  }

  time_values <- as.character(x[[time_col]])
  time_values[is.na(x[[time_col]])] <- NA_character_
  time_labels <- .ts_order_time_levels(x[[time_col]])
  if (!length(time_labels))
    stop("The time column has no non-missing values.", call. = FALSE)
  distinct_time <- unique(x[[time_col]][!is.na(x[[time_col]])])
  if (anyDuplicated(as.character(distinct_time)))
    stop("Distinct time values have identical display labels. Format the time column ",
         "explicitly as character with sufficient numeric or subsecond precision.",
         call. = FALSE)
  time_ids <- match(time_values, time_labels) - 1L

  dimensions <- lapply(categorical_cols, function(nm) {
    z <- x[[nm]]
    distinct <- unique(z)
    distinct_labels <- as.character(distinct)
    distinct_labels[is.na(distinct)] <- NA_character_
    if (anyDuplicated(distinct_labels))
      stop("Distinct categorical values in '", nm,
           "' have identical character labels or missing representations. ",
           "Format this column explicitly as character with sufficient precision ",
           "and distinct labels for values that should remain separate.", call. = FALSE)
    values <- as.character(z)
    values[is.na(z)] <- NA_character_
    observed <- unique(values[!is.na(values)])
    if (is.factor(z)) {
      lev <- levels(droplevels(z))
      observed <- c(lev[lev %in% observed], observed[!observed %in% lev])
    } else if (is.logical(z)) {
      observed <- intersect(c("FALSE", "TRUE"), observed)
    } else {
      observed <- sort(observed, method = "radix")
    }
    if (anyNA(values)) observed <- c(observed, NA_character_)
    labels <- observed
    labels[is.na(labels)] <- "(Missing)"
    labels[labels == ""] <- "(Blank)"
    list(
      name = nm, values = I(unname(values)),
      codes = I(match(values, observed) - 1L),
      choices = lapply(seq_along(observed), function(i)
        list(id = i - 1L, label = labels[[i]], value = observed[[i]]))
    )
  })

  if (length(categorical_cols)) {
    # frankv looks up column names literally. Joins with `on = character()`
    # would instead parse operators embedded in non-syntactic column names.
    ranks <- data.table::frankv(x, cols = categorical_cols,
                               ties.method = "dense", na.last = FALSE)
    series_ids <- match(ranks, unique(ranks)) - 1L
    meta <- x[!duplicated(series_ids), categorical_cols, with = FALSE]
    parts <- lapply(categorical_cols, function(nm) {
      values <- as.character(meta[[nm]])
      values[is.na(meta[[nm]])] <- NA_character_
      values[is.na(values)] <- "(Missing)"
      values[values == ""] <- "(Blank)"
      paste0(nm, " = ", values)
    })
    series_labels <- do.call(paste, c(parts, sep = " | "))
  } else {
    series_ids <- rep.int(0L, nrow(x))
    series_labels <- "Series"
  }

  measures <- lapply(numeric_cols, function(nm)
    list(name = nm, values = .ts_measure_values(x[[nm]])))
  columns <- lapply(names(x), function(nm) {
    kind <- if (identical(nm, time_col)) "time" else
      if (nm %in% categorical_cols) "dimension" else "measure"
    list(name = nm, kind = kind, index = switch(kind, time = 0L,
      dimension = match(nm, categorical_cols) - 1L,
      measure = match(nm, numeric_cols) - 1L))
  })

  # Serialize the untouched original object, not a coerced display copy.
  rds_path <- tempfile("tsHtmlApp-data-", fileext = ".rds")
  on.exit(unlink(rds_path), add = TRUE)
  saveRDS(dt, rds_path, compress = compress)
  original_base64 <- readBin(rds_path, "raw", n = file.info(rds_path)$size) %>%
    jsonlite::base64_enc()

  list(
    schemaVersion = 1L, title = title, cascading = cascading,
    rowCount = nrow(x), missingTimeRows = sum(is.na(time_ids)),
    time = list(name = time_col, labels = I(unname(time_labels)),
                values = I(unname(time_values)), ids = I(time_ids)),
    dimensions = dimensions, measures = measures,
    series = list(ids = I(as.integer(series_ids)), labels = I(unname(series_labels))),
    columns = columns, original = list(filename = data_file, base64 = original_base64)
  )
}

.ts_measure_values <- function(x) {
  x <- as.numeric(x)
  if (!any(is.infinite(x) | is.nan(x))) return(I(unname(x)))
  lapply(x, function(v) {
    if (is.nan(v)) return("NaN")
    if (is.na(v)) return(NULL)
    if (is.infinite(v)) return(if (v > 0) "Inf" else "-Inf")
    v
  })
}

.ts_script_json <- function(payload) {
  . <- NULL # magrittr placeholder; keeps static R code checks unambiguous.
  payload %>% jsonlite::toJSON(auto_unbox = TRUE, na = "null", null = "null",
                              digits = NA, pretty = FALSE) %>% as.character() %>%
    Reduce(function(s, pair) gsub(pair[[1L]], pair[[2L]], s, fixed = TRUE),
           list(c("&", "\\u0026"), c("<", "\\u003c"), c(">", "\\u003e"),
                c("\u2028", "\\u2028"), c("\u2029", "\\u2029")), init = .)
}

.ts_html_escape <- function(x) {
  Reduce(function(s, pair) gsub(pair[[1L]], pair[[2L]], s, fixed = TRUE),
         list(c("&", "&amp;"), c("<", "&lt;"), c(">", "&gt;"),
              c('"', "&quot;"), c("'", "&#39;")), init = enc2utf8(x))
}

.ts_inline_script <- function(x) {
  # Escape HTML raw-text end tags without changing valid JavaScript strings.
  matches <- gregexpr("</script", x, ignore.case = TRUE)[[1L]]
  if (matches[[1L]] < 0L) return(x)
  starts <- c(1L, matches + 2L)
  ends <- c(matches, nchar(x))
  paste0(vapply(seq_along(starts), function(i) {
    piece <- substr(x, starts[[i]], ends[[i]])
    if (i < length(starts)) paste0(piece, "\\/") else piece
  }, ""), collapse = "")
}

.ts_asset <- function(...) {
  path <- system.file(..., package = "tsHtmlApp", mustWork = TRUE)
  paste(readLines(path, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}

.ts_fill_template <- function(template, replacements) {
  # Scan the original template exactly once; user text cannot create new tokens.
  matches <- gregexpr("@@[A-Z]+@@", template, perl = TRUE)[[1L]]
  if (matches[[1L]] < 0L) return(template)
  lens <- attr(matches, "match.length")
  starts <- c(1L, matches + lens)
  ends <- c(matches - 1L, nchar(template))
  pieces <- lapply(seq_along(starts), function(i) {
    before <- if (starts[[i]] > ends[[i]]) "" else
      substr(template, starts[[i]], ends[[i]])
    if (i > length(matches)) return(before)
    token <- substr(template, matches[[i]] + 2L, matches[[i]] + lens[[i]] - 3L)
    value <- replacements[[token]]
    if (is.null(value)) stop("Unknown HTML template token: ", token, call. = FALSE)
    paste0(before, value)
  })
  paste0(pieces, collapse = "")
}

.ts_write_html <- function(html, path, overwrite) {
  tmp <- tempfile(".tsHtmlApp-", tmpdir = dirname(path), fileext = ".html")
  on.exit(unlink(tmp), add = TRUE)
  writeBin(charToRaw(enc2utf8(html)), tmp)
  if (file.exists(path)) {
    if (!overwrite)
      stop("Refusing to overwrite existing file: ", path, call. = FALSE)
    if (dir.exists(path)) stop("Output path is a directory: ", path, call. = FALSE)
    backup <- tempfile(".tsHtmlApp-backup-", tmpdir = dirname(path))
    if (!file.rename(path, backup))
      stop("Could not prepare existing output for replacement: ", path, call. = FALSE)
    if (!file.rename(tmp, path)) {
      restored <- file.rename(backup, path)
      stop("Could not replace HTML output. ",
           if (restored) "The previous output was restored." else
             paste0("The previous output is preserved at: ", backup), call. = FALSE)
    }
    unlink(backup)
  } else if (!file.rename(tmp, path)) {
    stop("Could not write HTML output: ", path, call. = FALSE)
  }
  invisible(path)
}
