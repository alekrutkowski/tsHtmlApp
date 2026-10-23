test_that("the public API has exactly the requested argument names and order", {
  expect_identical(getNamespaceExports("tsHtmlApp"), "write_ts_html_app")
  expect_identical(
    names(formals(write_ts_html_app)),
    c("dt", "out_dir", "app_file", "data_file", "title", "cascading", "overwrite", "compress")
  )
  expect_identical(formals(write_ts_html_app)$app_file, "index.html")
  expect_identical(formals(write_ts_html_app)$out_dir, "html-ts-app")
  expect_false(formals(write_ts_html_app)$cascading)
  expect_false(formals(write_ts_html_app)$overwrite)
})

test_that("generation writes one HTML file with real embedded original data", {
  dt <- make_ts_dt()
  before <- data.table::copy(dt)
  out <- tempfile("tsHtmlApp-")
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  result <- withVisible(write_ts_html_app(dt, out_dir = out, data_file = "original.rds"))
  expect_false(result$visible)
  info <- result$value
  expect_identical(list.files(out), "index.html")
  expect_true(file.exists(info$app))
  expect_null(info$data)
  expect_true(info$embedded)
  expect_identical(info$time_column, "time_period")
  expect_identical(info$numeric_columns, c("value", "rate"))
  expect_identical(info$categorical_columns, c("country", "region"))
  expect_identical(dt, before)

  payload <- read_html_payload(info$app)
  expect_identical(payload$original$filename, "original.rds")
  expect_equal(payload$rowCount, 6)
  expect_equal(unlist(payload$time$ids), rep(0:2, 2L))
  rds_path <- tempfile(fileext = ".rds")
  on.exit(unlink(rds_path), add = TRUE)
  writeBin(jsonlite::base64_dec(payload$original$base64), rds_path)
  restored <- readRDS(rds_path)
  expect_equal(as.list(restored), as.list(dt))
  expect_identical(class(restored), class(dt))

  html <- paste(readLines(info$app, warn = FALSE), collapse = "\n")
  expect_false(grepl('<script[^>]+src\\s*=', html, ignore.case = TRUE))
  expect_false(grepl('<link[^>]+(?:stylesheet|https?://)', html, ignore.case = TRUE))
  expect_match(html, "Plotly", fixed = TRUE)
})

test_that("singleton vectors remain arrays in the JSON payload", {
  out <- tempfile("tsHtmlApp-")
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  info <- write_ts_html_app(data.table::data.table(time = "2024", group = "A", value = 1), out)
  payload <- read_html_payload(info$app)
  expect_type(payload$time$labels, "list")
  expect_length(payload$time$labels, 1L)
  expect_type(payload$time$ids, "list")
  expect_length(payload$dimensions, 1L)
  expect_type(payload$dimensions[[1L]]$codes, "list")
  expect_length(payload$dimensions[[1L]]$choices, 1L)
  expect_type(payload$measures[[1L]]$values, "list")
  expect_type(payload$series$labels, "list")
})

test_that("RDS download preserves R classes and compression compatibility", {
  dt <- data.table::data.table(
    time = as.Date(c("2024-01-01", "2024-02-01")),
    group = factor(c("A", NA), levels = c("B", "A"), ordered = TRUE),
    value = c(1, NA_real_)
  )
  invisible(lapply(list(FALSE, TRUE, "gzip", "bzip2", "xz"), function(compression) {
    out <- tempfile("tsHtmlApp-compress-")
    on.exit(unlink(out, recursive = TRUE), add = TRUE)
    info <- write_ts_html_app(dt, out_dir = out, compress = compression)
    payload <- read_html_payload(info$app)
    path <- tempfile(fileext = ".rds")
    on.exit(unlink(path), add = TRUE)
    writeBin(jsonlite::base64_dec(payload$original$base64), path)
    restored <- readRDS(path)
    expect_equal(as.list(restored), as.list(dt))
    expect_identical(levels(restored$group), c("B", "A"))
    expect_true(is.ordered(restored$group))
  }))
})

test_that("overwrite is explicit and only the requested HTML file is touched", {
  out <- tempfile("tsHtmlApp-")
  dir.create(out)
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  sentinel <- charToRaw("do not change this file")
  writeBin(sentinel, file.path(out, "data.rds"))
  first <- write_ts_html_app(make_ts_dt(), out)
  before <- readBin(first$app, "raw", n = file.info(first$app)$size)
  expect_error(write_ts_html_app(make_ts_dt(), out), "[Oo]verwrite|existing")
  expect_identical(readBin(first$app, "raw", n = file.info(first$app)$size), before)
  write_ts_html_app(make_ts_dt(), out, title = "Changed", overwrite = TRUE)
  expect_identical(read_html_payload(first$app)$title, "Changed")
  expect_identical(readBin(file.path(out, "data.rds"), "raw", n = 100L), sentinel)
})

test_that("data.table and unique series-time keys are required", {
  expect_error(write_ts_html_app(as.data.frame(make_ts_dt()), tempfile()), "data.table")
  expect_error(write_ts_html_app(make_ts_dt()[0L], tempfile()), "rows")
  duplicate <- data.table::rbindlist(list(make_ts_dt(), make_ts_dt()[1L]))
  expect_error(write_ts_html_app(duplicate, tempfile()), "not uniquely identified")
  no_dimension <- data.table::data.table(time = c("2024", "2024"), value = c(1, 2))
  expect_error(write_ts_html_app(no_dimension, tempfile()), "not uniquely identified")
  repeated_names <- make_ts_dt()
  data.table::setnames(repeated_names, c("country", "region", "time", "value", "value"))
  expect_error(write_ts_html_app(repeated_names, tempfile()), "unique")
})

test_that("time recognition and numeric measure requirements are enforced", {
  expect_error(write_ts_html_app(data.table::data.table(year = 2024, value = 1), tempfile()), "time")
  expect_error(write_ts_html_app(data.table::data.table(time = 2024, TIME_PERIOD = 2024, value = 1), tempfile()), "[Mm]ore than one|exactly one")
  expect_error(write_ts_html_app(data.table::data.table(time = NA_character_, value = 1), tempfile()), "non-missing|usable")
  expect_error(write_ts_html_app(data.table::data.table(time = "2024", group = "A"), tempfile()), "numeric")
  out <- tempfile("tsHtmlApp-")
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  info <- write_ts_html_app(data.table::data.table(TIME_PERIOD = "2024", numeric_code = 1, value = 10), out)
  expect_identical(info$time_column, "TIME_PERIOD")
  expect_identical(info$numeric_columns, c("numeric_code", "value"))
  expect_length(info$categorical_columns, 0L)
})

test_that("invalid scalar options and path escapes are rejected", {
  dt <- make_ts_dt()
  expect_error(write_ts_html_app(dt, out_dir = NA_character_))
  expect_error(write_ts_html_app(dt, out_dir = c("a", "b")))
  expect_error(write_ts_html_app(dt, out_dir = ""))
  invisible(lapply(c("../escape.html", "dir/index.html", "dir\\index.html", "C:\\index.html", "app.R"), function(name) {
    expect_error(write_ts_html_app(dt, tempfile(), app_file = name))
  }))
  invisible(lapply(c("../escape.rds", "dir/file.rds", "dir\\file.rds"), function(name) {
    expect_error(write_ts_html_app(dt, tempfile(), data_file = name))
  }))
  invisible(lapply(list(NA, c(TRUE, FALSE), 1, "TRUE"), function(value) {
    expect_error(write_ts_html_app(dt, tempfile(), cascading = value))
    expect_error(write_ts_html_app(dt, tempfile(), overwrite = value))
  }))
  expect_error(write_ts_html_app(dt, tempfile(), title = NA_character_))
  expect_error(write_ts_html_app(dt, tempfile(), compress = "unknown"))
})

test_that("unsupported columns fail before an output artifact is created", {
  dt <- data.table::data.table(time = c("2024", "2025"), value = c(1, 2), bad = list(1, 2))
  out <- tempfile("tsHtmlApp-invalid-")
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  expect_error(write_ts_html_app(dt, out))
  expect_false(file.exists(file.path(out, "index.html")))
})

test_that("script-closing labels, literal tokens, Unicode and markup remain data", {
  marker <- '</script><img src=x onerror="globalThis.injected=true"> & @@CSS@@ \\1'
  dt <- data.table::data.table(time = c("2024", "2025"), group = c(marker, "\u00e9\u4e2d\u2028\u2029"), value = c(1, 2))
  original_group <- dt$group
  data.table::setnames(dt, c("group", "value"), c(paste0("Category ", marker), paste0("Metric ", marker)))
  title <- paste0(marker, " title")
  out <- tempfile("tsHtmlApp-")
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  info <- write_ts_html_app(dt, out, title = title)
  payload <- read_html_payload(info$app)
  expect_identical(payload$title, title)
  expect_identical(payload$dimensions[[1L]]$values[[1L]], marker)
  expect_identical(payload$dimensions[[1L]]$values[[2L]], original_group[[2L]])
  expect_identical(payload$dimensions[[1L]]$name, paste0("Category ", marker))
  expect_identical(payload$measures[[1L]]$name, paste0("Metric ", marker))
  html <- paste(readLines(info$app, warn = FALSE), collapse = "\n")
  expect_false(grepl('</script><img src=x onerror=', html, fixed = TRUE))
})

test_that("categorical display collisions require explicit conversion", {
  stamp <- as.POSIXct("2024-01-01 12:00:00", tz = "UTC") + c(1e-6, 1.2e-6)
  expect_identical(as.character(stamp)[[1L]], as.character(stamp)[[2L]])
  dt <- data.table::data.table(time = c("2024", "2025"), event = stamp, value = c(1, 2))
  expect_error(write_ts_html_app(dt, tempfile()), "Distinct categorical values")
  dt <- data.table::data.table(
    time = c("2024", "2025"),
    event = structure(c(NA_real_, NaN), class = "Date"),
    value = c(1, 2)
  )
  expect_error(write_ts_html_app(dt, tempfile()), "Distinct categorical values")
})
