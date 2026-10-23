# Generate browser regression fixtures with the installed package.
# Rscript tests/browser/make-fixtures.R browser-fixtures
library(data.table)
library(magrittr)
library(tsHtmlApp)

args <- commandArgs(trailingOnly = TRUE)
destination <- if (length(args)) args[[1L]] else "browser-fixtures"

system.file("extdata", "synthetic_regional_workforce_quarterly.csv",
            package = "tsHtmlApp", mustWork = TRUE) %>%
  fread() %>%
  write_ts_html_app(out_dir = destination,
                    app_file = "workforce-explorer.html",
                    title = "Regional workforce | Synthetic data",
                    cascading = TRUE, overwrite = TRUE)

data.table(time = seq_len(6001L)) %>%
  .[, value := sin(time / 100)] %>%
  .[1L, value := 0] %>%
  .[100L, value := NA_real_] %>%
  write_ts_html_app(out_dir = destination, app_file = "single-series.html",
                    title = "Single series WebGL fixture", overwrite = TRUE)

attack <- paste0(
  '</script><script>window.__injected=1</script>',
  '<img src=x onerror="window.__injected=1"> & @@APP@@ "quoted" ',
  "'single' ", "\u00e9\u4e2d"
)
data.table(group = rep(c(attack, "Safe"), each = 2L),
           time_period = rep(c("2024", attack), 2L), value = 1:4) %>%
  setnames(c("group", "value"), c(paste0("Category ", attack),
                                  paste0("Metric ", attack))) %>%
  write_ts_html_app(out_dir = destination, app_file = "security.html",
                    title = paste0("Security fixture ", attack), overwrite = TRUE)
