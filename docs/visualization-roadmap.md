# Data visualization roadmap

## Decision

Lumen should add a small, accessible 2D chart grammar rather than a large charting or statistics
engine. Observatory should consume those primitives after they ship, while its API and data helpers
continue to own collection, aggregation, sampling, binning, and domain-specific calculations.

The next Lumen release should prioritize:

1. `Chart` foundations and shared chart tokens
2. `Sparkline`
3. `BarChart`
4. `LineChart`
5. `ScatterPlot`
6. `Histogram`
7. `Heatmap`
8. `BoxPlot`

The first four items solve Observatory's current duplication. The complete set covers the most
reusable Python, data-science, and machine-learning graphics without making Lumen responsible for
numerical analysis.

## What Observatory needs

### Current data

Observatory already exposes four kinds of information:

- Point-in-time metrics: downloads, views, clones, issues, stars, response time, and project counts
- Time series: downloads, views, issues, stars, page views, and visits across 30-day, one-year, and
  five-year ranges
- Categorical comparisons: projects by downloads, status, category, health, and visibility
- Operational exceptions: degraded health, stale pushes, and open-issue attention signals

The web app currently implements three charts itself inside Lumen's presentational `Chart` wrapper:

- A ranked horizontal download comparison built from repeated `Progress` components
- A vertical bar history for rolling download velocity
- A grouped vertical bar history for page views and visits

This requires the pages to calculate maxima and sample points, manually emit bars and accessible
labels, and maintain chart-specific layout, legend, series-color, overflow, and responsive CSS.
The current `Chart` contract only provides a styled `<figure>` and leaves the entire visualization
to the consumer.

### Planned private data

The private-project specification adds signals that broaden the chart requirements:

| Planned signal                                                   | Best default graphic                       | Why                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Lead time, review latency, CPU time                              | Histogram and box plot                     | Show shape, median, spread, and outliers instead of only an average |
| Failure and error rates                                          | Line chart with threshold/reference line   | Make regressions and SLO breaches visible over time                 |
| Actions minutes, Worker requests, D1 operations, bandwidth, cost | Line/area chart plus sparkline             | Show trend and compact status together                              |
| Release and deployment frequency                                 | Bar chart or event markers on a line chart | Compare discrete periods and preserve chronology                    |
| Pull-request or issue states                                     | Stacked bar chart                          | Compare composition without losing totals                           |
| Revenue, active users, support load, waitlists                   | Line and bar charts                        | Cover product trend and category comparison                         |
| Retention                                                        | Heatmap/cohort matrix                      | Show how a cohort changes across periods                            |

These needs do not justify domain-specific Lumen components. They justify reusable encodings,
reference marks, legends, and accessible data fallbacks.

## Python, data-science, and machine-learning coverage

The broad Python plotting ecosystem repeatedly centers on the same visual families:

- Relationships: line and scatter plots
- Categorical comparisons: bars
- Distributions: histograms, box plots, violin plots, and empirical cumulative distributions
- Gridded values: images, heatmaps, and contours
- Composition: grouped, stacked, faceted, or layered versions of those graphics

Matplotlib's official plot taxonomy organizes graphics around pairwise data, statistical
distributions, gridded data, irregular grids, and 3D data. Seaborn similarly emphasizes relational,
distributional, and categorical views. Plotly's core 2D traces use the same building blocks.

Machine-learning evaluation is mostly composition rather than a separate rendering problem:

| ML question                             | Lumen composition                                           |
| --------------------------------------- | ----------------------------------------------------------- |
| Training/validation loss or score       | Multi-series `LineChart`, optionally with uncertainty bands |
| Learning or validation curve            | `LineChart` with bands/error bars                           |
| ROC, precision-recall, DET, calibration | `LineChart` with a reference line                           |
| Confusion matrix                        | `Heatmap` with cell labels and categorical axes             |
| Prediction error or residuals           | `ScatterPlot` with a reference line                         |
| Feature importance                      | Ranked horizontal `BarChart`                                |
| Target, score, or residual distribution | `Histogram` or `BoxPlot`                                    |
| Feature correlation                     | Diverging `Heatmap`                                         |
| Cluster or embedding inspection         | `ScatterPlot` with categorical series                       |

Lumen should document these as recipes after the underlying primitives exist. It should not add
`RocCurve`, `ConfusionMatrix`, or `FeatureImportanceChart` components in the first release because
they would duplicate the same line, heatmap, and bar rendering contracts.

## Proposed Lumen API layers

### Layer 1: chart foundation

Evolve `Chart` without making it compute statistics:

- Standard slots/children for title, description, value, actions, plot, legend, and caption
- Shared responsive plot area, axes, grid, legend, series, reference-line, and annotation styles
- Semantic chart tokens for categorical series and sequential/diverging scales in light and dark
  themes
- A visible data-table fallback or an off-screen equivalent that can be revealed
- Explicit empty, loading, error, and insufficient-data states
- Reduced-motion behavior and no animation required for comprehension
- Color plus a second cue such as line dash, marker shape, label, or pattern
- Consumer-provided value formatting and accessible summaries

The base component should keep accepting custom SVG or canvas children so it remains useful for
specialized plots.

### Layer 2: high-value plots

#### `Sparkline` — P0

A compact line or area trend for metric cards.

- Inputs: ordered `x/y` points or plain numeric values
- Options: line/area, positive/negative/neutral tone, endpoint, min/max, reference value
- Accessibility: concise trend label and stable text value; decorative mode only when adjacent text
  already communicates the same result

Use in Observatory for downloads, traffic, response time, errors, and cost metric cards.

#### `BarChart` — P0

Categorical comparison and discrete time buckets.

- Orientations: horizontal and vertical
- Layouts: single, grouped, stacked, and normalized stacked
- Options: labels, values, sorted input, zero baseline, reference line
- Accessibility: data table or ordered text equivalent; do not communicate series by color alone

This replaces all three of Observatory's current hand-built bar families, although long continuous
time series should migrate to `LineChart`.

#### `LineChart` — P0

Continuous trends and model curves.

- Multiple series, missing-point gaps, markers, stepped lines, optional area fill
- Reference lines/ranges and uncertainty bands
- Time, linear, and categorical axes supplied as already-normalized values
- Shared crosshair/tooltip behavior only as progressive enhancement; the chart remains readable
  without pointer interaction

Use in Observatory for portfolio history, website traffic, rates, latency, usage, cost, and product
outcomes. It also covers learning, ROC, precision-recall, calibration, and training curves.

#### `ScatterPlot` — P1

Relationships, clusters, embeddings, and residuals.

- Multiple series, marker shape, size, opacity, and optional reference/regression line
- Keyboard or list/table access to points when points are interactive
- A density strategy should be documented for large datasets rather than rendering unlimited DOM
  nodes

#### `Histogram` — P1

Distribution shape for latency, lead time, review time, and ML residuals.

- Accept pre-binned data in every framework
- Optional JavaScript binning helper in `@santi020k/lumen-core`, kept separate from rendering
- Counts, density, cumulative mode, and optional comparison series

#### `Heatmap` — P1

Matrix data with sequential or diverging color scales.

- Categorical or numeric axes, optional cell values, legend/color scale, and selected-cell state
- Always provide a tabular equivalent because color and dense cells are not sufficient
- Recipes: confusion matrix, correlation matrix, calendar activity, and cohort retention

#### `BoxPlot` — P2

Compact distribution comparison using consumer-supplied five-number summaries and outliers.

- Horizontal and vertical orientations
- Single or grouped categories
- Optional core helper to calculate summaries, but no calculation in the view component

It is more important than a violin plot for an initial design-system release because its data
contract is smaller, it remains legible at dashboard sizes, and it does not require kernel-density
estimation.

## Shared contracts

The public contract should use the same conceptual data model across Astro, React, and Elements:

```ts
interface ChartDatum {
  label?: string
  x: number | string | Date
  y: number | null
}

interface ChartSeries {
  id: string
  label: string
  data: readonly ChartDatum[]
  tone?: 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral'
}
```

Framework adapters may expose data differently:

- Astro and React can accept typed arrays directly.
- Web Components should support declarative child marks or a documented JSON property assignment,
  not a large JSON attribute.
- Core can own deterministic scale, tick, path, stacking, and binning helpers.
- Rendering stays SVG-first for accessibility, theming, SSR, and zero heavy chart-runtime
  dependency. Canvas is an escape hatch for high-density custom plots.

The exact API should be prototyped against Observatory before becoming public. In particular,
dates, missing values, stacked-domain behavior, formatter functions, and server-rendered IDs need
cross-framework conformance tests.

## Token additions

The current semantic palette is designed for interface state, not arbitrary data series. Reusing
`success`, `warning`, and `danger` as ordinary category colors would blur their meaning.

Add dedicated data-visualization tokens:

- Six to eight categorical series colors, each tested against both chart surfaces
- Sequential scales for brand and neutral data
- A diverging scale with a meaningful midpoint
- Grid, axis, tick, annotation, and selection tokens
- Optional pattern/dash/marker assignments paired with categorical colors

Status tokens remain reserved for semantic state. Sequential and diverging ramps should have
documented contrast limits; not every cell color can safely carry text.

## Accessibility requirements

Every plot should satisfy the following before release:

- Visible title or an accessible name
- Text summary stating the main takeaway when the author can provide one
- Table/list fallback for values
- Color-independent series identification
- Focusable interactive points with predictable arrow-key navigation, or non-interactive marks
  with an accessible equivalent
- Tooltips available on focus as well as hover, dismissible with Escape, and never the only source
  of a value
- No mandatory animation; reduced motion disables path drawing and bar transitions
- Horizontal scrolling or label reduction that does not silently drop data on small screens
- Tests in light, dark, forced-colors, zoomed, keyboard-only, and reduced-motion modes

For very dense charts, the accessible table should be paginated or summarized instead of adding
thousands of focus stops.

## Delivery plan

### Lumen release A: Observatory essentials

1. Define chart data types, tokens, scale/path helpers, and accessibility contract in core.
2. Evolve `Chart` while preserving its current custom-child API.
3. Ship `Sparkline`, `BarChart`, and `LineChart` across Astro, React, and Elements.
4. Add docs examples for analytics cards, grouped traffic, stacked states, threshold rates, and
   multi-series history.
5. Add the chart catalog/registry entries, MCP metadata, visual regressions, accessibility checks,
   cross-framework conformance, and a changeset.

### Lumen release B: analysis and ML

1. Ship `ScatterPlot`, `Histogram`, and `Heatmap`.
2. Add recipes for confusion matrices, correlation matrices, residual plots, feature importance,
   ROC/precision-recall/calibration curves, and learning curves.
3. Add `BoxPlot` after validating the summary/outlier contract.

### Observatory adoption

After release A:

1. Upgrade `@santi020k/lumen-astro`.
2. Replace the ranked `Progress` composition with a horizontal `BarChart`.
3. Replace grouped website bars with a multi-series `LineChart` for continuous time.
4. Replace download-history bars with `LineChart`; preserve rolling-window wording.
5. Add `Sparkline` to high-value metric cards only when there are at least two valid samples.
6. Delete superseded chart CSS and local max/geometry calculations.
7. Keep website bucket aggregation and API contracts in Observatory.

After release B, use histograms/box plots for operational latency and heatmaps for retention or
future ML evaluation. No Observatory schema change is needed merely to adopt the rendering
components.

## Explicitly defer

Do not prioritize these for the next release:

- Pie and donut charts: limited comparison accuracy and no current Observatory requirement
- Gauge/speedometer charts: a `Stat`, `Meter`, sparkline, or bullet-style bar communicates the same
  information more compactly
- Radar charts: difficult comparison and no current product need
- Sankey, network, geographic, 3D, contour, and volumetric plots: valuable specialist graphics but
  poor design-system primitives for the current roadmap
- Violin, KDE, hexbin, and pair-plot components: add only after the simpler distribution and
  relationship primitives are stable
- A built-in dataframe, statistics engine, or Python bridge: outside Lumen's UI responsibility
- A bundled heavy charting dependency: unnecessary for the targeted SVG-first scope

## Evidence used

- Observatory contracts: `packages/api-types/src/index.ts`
- Observatory aggregation: `apps/api/src/lib/dashboard.ts`
- Current charts: `apps/web/src/pages/dashboard.astro` and
  `apps/web/src/pages/projects/[slug].astro`
- Current chart CSS: `apps/web/src/styles/global.css`
- Planned private metrics: `docs/private-projects.md`
- Lumen 0.3.0 catalog and `Chart` usage contract from the connected Lumen MCP snapshot
- [Matplotlib plot types](https://matplotlib.org/stable/plot_types/index.html)
- [Seaborn relational plots](https://seaborn.pydata.org/tutorial/relational.html)
- [Seaborn categorical plots](https://seaborn.pydata.org/tutorial/categorical.html)
- [Seaborn plotting-function overview](https://seaborn.pydata.org/tutorial/function_overview.html)
- [Plotly figure data structure](https://plotly.com/python/figure-structure/)
- [scikit-learn metric displays](https://scikit-learn.org/stable/api/sklearn.metrics.html)
- [scikit-learn learning curves](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.LearningCurveDisplay.html)
- [scikit-learn calibration](https://scikit-learn.org/stable/modules/calibration.html)
