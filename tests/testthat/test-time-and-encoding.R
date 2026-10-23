test_that("time ordering preserves supported native classes and period formats", {
  order_time <- tsHtmlApp:::.ts_order_time_levels
  expect_identical(order_time(c(10, 2, 1)), c("1", "2", "10"))
  expect_identical(order_time(c("10", "2", "1")), c("1", "2", "10"))
  expect_identical(order_time(ordered(c("B", "A"), levels = c("B", "A"))), c("B", "A"))
  expect_identical(order_time(as.Date(c("2024-02-01", "2024-01-01"))), c("2024-01-01", "2024-02-01"))
  stamp <- as.POSIXct(c("2024-02-01 12:00:00", "2024-01-01 12:00:00"), tz = "UTC")
  expect_identical(order_time(stamp), as.character(stamp[2:1]))
  examples <- list(
    c("2024-Q4", "2024-Q1", "2023-Q4"),
    c("Q4-2024", "Q1-2024", "Q4-2023"),
    c("2024-H2", "2024-H1", "2023-H2"),
    c("2024-M12", "2024-M01", "2023-M12"),
    c("202412", "202401", "202312"),
    c("2024-W52", "2024-W01", "2023-W52"),
    c("2024 Dec", "2024 Jan", "2023 Dec"),
    c("Dec 2024", "Jan 2024", "Dec 2023"),
    c("FY2024", "FY2023", "FY2022")
  )
  invisible(lapply(examples, function(values) expect_identical(order_time(values), values[3:1])))
  expect_identical(order_time(c("2024/12/01", "2024/02/01")), c("2024/02/01", "2024/12/01"))
  expect_identical(order_time(c("zeta", "Beta", "alpha")), c("alpha", "Beta", "zeta"))
})

test_that("missing labels and nonfinite numeric values survive JSON accurately", {
  dt <- data.table::data.table(
    time = c("2024", "2025", "2026", "2027", "2028", NA_character_),
    group = c(NA_character_, "", "(Missing)", "(Blank)", "x", "x"),
    value = c(NA_real_, NaN, Inf, -Inf, 3.141592653589793, 0)
  )
  out <- tempfile("tsHtmlApp-")
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  info <- write_ts_html_app(dt, out)
  payload <- read_html_payload(info$app)
  expect_equal(payload$missingTimeRows, 1)
  expect_null(payload$time$ids[[6L]])
  expect_null(payload$measures[[1L]]$values[[1L]])
  expect_identical(payload$measures[[1L]]$values[[2L]], "NaN")
  expect_identical(payload$measures[[1L]]$values[[3L]], "Inf")
  expect_identical(payload$measures[[1L]]$values[[4L]], "-Inf")
  expect_equal(payload$measures[[1L]]$values[[5L]], pi, tolerance = 1e-15)
  codes <- unlist(payload$dimensions[[1L]]$codes)
  expect_equal(length(unique(codes[1:4])), 4L)
  expect_null(payload$dimensions[[1L]]$values[[1L]])
  expect_identical(payload$dimensions[[1L]]$values[[2L]], "")
})

test_that("factor and logical category order matches the source interface", {
  dt <- data.table::data.table(
    time = as.character(2021:2024),
    group = factor(c("A", "B", NA, "A"), levels = c("B", "unused", "A")),
    flag = c(TRUE, FALSE, NA, TRUE),
    value = 1:4
  )
  out <- tempfile("tsHtmlApp-")
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  info <- write_ts_html_app(dt, out, cascading = TRUE)
  payload <- read_html_payload(info$app)
  expect_true(payload$cascading)
  expect_identical(vapply(payload$dimensions[[1L]]$choices, `[[`, "", "label"), c("B", "A", "(Missing)"))
  expect_identical(vapply(payload$dimensions[[2L]]$choices, `[[`, "", "label"), c("FALSE", "TRUE", "(Missing)"))
})

test_that("NaN and NA times are both excluded from time ordering", {
  dt <- data.table::data.table(time = c(1, NaN, NA_real_), group = c("A", "B", "C"), value = 1:3)
  out <- tempfile("tsHtmlApp-")
  on.exit(unlink(out, recursive = TRUE), add = TRUE)
  info <- write_ts_html_app(dt, out)
  payload <- read_html_payload(info$app)
  expect_identical(payload$time$labels, list("1"))
  expect_equal(payload$missingTimeRows, 2)
  expect_null(payload$time$ids[[2L]])
  expect_null(payload$time$ids[[3L]])
})
