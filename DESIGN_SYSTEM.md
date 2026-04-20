# DESIGN_SYSTEM.md
# Telecom Outage Heat Map — Frontend Design System v2.2

> **This file is law.** Every human and AI working on this project reads this before touching any frontend code. No exceptions.

---

## Aesthetic Direction

**Refined glass** — the kind of dashboard that looks like it belongs in a modern SOC or a Vercel-era SaaS product. Think Linear, Vercel, Planetscale. Clean geometry, sharp hierarchy, subtle depth through frosted glass and micro-shadows, purposeful motion. Not retro, not corporate, not generic AI slop.

The one thing someone should remember: **everything feels alive but nothing feels noisy.**

**Dark mode is the only experience right now.** Light mode variables are stubbed in `.light {}` but not wired up — do not reference them until the feature is built.

---

## UI Library Stack

Use in this priority order:

```
1. shadcn/ui (base-nova)  — base components (Button, Card, Badge, Dialog, etc.)
2. motion/react           — all animations and transitions
3. Tailwind CSS v4        — all layout, spacing, and utility overrides
```

> **Note:** shadcn/ui in this project uses the `base-nova` style, which is backed by `@base-ui/react` primitives instead of Radix UI. The API is shadcn-compatible but the underlying primitives differ. MUI is **not installed** — do not add it.

### Rules
- **shadcn/ui first** — always check shadcn before building from scratch
- **motion/react for all animations** — never raw CSS `transition` on interactive elements
- **Tailwind for layout** — utility classes only, no inline `style` for spacing

---

## Color System

### globals.css — Dark Mode Default

Dark is the primary experience. Dark values live in `:root`. A `.light` block exists but is not yet wired to the theme toggle — do not use it.

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');

@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

/* ============================================================
   DARK MODE — default (primary experience)
   ============================================================ */
:root {
  /* Backgrounds */
  --bg-base:      #080810;
  --bg-surface:   #0e0e1a;
  --bg-overlay:   #13131f;
  --bg-subtle:    #1a1a2e;
  --bg-muted:     #22223a;

  /* Glass */
  --glass-bg:     rgba(255, 255, 255, 0.03);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-hover:  rgba(255, 255, 255, 0.06);

  /* Borders */
  --border:        rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.15);
  --border-accent: rgba(124, 111, 247, 0.4);

  /* Text */
  --text-primary:   #f0eeff;
  --text-secondary: #8b89a8;
  --text-muted:     #4a4868;
  --text-inverse:   #080810;

  /* Brand */
  --accent:        #7c6ff7;
  --accent-bright: #9d94ff;
  --accent-dim:    rgba(124, 111, 247, 0.15);
  --accent-glow:   rgba(124, 111, 247, 0.25);

  /* Alarm severity — ONLY for alarm status, never decorative */
  --alarm-critical: #f04f4f;
  --alarm-major:    #f59e0b;
  --alarm-minor:    #fbbf24;
  --alarm-warning:  #60a5fa;
  --alarm-ok:       #34d399;

  /* Technology types — ONLY for map markers and cells-down widget */
  --tech-5g:  #7c6ff7;
  --tech-4g:  #10b981;
  --tech-3g:  #f59e0b;
  --tech-2g:  #60a5fa;
  --tech-b2b: #f97316;

  /* Semantic */
  --success: #34d399;
  --danger:  #f04f4f;
  --warning: #f59e0b;
  --info:    #60a5fa;

  /* Radius */
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   14px;
  --radius-xl:   20px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md:  0 4px 16px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3);
  --shadow-lg:  0 8px 32px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
  --shadow-glow:0 0 24px var(--accent-glow);

  /* Transitions */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast:   120ms;
  --duration-normal: 200ms;
  --duration-slow:   350ms;

  /* Typography */
  --font-sans: 'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', 'Fira Code', monospace;
}

/* ============================================================
   LIGHT MODE — stubbed, not yet wired up
   ============================================================ */
.light {
  --bg-base:      #f4f4f8;
  --bg-surface:   #ffffff;
  --bg-overlay:   #f0f0f6;
  --bg-subtle:    #e8e8f2;
  --bg-muted:     #dddde8;
  --glass-bg:     rgba(255, 255, 255, 0.75);
  --glass-border: rgba(0, 0, 0, 0.07);
  --glass-hover:  rgba(0, 0, 0, 0.04);
  --border:        rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.16);
  --border-accent: rgba(108, 95, 245, 0.35);
  --text-primary:   #0d0d18;
  --text-secondary: #52506e;
  --text-muted:     #9896b0;
  --text-inverse:   #f0eeff;
  --accent:        #6c5ff5;
  --accent-bright: #7c6ff7;
  --accent-dim:    rgba(108, 95, 245, 0.1);
  --accent-glow:   rgba(108, 95, 245, 0.18);
  --alarm-critical: #dc2626;
  --alarm-major:    #d97706;
  --alarm-minor:    #ca8a04;
  --alarm-warning:  #2563eb;
  --alarm-ok:       #059669;
  --tech-5g:  #6c5ff5;
  --tech-4g:  #059669;
  --tech-3g:  #d97706;
  --tech-2g:  #2563eb;
  --tech-b2b: #ea580c;
  --success: #059669;
  --danger:  #dc2626;
  --warning: #d97706;
  --info:    #2563eb;
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md:  0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.05);
  --shadow-lg:  0 8px 32px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06);
}
```

---

## Theme Toggle

### Hook — `src/hooks/useTheme.ts`

Dark mode is default. The hook manages a `dark`/`light` state value and toggles the `.dark` class on `<html>` — but since `.light` is not yet wired to the CSS, the toggle is currently a no-op visually. Do not build UI around it until light mode is implemented.

```ts
import { useEffect, useState } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return { theme, toggle, isDark: theme === 'dark' }
}
```

> **When implementing light mode:** update `globals.css` to move the `.light` block to `.dark` (with dark values), set `:root` to light values, and the hook will work as-is since it already adds/removes `.dark`.

---

## Typography

**Font: Geist + Geist Mono** — Vercel's open source typeface. Clean, modern, geometric, excellent at small sizes.

```css
:root {
  --font-sans: 'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', 'Fira Code', monospace;
}
```

### Type Scale

| Role | Size | Weight | Font | Use |
|---|---|---|---|---|
| Display | 28px | 600 | Geist | Page titles, empty states |
| Heading 1 | 20px | 600 | Geist | Section headings |
| Heading 2 | 16px | 500 | Geist | Card titles, panel headers |
| Heading 3 | 13px | 500 | Geist | Sub-section labels |
| Body | 14px | 400 | Geist | Main content |
| Small | 12px | 400 | Geist | Secondary info, captions |
| Label | 11px | 500 | Geist | ALL CAPS labels, filter buttons |
| Code | 13px | 400 | Geist Mono | IDs, timestamps, coordinates, alarm codes |
| Code SM | 11px | 400 | Geist Mono | Dense data tables |

### Rules
- **Monospace for data** — site IDs, coordinates, timestamps, alarm codes. Always.
- **Never go below 11px**
- **`tracking-widest` on all uppercase label text**
- **Line height** — 1.6 for body, 1.3 for headings, 1.5 for data tables

---

## Spacing

4px base unit. All spacing is a multiple of 4.

```
2px  — hairline gaps
4px  — xs: icon padding, tight badges
8px  — sm: internal component padding
12px — md: card padding, related element gaps
16px — lg: section padding, card gaps
24px — xl: major section separation
32px — 2xl: page-level padding
48px — 3xl: large section breaks
```

---

## Motion

All interactive motion uses **motion/react**. Never use raw CSS transitions on interactive elements.

```tsx
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
```

### Standard Presets

```tsx
// Page / section entrance
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
}
const itemVariants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
  }
}

// Slide-in panel
const panelVariants = {
  hidden: { x: 24, opacity: 0 },
  visible: { x: 0, opacity: 1,
    transition: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }
  },
  exit: { x: 24, opacity: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] }
  }
}

// Scale pop (badges, markers, tooltips)
const popVariants = {
  hidden: { scale: 0.85, opacity: 0 },
  visible: { scale: 1, opacity: 1,
    transition: { duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }
  }
}
```

### Rules
- **Use AnimatePresence for conditional renders** — popups, tooltips, panels
- **Keep durations short** — fast: 120ms, normal: 200ms, slow: 350ms
- **Always respect reduced motion**:
```tsx
const shouldReduce = useReducedMotion()
```

---

## Component Patterns

### Glass Card

```tsx
<Card className="
  bg-[var(--glass-bg)] backdrop-blur-xl
  border border-[var(--glass-border)]
  rounded-[var(--radius-lg)]
  shadow-[var(--shadow-md)]
  hover:border-[var(--border-strong)]
  transition-colors duration-200
">
  <CardHeader className="pb-3">
    <CardTitle className="
      text-[11px] font-medium
      text-[var(--text-secondary)]
      uppercase tracking-widest
    ">
      Section Title
    </CardTitle>
  </CardHeader>
  <CardContent>{/* content */}</CardContent>
</Card>
```

### Buttons

```tsx
// Primary
<Button className="
  bg-[var(--accent)] hover:bg-[var(--accent-bright)]
  text-white text-[13px] font-medium
  rounded-[var(--radius-md)]
  shadow-[var(--shadow-glow)]
  transition-all duration-200
">Label</Button>

// Secondary — glass outlined
<Button variant="outline" className="
  bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)]
  border-[var(--glass-border)] hover:border-[var(--border-strong)]
  text-[var(--text-primary)] text-[13px]
  rounded-[var(--radius-md)] backdrop-blur-sm
">Label</Button>

// Ghost
<Button variant="ghost" className="
  text-[var(--text-secondary)] hover:text-[var(--text-primary)]
  hover:bg-[var(--bg-subtle)]
  text-[13px] rounded-[var(--radius-md)]
">Label</Button>
```

Available sizes: `xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

### Severity Badges

```tsx
const severityConfig = {
  critical: { bg: 'rgba(240,79,79,0.12)',   border: 'rgba(240,79,79,0.3)',   text: 'var(--alarm-critical)' },
  major:    { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: 'var(--alarm-major)' },
  minor:    { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',  text: 'var(--alarm-minor)' },
  warning:  { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  text: 'var(--alarm-warning)' },
  ok:       { bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  text: 'var(--alarm-ok)' },
}

<Badge style={{
  background: severityConfig[severity].bg,
  border: `1px solid ${severityConfig[severity].border}`,
  color: severityConfig[severity].text,
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 500,
  letterSpacing: '0.05em',
  padding: '2px 8px',
  borderRadius: 'var(--radius-full)',
}}>
  {severity.toUpperCase()}
</Badge>
```

### Filter Buttons

```tsx
<motion.button
  whileTap={{ scale: 0.96 }}
  className={cn(
    'text-[11px] font-medium uppercase tracking-widest px-3 py-1.5',
    'rounded-[var(--radius-md)] border transition-all duration-200',
    active === filter
      ? 'bg-[var(--accent-dim)] border-[var(--border-accent)] text-[var(--accent-bright)]'
      : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
  )}
>
  {filter}
</motion.button>
```

---

## Map Markers

Always use `getMarkerColor()`. Never hardcode colors in map components.

```ts
export function getMarkerColor(tech: Technology, severity: AlarmSeverity) {
  const techFill: Record<Technology, string> = {
    '5G':  'var(--tech-5g)',
    '4G':  'var(--tech-4g)',
    '3G':  'var(--tech-3g)',
    '2G':  'var(--tech-2g)',
    'B2B': 'var(--tech-b2b)',
  }
  const severityStroke: Record<AlarmSeverity, string> = {
    critical: 'var(--alarm-critical)',
    major:    'var(--alarm-major)',
    minor:    'var(--alarm-minor)',
    warning:  'var(--alarm-warning)',
    ok:       'var(--alarm-ok)',
  }
  return { fill: techFill[tech], stroke: severityStroke[severity] }
}
```

> **Leaflet marker colors:** Leaflet reads colors at render time. Resolve CSS variables with `getComputedStyle(document.documentElement).getPropertyValue('--tech-5g').trim()` so markers don't get stale values.

Marker sizing:
- Default: `radius: 7`, `strokeWidth: 2`
- Hovered: `radius: 10`, `strokeWidth: 2.5`
- Selected: `radius: 12`, `strokeWidth: 3` + outer glow ring

---

## Layout

```tsx
<div className="flex h-screen bg-[var(--bg-base)] overflow-hidden">

  {/* Map */}
  <div className="flex-1 relative min-w-0">
    <Map />
    <FilterBar className="absolute top-4 left-4 z-10" />
  </div>

  {/* Sidebar */}
  <motion.aside
    initial={{ x: 20, opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
    className="
      w-[380px] flex-shrink-0
      border-l border-[var(--glass-border)]
      bg-[var(--glass-bg)] backdrop-blur-2xl
      overflow-y-auto flex flex-col gap-3 p-4
    "
  >
    <CellsDown />
    <AntennaDetails />
    <StatsChart />
    <AlarmTable />
  </motion.aside>

</div>
```

### Sidebar Section Order (never reorder)
1. CellsDown widget
2. Selected antenna details (only when clicked)
3. Data usage chart
4. Recent alarms table

---

## Recharts

Recharts cannot read CSS variables directly at paint time. Use the helper below and re-render on theme change.

```tsx
function getCSSVar(name: string) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim()
}

<ResponsiveContainer width="100%" height={180}>
  <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
    <defs>
      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={getCSSVar('--accent')} stopOpacity={0.9} />
        <stop offset="100%" stopColor={getCSSVar('--accent')} stopOpacity={0.4} />
      </linearGradient>
    </defs>
    <CartesianGrid
      strokeDasharray="4 4"
      stroke={getCSSVar('--border')}
      vertical={false}
    />
    <XAxis
      dataKey="name"
      tick={{ fill: getCSSVar('--text-muted'), fontSize: 10, fontFamily: 'Geist Mono' }}
      axisLine={false} tickLine={false}
    />
    <YAxis
      tick={{ fill: getCSSVar('--text-muted'), fontSize: 10 }}
      axisLine={false} tickLine={false}
    />
    <Tooltip
      cursor={{ fill: getCSSVar('--glass-hover') }}
      contentStyle={{
        background: getCSSVar('--bg-overlay'),
        border: `1px solid ${getCSSVar('--glass-border')}`,
        borderRadius: 'var(--radius-md)',
        color: getCSSVar('--text-primary'),
        fontSize: '12px',
        fontFamily: 'Geist Mono',
      }}
    />
    <Bar dataKey="value" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

> Pass `theme` from `useTheme()` as a `key` prop to force re-resolution on theme change: `<BarChart key={theme} ...>`

---

## Tailwind Config

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        bg: {
          base:    'var(--bg-base)',
          surface: 'var(--bg-surface)',
          overlay: 'var(--bg-overlay)',
          subtle:  'var(--bg-subtle)',
          muted:   'var(--bg-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          bright:  'var(--accent-bright)',
          dim:     'var(--accent-dim)',
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
        border: {
          DEFAULT: 'var(--border)',
          strong:  'var(--border-strong)',
          accent:  'var(--border-accent)',
        },
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
        },
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
      },
      boxShadow: {
        sm:   'var(--shadow-sm)',
        md:   'var(--shadow-md)',
        lg:   'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
}

export default config
```

---

## shadcn/ui Setup Notes

This project uses `style: "base-nova"` (see `components.json`), which uses `@base-ui/react` primitives instead of Radix UI. Components are otherwise installed and used the same way as standard shadcn/ui.

Override shadcn's default `:root` variables in `globals.css` with the variables above. Do not use shadcn's built-in theme variables directly.

```bash
npx shadcn@latest add button card badge tooltip dialog
```

---

## Do / Don't

| Do | Don't |
|---|---|
| Use `motion/react` for all interactive animations | Use CSS `transition` on buttons/cards directly |
| Use shadcn as the base, override with Tailwind | Build components from scratch if shadcn has it |
| Use `backdrop-blur-xl` on sidebar and glass cards | Use solid opaque backgrounds on overlay surfaces |
| Use Geist / Geist Mono everywhere | Use Inter, Arial, or system-ui as primary fonts |
| Use `var(--alarm-*)` only for alarm status | Use alarm colors decoratively |
| Use `var(--accent)` only for interactive UI | Use purple as a general decorative color |
| Use `getCSSVar()` in Recharts | Pass raw CSS variable strings to Recharts |
| Use `key={theme}` on charts to re-render on theme change | Let charts show stale colors after theme switch |
| Use `useReducedMotion()` to respect accessibility | Always animate regardless of user preference |
| Use `AnimatePresence` for conditional mounts | Mount/unmount without exit animations |
| Resolve Leaflet marker colors with `getComputedStyle` | Pass raw CSS variable strings to Leaflet |

---

## AI Assistant Instructions

When writing any frontend code for this project:

1. **Read this file completely before writing any code**
2. **Check shadcn/ui first** before building any component from scratch
3. **Use `motion/react`** for every hover, click, mount, and unmount animation
4. **Use Geist / Geist Mono** — never Inter, Arial, or system fonts
5. **Use CSS variables** — never hardcode colors, shadows, or radii
6. **Glass morphism on surfaces** — `bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)]`
7. **Stagger list entrances** — `containerVariants` + `itemVariants` pattern above
8. **Wrap conditional renders in `AnimatePresence`**
9. **Sidebar section order is fixed** — CellsDown → AntennaDetails → Charts → Alarms
10. **Never use inline `style` for spacing or layout** — Tailwind only
11. **Theme-aware Recharts** — always use `getCSSVar()` and `key={theme}`
12. **Theme-aware Leaflet** — always use `getComputedStyle` to resolve marker colors
13. **Do not wire up light mode** — `.light` CSS block exists but the toggle is not implemented yet
14. **Check the Do/Don't table** before finalising any component

---

*Telecom Outage Heat Map · Design System v2.2 · Dark Mode · 2026*
