# Telecom Outage Heat Map — Design System

> **For AI assistants and team members**: Always follow this document when generating or writing frontend code for this project. Every component, page, and style decision must respect these rules.

---

## 1. Project Aesthetic

This is a **professional dark dashboard** for telecom engineers. The aesthetic is:

- **Industrial / utilitarian** — data-dense, functional, no decorative noise
- **Dark-first** — dark backgrounds, light text, colored accents for status
- **High information density** — engineers need to see a lot at once, no wasted space
- **Color carries meaning** — every color encodes a specific status or technology type, never used decoratively

Think: Nokia NOC dashboard, Grafana, Datadog. Not a marketing site, not a SaaS landing page.

---

## 2. Color Palette

Always use these exact CSS variables. Never hardcode hex values in components.

```css
:root {
  /* Backgrounds */
  --bg-primary:    #0f0f1a;   /* Page background — darkest */
  --bg-surface:    #1a1a2e;   /* Cards, panels, sidebar */
  --bg-elevated:   #22223a;   /* Dropdowns, tooltips, modals */
  --bg-hover:      #2a2a45;   /* Hover states on interactive elements */

  /* Borders */
  --border-subtle: #2e2e4a;   /* Default card/panel border */
  --border-strong: #4a4a6a;   /* Focused/active element border */

  /* Text */
  --text-primary:   #e8e6f0;  /* Main readable text */
  --text-secondary: #9896b0;  /* Labels, hints, secondary info */
  --text-muted:     #5f5e7a;  /* Disabled, placeholder text */

  /* Brand accent */
  --accent:         #7F77DD;  /* Primary interactive accent — purple */
  --accent-hover:   #9990e8;  /* Hover state of accent */
  --accent-subtle:  #2a2850;  /* Subtle accent background */

  /* Alarm severity — NEVER use these for anything other than alarm status */
  --alarm-critical: #E24B4A;  /* Critical — red */
  --alarm-major:    #EF9F27;  /* Major — amber */
  --alarm-minor:    #FAC775;  /* Minor — yellow */
  --alarm-warning:  #85B7EB;  /* Warning — blue */
  --alarm-ok:       #5DCAA5;  /* OK / resolved — green */

  /* Technology type — NEVER use these for anything other than tech markers */
  --tech-5g:  #7F77DD;        /* 5G — purple */
  --tech-4g:  #1D9E75;        /* 4G — green */
  --tech-3g:  #EF9F27;        /* 3G — orange */
  --tech-2g:  #85B7EB;        /* 2G — blue */
  --tech-b2b: #D85A30;        /* B2B — coral */

  /* Semantic */
  --success: #5DCAA5;
  --danger:  #E24B4A;
  --warning: #EF9F27;
  --info:    #85B7EB;
}
```

### Rules
- **Never use purple (`--accent`) for anything except interactive UI elements** (buttons, links, focus rings, selected states)
- **Never use alarm colors decoratively** — only to communicate actual alarm severity
- **Never use tech colors outside of map markers and the cells-down widget**

---

## 3. Typography

```css
/* Import in globals.css */
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

:root {
  --font-sans: 'IBM Plex Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}
```

### Usage
| Element | Font | Weight | Size |
|---|---|---|---|
| Page headings | IBM Plex Sans | 600 | 20–24px |
| Section headings | IBM Plex Sans | 500 | 14–16px |
| Body text | IBM Plex Sans | 400 | 13–14px |
| Labels / captions | IBM Plex Sans | 400 | 11–12px |
| Site IDs, codes, timestamps | IBM Plex Mono | 400 | 12px |
| Alarm descriptions | IBM Plex Mono | 400 | 11px |

### Rules
- **Monospace font is for data** — site IDs, coordinates, timestamps, alarm codes, API responses
- **Never use font weights above 600** — this is a data dashboard, not a billboard
- **Line height**: 1.5 for body, 1.2 for headings, 1.4 for dense data tables

---

## 4. Spacing

Use a consistent 4px base unit. All spacing values must be multiples of 4.

```
4px  — xs: tight internal padding (badge, tag)
8px  — sm: component internal padding
12px — md: card internal padding, gap between related elements
16px — lg: section padding, gap between cards
24px — xl: major section separation
32px — 2xl: page-level padding
```

Tailwind classes to use: `p-1 p-2 p-3 p-4 p-6 p-8` / `gap-1 gap-2 gap-3 gap-4 gap-6`

---

## 5. Components

### Cards / Panels
```tsx
// Standard panel — use for sidebar sections, stat cards, pop-ups
<div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
  {/* content */}
</div>

// Elevated panel — use for modals, tooltips, dropdowns
<div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-4">
  {/* content */}
</div>
```

### Buttons
```tsx
// Primary — accent color, use sparingly (one per view)
<button className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
  Label
</button>

// Secondary — outlined
<button className="border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-sm font-medium px-4 py-2 rounded-md transition-colors">
  Label
</button>

// Ghost — no border, text only
<button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm px-3 py-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors">
  Label
</button>
```

### Badges / Status Pills
```tsx
// Alarm severity badge
const severityClasses = {
  critical: 'bg-red-950 text-[var(--alarm-critical)] border-[var(--alarm-critical)]',
  major:    'bg-amber-950 text-[var(--alarm-major)] border-[var(--alarm-major)]',
  minor:    'bg-yellow-950 text-[var(--alarm-minor)] border-[var(--alarm-minor)]',
  warning:  'bg-blue-950 text-[var(--alarm-warning)] border-[var(--alarm-warning)]',
  ok:       'bg-green-950 text-[var(--alarm-ok)] border-[var(--alarm-ok)]',
}

<span className={`text-xs font-mono font-medium px-2 py-0.5 rounded border ${severityClasses[severity]}`}>
  {severity.toUpperCase()}
</span>
```

### Data Table Rows
```tsx
// Use for antenna lists, alarm tables
<tr className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
  <td className="px-3 py-2 text-sm text-[var(--text-primary)] font-mono">{siteId}</td>
  <td className="px-3 py-2 text-sm text-[var(--text-secondary)]">{name}</td>
</tr>
```

### Section Headers
```tsx
<div className="flex items-center justify-between mb-3">
  <h2 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider">
    Section Title
  </h2>
  <span className="text-xs text-[var(--text-muted)]">Optional subtitle</span>
</div>
```

---

## 6. Map Markers

Marker colors are defined in `src/components/MarkerLayer.tsx`. Always use `getMarkerColor()` — never hardcode colors directly in map components.

```ts
export function getMarkerColor(tech: Technology, severity: AlarmSeverity): {
  fill: string;
  stroke: string;
} {
  const techColors: Record<Technology, string> = {
    '5G':  '#7F77DD',
    '4G':  '#1D9E75',
    '3G':  '#EF9F27',
    '2G':  '#85B7EB',
    'B2B': '#D85A30',
  }
  const severityStrokes: Record<AlarmSeverity, string> = {
    critical: '#E24B4A',
    major:    '#EF9F27',
    minor:    '#FAC775',
    warning:  '#85B7EB',
    ok:       '#5DCAA5',
  }
  return {
    fill:   techColors[tech],
    stroke: severityStrokes[severity],
  }
}
```

Marker sizing:
- Default radius: `8px`
- Selected/hovered radius: `12px`
- Stroke width: `2px` (normal), `3px` (selected)

---

## 7. Layout

### Dashboard Layout
```tsx
// src/app/page.tsx
<div className="flex h-screen bg-[var(--bg-primary)] overflow-hidden">
  {/* Map — 65% width */}
  <div className="flex-1 relative">
    <Map />
  </div>

  {/* Sidebar — 35% width, scrollable */}
  <div className="w-[400px] flex-shrink-0 border-l border-[var(--border-subtle)] overflow-y-auto">
    <Sidebar />
  </div>
</div>
```

### Sidebar Sections
The sidebar has a fixed order — never reorder these:
1. **Filter toolbar** (alarm severity filter buttons)
2. **Cells down widget** (2G / 4G / 5G / B2B counts)
3. **Selected antenna details** (only visible when an antenna is clicked)
4. **Data usage chart**
5. **Alarm trend chart**

---

## 8. Charts (Recharts)

```tsx
// Always wrap charts in a ResponsiveContainer
<ResponsiveContainer width="100%" height={200}>
  <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
    <XAxis
      dataKey="name"
      tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
      axisLine={false}
      tickLine={false}
    />
    <YAxis
      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
      axisLine={false}
      tickLine={false}
    />
    <Tooltip
      contentStyle={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: '6px',
        color: 'var(--text-primary)',
        fontSize: '12px',
        fontFamily: 'IBM Plex Mono',
      }}
    />
    <Bar dataKey="value" fill="var(--accent)" radius={[3, 3, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

### Rules
- **Background**: always `var(--bg-elevated)` for tooltip, `var(--bg-surface)` for chart container
- **Grid lines**: always `var(--border-subtle)`, dashed `3 3`
- **Axis text**: always `var(--text-muted)`, 11px, IBM Plex Mono
- **Bar color**: use alarm/tech colors when the data represents status, `var(--accent)` for neutral data
- **No legends inside the chart** — put them above as small colored labels

---

## 9. Do / Don't

| Do | Don't |
|---|---|
| Use `var(--bg-surface)` for cards | Use `bg-gray-800` or hardcoded hex |
| Use IBM Plex Mono for IDs, timestamps, codes | Use sans-serif for technical data |
| Use `var(--alarm-critical)` only for critical alarms | Use red for error messages or decorative elements |
| Keep borders at 1px, color `var(--border-subtle)` | Use thick borders or white/light borders |
| Use `transition-colors duration-150` for hover states | Use no transitions (feels dead) or long transitions (feels slow) |
| Use `rounded-lg` (8px) for cards | Use `rounded-full` on rectangular components |
| Write `text-[var(--text-secondary)]` for labels | Write `text-gray-400` |
| Use 4px spacing multiples | Use arbitrary spacing like `p-[13px]` |

---

## 10. Tailwind Config

Add these to `tailwind.config.ts` so CSS variables work as Tailwind utilities:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:  'var(--bg-primary)',
          surface:  'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover:    'var(--bg-hover)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          subtle:  'var(--accent-subtle)',
        },
        alarm: {
          critical: 'var(--alarm-critical)',
          major:    'var(--alarm-major)',
          minor:    'var(--alarm-minor)',
          warning:  'var(--alarm-warning)',
          ok:       'var(--alarm-ok)',
        },
        tech: {
          '5g':  'var(--tech-5g)',
          '4g':  'var(--tech-4g)',
          '3g':  'var(--tech-3g)',
          '2g':  'var(--tech-2g)',
          'b2b': 'var(--tech-b2b)',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
```

With this config you can write `text-text-secondary`, `bg-bg-surface`, `border-border-subtle` etc. directly.

---

## 11. AI Assistant Instructions

When generating code for this project, always:

1. **Import and use CSS variables** defined in section 2 — never hardcode colors
2. **Use IBM Plex Sans / IBM Plex Mono** — never Inter, Arial, or system fonts
3. **Follow the component patterns** in section 5 exactly
4. **Use `getMarkerColor()`** for any map marker rendering
5. **Follow the sidebar section order** in section 7
6. **Apply Recharts config** from section 8 for all charts
7. **Check the Do / Don't table** in section 9 before finalising any component
8. **Never add decorative gradients, blobs, or mesh backgrounds** — this is a data dashboard
9. **All spacing must be multiples of 4px** — use Tailwind spacing scale
10. **Dark theme only** — no light mode variants needed

---

*Telecom Outage Heat Map · Design System v1.0 · 2026*
