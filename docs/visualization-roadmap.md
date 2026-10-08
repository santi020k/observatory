# Data visualization guide and roadmap

[Project overview](../README.md) · [Design guide](design-system.md) ·
[Private-project model](private-projects.md)

Observatory uses Lumen charts for common visualizations and keeps collection, normalization,
aggregation, and metric interpretation in its own API and data helpers. This replaces the early
proposal to add chart primitives to Lumen: the application already consumes `BarChart`,
`LineChart`, and `Sparkline`, and the current release adopts Lumen 4.

## Current compositions

| Question                                        | Current surface               | Rendering                                                                   |
| ----------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Which projects account for download activity?   | Portfolio dashboard           | Lumen `BarChart` with labeled categories.                                   |
| How are downloads and website traffic changing? | Dashboard and project detail  | Lumen `LineChart` with range and cadence context.                           |
| Is a metric moving enough to investigate?       | Metric cards and project rows | Lumen `Sparkline`, only with at least two observations.                     |
| How does current reach relate to momentum?      | Portfolio growth map          | Purpose-specific SVG inside Lumen `Chart`, with an accessible project list. |
| How is a published app performing?              | Store provider panels         | Lumen `LineChart` with provider-specific definitions and breakdowns.        |

`GrowthMap` retains its logarithmic reach calculation, momentum quadrants, product links, and
text equivalent in Observatory. Replace that composition with a general chart only when the
public component contract can preserve those behaviors without recreating them through private
implementation hooks.

## Ownership

| Lumen owns                                          | Observatory owns                                           |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Accessible chart markup, axes, marks, and legends.  | Provider collection and normalized API contracts.          |
| Responsive chart presentation and theme tokens.     | UTC bucket boundaries, reporting ranges, and aggregation.  |
| Supported pointer and keyboard interactions.        | Sampling, missing-data policy, and metric definitions.     |
| Reduced-motion behavior and reusable visual states. | Product health, momentum, source labels, and next actions. |

Inspect the installed `@santi020k/lumen-astro` component types before adopting a new chart or
prop. Use its public data contract; this guide does not define a parallel chart API. Any required
numeric helper stays separate from the view so it can be tested against the actual domain rules.

## Preserve metric meaning

- Daily npm downloads are calendar facts. A rolling 30-day total observed on different syncs is
  a velocity series, not a daily download count; never sum those overlapping observations.
- Marketplace and Open VSX counters remain separate cumulative sources. Missing observations
  do not imply zero downloads.
- Website page views and visits retain their source labels and bucket ranges.
- Apple downloads, opt-in installations, and Google Play's active-device install base have
  different definitions. Compare each provider against its own history.
- Missing, stale, delayed, and low-volume provider data use explicit states. A chart should not
  turn withheld or unavailable values into an apparent drop to zero.
- A sparkline supplements a stable text value and context. It does not replace an accessible
  trend label or justify animating values through artificial intermediate numbers.

## Accessibility and interaction

Every chart needs a useful accessible name, source and date context, and a value equivalent
that does not depend on color or a pointer. Use readable series labels and visible units. The
layout must accommodate long project names and narrow screens without dropping records.

For interactive charts, preserve the component's documented keyboard behavior. Hover-only
values must also be available through focus or a table/list. Tooltips cannot be the only source
of essential information. Avoid adding one tab stop per mark to dense datasets.

Keep chart surfaces solid and borders quiet. Use chart series tokens where the component
provides them; reserve success, warning, and danger for actual status. System and app-level
reduced-motion preferences disable decorative animation. Verify reading and value access with
JavaScript disabled as well as with enhancement enabled.

## Future work follows available data

Private-source collection is still planned. The following choices are candidates for that work,
not claims that Observatory already collects the data or implements every listed chart.

| Future signal                                         | Useful view                       | Required evidence before adding it                                           |
| ----------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Lead time, review latency, response-time distribution | Histogram or box plot             | Defined samples, units, bins or summary statistics, and outlier policy.      |
| Failure rates, resource usage, or cost                | Line chart with reference context | Stable denominators, collection cadence, and meaningful thresholds.          |
| Release frequency or issue-state composition          | Bar chart                         | Non-overlapping buckets and explicit state definitions.                      |
| Retention or cohort behavior                          | Heatmap with a table              | Cohort definition, privacy policy, and comparable observation windows.       |
| Relationships between operational measures            | Scatter chart                     | Comparable units, missing-data rules, and useful accessible point summaries. |

Prefer a maintained Lumen primitive when its current public contract fits. Add consumer-side
normalization and tests before rendering a new analysis. Do not add a statistics engine, a
second chart library, or speculative charts without a real portfolio question and available data.

## Implementation map

- [API response contracts](../packages/api-types/src/index.ts)
- [Dashboard aggregation](../apps/api/src/lib/dashboard.ts)
- [Analytics range and cadence helpers](../apps/web/src/lib/analytics-range.ts)
- [Website bucket aggregation](../apps/web/src/lib/website-analytics.ts)
- [Growth map calculations](../apps/web/src/lib/growth-map.ts)
- [Growth map composition](../apps/web/src/components/GrowthMap.astro)
- [Metric cards](../apps/web/src/components/MetricCard.astro)
- [Store provider panels](../apps/web/src/components/store/ProviderAnalytics.astro)

Before replacing a visualization, verify its metric semantics, empty states, table/list
fallback, keyboard paths, light and dark appearance, and narrow-screen layout. Run focused
aggregation or presentation tests for behavior changes, then the repository's `pnpm verify` gate.
