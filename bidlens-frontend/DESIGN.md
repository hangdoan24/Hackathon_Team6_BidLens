---
name: Executive Slate Review
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#444651'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#006a63'
  on-secondary: '#ffffff'
  secondary-container: '#99efe5'
  on-secondary-container: '#006f67'
  tertiary: '#4b1c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#6e2c00'
  on-tertiary-container: '#f39461'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#9cf2e8'
  secondary-fixed-dim: '#80d5cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#00504a'
  tertiary-fixed: '#ffdbcb'
  tertiary-fixed-dim: '#ffb691'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#773205'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
This design system is tailored for senior leadership, procurement committees, and executive evaluators tasked with high-stakes RFP reviews, vendor selection, and strategic proposal analysis. The visual narrative rejects visual noise, dashboard fatigue, and gratuitous gamification in favor of calm authority, deliberate precision, and editorial clarity.

Rooted in a refined **Corporate Modern Minimalist** aesthetic with Swiss editorial sensibilities, the interface treats data as institutional intelligence. Typography is balanced with generous whitespace, crisp structural delineation, and a muted, low-saturation baseline. The emotional response is intentional: quiet confidence, trust, uncompromised focus, and intellectual efficiency.

## Colors
The palette operates on strict chromatic restraint. The foundation is built upon deep slate ink typography over an airy, neutral warm-slate background canvas (`#f8fafc`). Interactive focal points and executive primary actions are grounded by a singular, authoritative Deep Executive Navy (`#1e3a8a`), avoiding aggressive bright tech blues.

Functional accents are de-saturated, purposeful, and restricted to critical decision states:
- **Baseline Canvas:** `#f8fafc` for global backgrounds; pure white `#ffffff` for discrete card surfaces.
- **Ink & Neutral Hierarchy:** Primary headers in Charcoal Slate (`#0f172a`), secondary metrics and body in Slate Muted (`#475569`), border scaffolding in Subdued Slate (`#e2e8f0`).
- **Critical Flag / High Risk:** Soft Desaturated Rose (`#be123c` text, `#fff1f2` background container). Never neon or alarmist.
- **Warning / Conditional Review:** Soft Muted Amber (`#b45309` text, `#fef3c7` background container).
- **Pass / Compliant:** Subtle Muted Sage (`#0f766e` text, `#f0fdf4` background container).
- **Rule of Restraint:** Colored semantic tags must never exceed 15% of any viewport. Background tinting across large containers is strictly prohibited.

## Typography
The typographic architecture couples the structural geometric elegance of **Plus Jakarta Sans** for headlines with the neutral, hyper-legible tabular precision of **Inter** for dense criteria assessment, comparative matrices, and long-form proposal evaluation text.

- **Numerics & Data Comparison:** All scoring tables, currency values, and executive scorecards must activate tabular figures (`font-variant-numeric: tabular-nums`) within Inter to preserve vertical columnar alignment.
- **Leading & Measure:** Evaluation long-form commentary is capped at a line measure of 68-75 characters, using `body-lg` at 26px line height for fatigue-free document scrutiny.
- **Hierarchy Demarcation:** Section categorization utilizes `label-sm` rendered in uppercase styling with deliberate tracking (+0.04em) in slate-muted tones.

## Layout & Spacing
The layout adheres to a structured 12-column grid system optimized for information density without feeling congested. 

- **Desktop (1280px+):** 12-column fluid grid, `2rem` page margins, `1.5rem` gutters. Accommodates split-view side-by-side proposal assessment (e.g., criteria scoring rubric alongside RFP response document).
- **Tablet (768px - 1279px):** 8-column layout with collapsible evaluation drawers, `1.5rem` gutters, and `1.5rem` canvas margins.
- **Mobile (< 768px):** 4-column single-stream stack, `1rem` margins, collapsing comparative views into linear stepped tabs.
- **Vertical Rhythm:** Content modules utilize strict increments of `0.5rem` (8px baseline). Complex metadata groups rely on `space-sm` internal gaps, while major analytical review sections demand `space-xl` separation to preserve cognitive structure.

## Elevation & Depth
In alignment with executive editorial restraint, elevation relies on crisp structural lines and subtle, tinted surface boundaries rather than dramatic drop shadows.

- **The Zero-Shadow Principle:** Standard cards, comparative panels, and tables use zero box-shadow. Structural boundaries are achieved via 1px low-contrast outlines in `#e2e8f0` against pure white `#ffffff` surfaces.
- **Floating Modals & Flyouts:** Floating executive action menus and audit flyouts use a singular ambient, ultra-diffused shadow tinted with deep slate: `0 10px 25px -5px rgba(15, 23, 42, 0.04), 0 8px 10px -6px rgba(15, 23, 42, 0.02)`.
- **Tonal Hierarchy:** Depth is created through surface background contrasts: Canvas (`#f8fafc`) -> Surface Panel (`#ffffff`) -> Active Filter/Hover State (`#f1f5f9`).

## Shapes
A disciplined, soft radius profile (`roundedness: 1`) is enforced across all elements to convey professional rigor. 

- Base components (buttons, input fields, dropdown toggles, score chips) have a radius of `0.25rem` (4px).
- Larger containers, analytical cards, and comparative matrix wrappers use `0.5rem` (8px).
- Fully rounded pills are strictly limited to numeric state indicators and binary compliance badges (`0.75rem` / fully circular cap) to differentiate actionable objects from static metadata.

## Components

### Buttons
- **Primary:** Solid `#1e3a8a` fill with `#ffffff` text. Subtle hover state transitioning to `#172554`. No shadow; crisp 4px radius.
- **Secondary / Tertiary:** Crisp 1px border in `#cbd5e1` with `#0f172a` text over white. Hover activates slate wash `#f8fafc`.
- **Destructive:** Soft crimson background `#fff1f2` with `#be123c` text and 1px `#fecdd3` border. Never high-saturation alarms.

### Chips & Compliance Badges
- Strict pill architecture (`rounded-full`) with subtle tinting.
- **Compliant / Pass:** `#f0fdf4` background, `#166534` text, 1px `#bbf7d0` border.
- **Cautionary / Flag:** `#fefce8` background, `#854d0e` text, 1px `#fef08a` border.
- **Critical Deviation:** `#fff1f2` background, `#9f1239` text, 1px `#fecdd3` border.
- Iconography in chips is restricted to 14px size, positioned leading.

### Evaluation Cards & Panels
- Pure white background (`#ffffff`), surrounded by a 1px border (`#e2e8f0`).
- Card headers feature an integrated subtle 1px border-bottom divider separating section meta from evaluation content. Inner padding strictly set to `space-lg` (24px).

### Input Fields & Scoring Inputs
- Height standardized to 40px for desktop productivity. Neutral border (`#cbd5e1`) on pure white background.
- Focus state replaces border with a refined 1px `#1e3a8a` stroke accompanied by a 2px muted halo (`rgba(30, 58, 138, 0.12)`).
- Tabular numeric score selectors use stepped segmented controls framed within a single border boundary.

### Checkboxes & Selection Controls
- Custom square with 3px subtle rounding.
- Inactive state: 1.5px border in `#94a3b8`.
- Checked state: `#1e3a8a` fill with white checkmark icon, avoiding high-contrast glow effects.

### Comparative Decision Matrix (Specialized)
- Split grid table with alternating transparent and `#fafafa` row striping.
- Sticky column headers with a distinct 2px bottom border in `#cbd5e1`.
- Direct numeric score indicators styled with `Inter` tabular figures, paired with micro horizontal progress gauges utilizing a muted `#1e3a8a` track on a light gray `#e2e8f0` trough.