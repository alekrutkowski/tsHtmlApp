# Synthetic example; this is not observed economic data.
library(data.table)
library(magrittr)
library(tsHtmlApp)

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
