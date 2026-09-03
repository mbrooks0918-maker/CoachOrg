# TeamOps brand package — "Huddle"

Drop this folder into your app (e.g. `public/brand/` or `src/brand/`) and wire it up.

## The mark
Four dots ringing an empty centre: a huddle seen from above. The negative space reads as a ball.
Ink tile + turf dots is the default. Never rotate the mark, recolour individual dots, or add a stroke.

## Files
```
brand/
  brand.css                     CSS custom properties + type/wordmark helpers
  svg/
    mark-ink.svg                default mark (ink tile, turf dots) — 512
    mark-turf.svg               inverted (turf tile, ink dots)
    mark-white.svg              white tile, ink dots — for dark photography
    mark-knockout.svg           single-colour, inherits currentColor
    favicon.svg                 32px optical version (larger dots, tighter gap)
    apple-touch-icon.svg        180px, square, no rounding (iOS masks it)
    logo-horizontal-ink.svg     mark + wordmark, light backgrounds
    logo-horizontal-reverse.svg mark + wordmark, ink/dark backgrounds
    logo-stacked-ink.svg        centred stack
  react/TeamOpsMark.jsx         <TeamOpsMark> and <TeamOpsLogo> components
  snippets/head.html            font + favicon tags
  snippets/lockup.html          plain-HTML horizontal lockup
```

## Colour
| Token | Hex | Use |
| --- | --- | --- |
| `--to-ink` | `#0c140c` | text, icon tile, dark surfaces |
| `--to-turf` | `#65c86b` | accent, dots on ink, primary buttons |
| `--to-turf-deep` | `#38853e` | "Ops" on light backgrounds, accent text (AA on white) |
| `--to-chalk` | `#d4f1d4` | tints, selected rows, badges |
| `--to-paper` | `#f6f9f6` | app background |

Turf (`#65c86b`) does not pass AA as text on white — use turf-deep for accent text and keep turf for fills and dark-background text.

## Type
Instrument Sans (Google Fonts). Semibold for display and the wordmark at `-4%` tracking; regular for body, rosters and tables at normal tracking. JetBrains Mono is optional for IDs, times and codes.

## Wordmark
Always "TeamOps" — one word, capital T, capital O. "Team" in ink (or white when reversed), "Ops" in turf-deep on light and turf on dark. Never italicise, condense, or set it in another face.

## Clearspace & minimums
Clearspace on all sides equals one dot diameter (22% of the tile). Minimum sizes: 96px wide for the horizontal lockup, 20px for the mark alone. Below 32px use `favicon.svg` rather than scaling `mark-ink.svg` down.

## Raster exports
Every icon here is SVG. If your store listings need PNGs, rasterise `mark-ink.svg` at 1024/512/192/48 and `apple-touch-icon.svg` at 180 — no redraw needed.
```
npx svgexport brand/svg/mark-ink.svg icon-512.png 512:512
```
