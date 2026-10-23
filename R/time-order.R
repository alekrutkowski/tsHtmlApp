# Copyright (c) 2026 Alek Rutkowski. MIT license.
# Adapted from tsShinyApp time ordering; preserves its recognised formats.

.ts_order_time_levels <- function(x) {
  x_chr <- as.character(x)
  x_chr[is.na(x)] <- NA_character_
  u <- unique(x_chr[!is.na(x_chr)])
  if (!length(u)) return(character())

  if (is.ordered(x)) {
    lev <- levels(x)
    return(c(lev[lev %in% u], u[!u %in% lev]))
  }

  if (inherits(x, "Date")) {
    key <- as.numeric(as.Date(u))
    return(u[order(key, method = "radix")])
  }

  if (inherits(x, c("POSIXct", "POSIXlt"))) {
    src <- match(u, x_chr)
    key <- as.numeric(as.POSIXct(x[src]))
    return(u[order(key, method = "radix")])
  }

  if (is.numeric(x)) {
    src <- match(u, x_chr)
    key <- as.numeric(x[src])
    return(u[order(key, method = "radix")])
  }

  s <- trimws(u)
  numeric_key <- suppressWarnings(as.numeric(s))
  if (all(is.finite(numeric_key)))
    return(u[order(numeric_key, s, method = "radix")])

  iso_date <- grepl("^[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}$", s)
  if (all(iso_date)) {
    date_key <- suppressWarnings(tryCatch(
      as.Date(gsub("[/.]", "-", s)),
      error = function(e) rep(as.Date(NA), length(s))
    ))
    if (!anyNA(date_key))
      return(u[order(date_key, method = "radix")])
  }

  z <- toupper(gsub("[[:space:]_./-]", "", s))
  key <- rep(NA_real_, length(z))

  annual <- grepl("^(FY)?[12][0-9]{3}$", z)
  key[annual] <- suppressWarnings(as.numeric(sub("^FY", "", z[annual])))

  yq <- grepl("^[12][0-9]{3}Q[1-4]$", z)
  if (any(yq)) {
    key[yq] <- as.numeric(substr(z[yq], 1L, 4L)) +
      (as.numeric(substr(z[yq], 6L, 6L)) - 1) / 4
  }

  qy <- grepl("^Q[1-4][12][0-9]{3}$", z)
  if (any(qy)) {
    key[qy] <- as.numeric(substr(z[qy], 3L, 6L)) +
      (as.numeric(substr(z[qy], 2L, 2L)) - 1) / 4
  }

  yh <- grepl("^[12][0-9]{3}H[12]$", z)
  if (any(yh)) {
    key[yh] <- as.numeric(substr(z[yh], 1L, 4L)) +
      (as.numeric(substr(z[yh], 6L, 6L)) - 1) / 2
  }

  hy <- grepl("^H[12][12][0-9]{3}$", z)
  if (any(hy)) {
    key[hy] <- as.numeric(substr(z[hy], 3L, 6L)) +
      (as.numeric(substr(z[hy], 2L, 2L)) - 1) / 2
  }

  ym <- grepl("^[12][0-9]{3}M(0?[1-9]|1[0-2])$", z)
  if (any(ym)) {
    yr <- as.numeric(substr(z[ym], 1L, 4L))
    mo <- as.numeric(sub("^[12][0-9]{3}M", "", z[ym]))
    key[ym] <- yr + (mo - 1) / 12
  }

  compact_ym <- grepl("^[12][0-9]{3}(0[1-9]|1[0-2])$", z)
  if (any(compact_ym)) {
    yr <- as.numeric(substr(z[compact_ym], 1L, 4L))
    mo <- as.numeric(substr(z[compact_ym], 5L, 6L))
    key[compact_ym] <- yr + (mo - 1) / 12
  }

  yw <- grepl("^[12][0-9]{3}W(0?[1-9]|[1-4][0-9]|5[0-3])$", z)
  if (any(yw)) {
    yr <- as.numeric(substr(z[yw], 1L, 4L))
    wk <- as.numeric(sub("^[12][0-9]{3}W", "", z[yw]))
    key[yw] <- yr + (wk - 1) / 53
  }

  month_keys <- c(
    JAN = 1, FEB = 2, MAR = 3, APR = 4, MAY = 5, JUN = 6,
    JUL = 7, AUG = 8, SEP = 9, OCT = 10, NOV = 11, DEC = 12,
    JANUARY = 1, FEBRUARY = 2, MARCH = 3, APRIL = 4, JUNE = 6,
    JULY = 7, AUGUST = 8, SEPTEMBER = 9, OCTOBER = 10,
    NOVEMBER = 11, DECEMBER = 12
  )

  ymon <- grepl("^[12][0-9]{3}[A-Z]+$", z)
  if (any(ymon)) {
    yr <- as.numeric(substr(z[ymon], 1L, 4L))
    mn <- substr(z[ymon], 5L, nchar(z[ymon]))
    mo <- unname(month_keys[mn])
    ok <- !is.na(mo)
    idx <- which(ymon)[ok]
    key[idx] <- yr[ok] + (mo[ok] - 1) / 12
  }

  mony <- grepl("^[A-Z]+[12][0-9]{3}$", z)
  if (any(mony)) {
    yr <- as.numeric(substr(z[mony], nchar(z[mony]) - 3L, nchar(z[mony])))
    mn <- substr(z[mony], 1L, nchar(z[mony]) - 4L)
    mo <- unname(month_keys[mn])
    ok <- !is.na(mo)
    idx <- which(mony)[ok]
    key[idx] <- yr[ok] + (mo[ok] - 1) / 12
  }

  if (all(is.finite(key)))
    return(u[order(key, s, method = "radix")])

  u[order(tolower(u), u, method = "radix")]
}

