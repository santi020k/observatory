# Observatory design guide

[Project overview](../README.md) · [Architecture](architecture.md) ·
[Data visualization](visualization-roadmap.md)

Observatory is a private control room for a working portfolio. Its interface should help the
owner see what changed, understand the evidence, and choose the next action. The visual direction
shares the sculpted hierarchy of Santiago's website and theme family while retaining Observatory's
violet palette, operational density, and existing workflows.

## Character

Calm, precise, and useful. Give each page an open heading, a short explanation, and a clear
relationship between its controls and results. Use typography, alignment, and fine rules to
separate information before adding another panel.

- Keep one main heading and one primary action for the task at hand.
- Put the reporting range and source context near the values they describe.
- Reserve emphasis for attention signals, selected controls, and consequential actions.
- Keep complete project names, metric definitions, provider labels, and error guidance visible.
- Use real, sanitized local fixtures for visual checks; never publish private dashboard captures.

## Palette and typography

`AppLayout.astro` maps the shared `@santi020k/theme` colors into Lumen's semantic variables.
The existing indigo canvas and violet interaction colors remain the palette authority. Consume
these variables in `global.css`; avoid copying literal values into pages or creating a parallel
Observatory palette.

| Purpose                                   | Semantic token                                 |
| ----------------------------------------- | ---------------------------------------------- |
| Main canvas                               | `canvas`, mapped from `theme-bg`               |
| Reading and data surfaces                 | `surface`, `surface-muted`, `surface-strong`   |
| Headings and primary values               | `ink`                                          |
| Descriptions, labels, and useful metadata | `ink-soft`                                     |
| Secondary, nonessential metadata          | `ink-muted`                                    |
| Fine dividers and control boundaries      | `line`                                         |
| Identity and interaction                  | `brand`, `brand-solid`, `brand-soft`, `accent` |
| Meaningful status                         | `success`, `warning`, `danger`                 |

Use `hsl(var(--token))` for these HSL component variables. Keep text readable in light, dark,
and increased-contrast modes. Status always needs a text label or icon in addition to color;
ordinary chart categories must not imply health or failure accidentally.

Use the shared Montserrat family for the interface, served locally. Keep technical identifiers
and commands in the shared monospace family. Sentence-case, medium-weight headings and tighter
tracking establish hierarchy; large marketing headlines do not belong in dense settings or
feedback views. Values use stable alignment so adjacent metrics are easy to compare.

The Montserrat variable font and its SIL Open Font License are vendored in
`apps/web/src/assets/fonts` from the Santi020k Theme brand assets. Theme 2.0.1 exports
typography tokens but does not yet ship the font files; the application bundles its local
font URL through Vite without a third-party font request.

## Frame and navigation

The shared app frame owns identity, navigation, and utilities. The sculpted header reference
informs its silhouette and hierarchy; the sidebar continues to reflect Observatory's operating
areas. Keep the selected route visible and marked with `aria-current`.

- Align the page heading, range controls, panels, and data tables to one content grid.
- Use a compact identity area and a solid header surface with restrained depth.
- Keep page actions close to the heading without wrapping titles into unreadable fragments.
- On small screens, let navigation and controls wrap or scroll within their own region.
- Maintain source order when columns collapse, including labels before controls and headings
  before the data they explain.
- Keep the skip link, meaningful navigation landmarks, visible focus, and 44px action targets.

The owner-facing application does not need a marketing footer, public documentation route, or
personal promotional navigation. Repository documentation can credit the author without exposing
the hosted dashboard or its data.

## Page composition

| Surface                   | Reading order and emphasis                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Portfolio dashboard       | Heading and range; key signals; trends; project comparisons and detailed records.                           |
| Project detail            | Project identity and source context; health and metrics; history; related actions.                          |
| Store analytics           | Range and provider context; provider status; comparable metrics within each provider; breakdowns.           |
| Feedback inbox and boards | Project selection; moderation and delivery filters; items; explicit status controls.                        |
| Settings                  | Section navigation; labeled fields and current state; local save actions; recovery and destructive actions. |
| Login and verification    | Product identity; short guidance; labeled authentication fields; recovery and error paths.                  |

Use one solid surface for a related group. Metric strips can use Lumen `Stat` with its `bare`
variant; supporting text remains beside the value. Avoid ornamental cards inside cards, repeated
glowing outlines, background grids behind data, and hover movement on whole panels.

Use Lumen buttons, fields, tabs, tables, badges, dialogs, and charts through their documented
contracts. Extend them with public variants and `data-slot` hooks rather than private internal
classes. Product wrappers such as `MetricCard`, `RangePicker`, and `ProviderAnalytics` keep their
domain context and compose those primitives.

## Motion and navigation transitions

Motion should explain a change in context and then settle. Native
[cross-document View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)
may add a short fade between full page navigations. Keep normal server-rendered navigation,
authentication redirects, browser history, form submissions, and per-page script initialization.
Unsupported browsers retain an ordinary page load.

Use Lumen `ScrollReveal` for short, once-only entrances on small summary groups. Its content must
remain available without JavaScript. Do not wrap a complete long dashboard or feedback board in a
reveal threshold: some of those regions are taller than a viewport. Avoid staggered entrances on
large tables and do not animate numeric values through invented intermediate facts.

Keep hover and entrance transitions brief, around 180–300ms. Both the system reduced-motion
preference and Observatory's saved reduced-motion preference disable decorative motion and smooth
scrolling. The app should remain understandable when every transition is removed.

Load Lumen styles and mount `UIPrimitives` once in the root layout. Do not add another client
router or motion library merely to animate navigation.

## Data and product states

An unavailable metric is different from zero. Preserve loading, empty, stale, provider-failure,
and insufficient-history states and provide an appropriate next action. Never smooth gaps into
facts or combine provider metrics with different definitions.

Charts need accessible names, source/range context, readable legends, and value access beyond
color or hover. Tables retain complete records and keyboard access when they need horizontal
scrolling. See the [visualization guide](visualization-roadmap.md) for ownership and chart choices.

Feedback moderation and delivery status remain separate. Dragging a card must have an equivalent
labeled keyboard control. Authentication restyling must preserve the package-owned login and
passkey flows and the consumer-owned recovery boundary.

## Documentation

Keep the README as the entry point with a concise product description, setup, quality commands,
and links to focused guides. Each guide starts with its purpose and a short path back to the
project. Use tables for actual comparisons, code blocks for executable commands, and descriptive
links for related decisions. A documentation refresh must preserve exact operational commands,
source definitions, privacy limits, and release requirements.

This document is Observatory's visual authority. Its references are `docs/sculpted-style-guide.md`
in the `santi020k/website` repository and `docs/brand-guidelines.md` in `santi020k/santi020k-theme`.
Adapt shared hierarchy and interaction principles to this product rather than copying a marketing
page's layout or replacing the current palette.

## Review checklist

1. Compare the same route, state, fixture data, theme, and viewport before and after a material change.
2. Check 320px, 375px, 768px, and 1440px widths in light and dark modes. Confirm no page-level
   horizontal overflow and readable titles, values, table controls, and settings fields.
3. Follow keyboard paths through navigation, range selection, dialogs, authentication, and feedback
   status changes. Check focus visibility and focus return after closing overlays.
4. Test system and saved reduced motion, increased contrast, enlarged text, and JavaScript-disabled
   reading. Main content must never depend on an animation completing.
5. Follow links forward and back; verify theme, preferences, active navigation, authenticated state,
   and functional page controls after navigation.
6. Run `pnpm verify` and report rendered checks separately from automated results. Keep screenshots
   temporary and use sanitized local data.

Implementation boundaries: [`AppLayout.astro`](../apps/web/src/layouts/AppLayout.astro),
[`global.css`](../apps/web/src/styles/global.css), and the existing components under
[`apps/web/src/components`](../apps/web/src/components).
