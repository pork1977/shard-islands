# Brand marks

Everything here is generated — `node brand/generate.mjs` rebuilds the lot.

Nothing was drawn by eye. The handprint is the *same construction* as
`apps/web/lib/textures/handprintTexture.ts` (one ellipse, five rounded
capsules, identical offsets) and the glider is the real planform from
`apps/web/lib/world/generateGlider.ts` seen from above, with its actual
triangle edges as the facet seams. Colours are the game's own: `#9fe9ff`
is the etched handprint, `#4fd8ff` its glow, `#5fe4ff` the first seat
colour. A logo drawn to merely *resemble* the landing page would drift
from it the first time either was touched. This cannot.

## Which file

| Use | File |
| --- | --- |
| Stripe branding icon, favicon, avatars | `icon-hand-512.png` |
| Same, if a JPG is wanted | `icon-hand-512.jpg` |
| Anywhere small (16–128px) | `icon-hand-128.png`, `icon-hand-256.png` |
| Large / print / retina | `icon-hand-1024.png` |
| Headers, Product Hunt, README banners | `logo-wide-1600.png` |
| Overlaying on your own dark background | `mark-hand-1024.png` |
| Overlaying on a **light** background | `mark-hand-ink-1024.png` |
| The alternative mark | `icon-glider-*.png`, `mark-glider-1024.png` |

`mark-hand-1024.png` is pale cyan on transparent and will vanish on white —
that is what the `ink` variant exists for.

## Why the hand

The glider is a nice shape but it is *a spaceship*, and every flight game
has one. The handprint is the thing nobody else has: it is the dare on the
landing page, it is what the whole site is about, and it survives being
shrunk to 16 pixels, which a faceted dart does not.
