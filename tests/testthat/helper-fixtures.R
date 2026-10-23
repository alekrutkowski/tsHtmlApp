make_ts_dt <- function() {
  data.table::data.table(
    country = rep(c("A", "B"), each = 3L),
    region = rep(c("North", "South"), each = 3L),
    time_period = rep(c("2024-Q1", "2024-Q2", "2024-Q3"), 2L),
    value = c(10, 20, 30, 25, 50, 75),
    rate = c(1, 2, 3, 5, 10, 15)
  )
}

read_html_payload <- function(path) {
  html <- paste(readLines(path, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
  match <- regexec(
    '(?s)<script\\b[^>]*\\bid="tsapp-data"[^>]*>(.*?)</script\\s*>',
    html, perl = TRUE
  )
  extracted <- regmatches(html, match)[[1L]]
  if (length(extracted) != 2L) stop("Cannot find the embedded app payload.")
  jsonlite::fromJSON(extracted[[2L]], simplifyVector = FALSE)
}

payload_for <- function(dt, cascading = FALSE, compress = "gzip") {
  tsHtmlApp:::.ts_payload(dt, "Test", cascading, "data.rds", compress)
}
