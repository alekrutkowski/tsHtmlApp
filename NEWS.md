# tsHtmlApp 0.1.0

* Introduces `write_ts_html_app()` with the eight argument names and order
  of `tsShinyApp::write_ts_shiny_app()`.
* Produces one HTML file containing the application, Plotly.js, data and
  an original RDS download. The browser application works offline.
* Preserves categorical filtering, optional cascading choices, time ordering,
  time windows, index rebasing, point markers and the 10-series display cap.
* Adds CSV exports and an embedded original-data download, while retaining
  resizable chart cards, full-screen viewing, zoom and comparison hover.
* Includes the original synthetic regional-workforce example data, R and
  JavaScript regression tests, and GitHub check/release workflows.
