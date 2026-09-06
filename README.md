# Shard Islands

A frosted glass floor with one glowing handprint on it. No text, no buttons,
nothing to read. Press it and the pane shatters — real Voronoi shard
geometry, not a CSS trick — the camera falls through the hole, and about
twelve seconds later you are flying a light-glider over a procedurally
generated world with other people in it.

There is no loading screen and no lobby, ever. The room is joined at the
moment of the click, in parallel with a fracture animation that takes
several seconds regardless; by the time the glass has finished falling you
are already connected. If the join fails you simply fly alone and are never
told, because a spinner would break the only promise the front page makes.

Everything you see is generated in code. There are no models, no textures
and no art pipeline in this repository.

---

## Running it

Needs Node 20+ and pnpm 9.

```bash
pnpm install
pnpm dev:server   # the realtime server, :2567
pnpm dev          # the frontend, :3210
```

The frontend works without the server — you fall, you fly, you are simply
alone. That is deliberate, and it is the same path a failed join takes in
production.

---

## How it is put together

A pnpm workspace with two independently deployed halves and one shared
package holding the physics.

```
apps/web         Next.js + React Three Fiber        -> Vercel
apps/server      Colyseus, authoritative at 20Hz    -> Fly.io
packages/shared  the flight model and the world     -> imported by both
```

**The shared package is the important one.** The server simulates flight,
so it needs to know where the ground is and how a glider moves. Sharing
constants was not enough — two implementations of "the same" model drift,
and every drift becomes a correction the player feels as a yank. So
`stepFlight` and `terrainHeightAt` exist exactly once and both sides run
the identical arithmetic over the identical inputs.

**Clients send the stick, never their position.** The room runs the flight
model and publishes the result. The client predicts every frame, keeps its
unacknowledged inputs, and on each snapshot adopts the authoritative state
and replays whatever the server had not yet seen. Because both sides run
the same step, that replay normally reproduces the prediction exactly and
the correction is worth nothing at all — measured at 0.003cm of drift over
280 metres of flight. Whatever residual there is decays as a visual offset
rather than a jump.

Other players are rendered 100ms in the past, interpolated between the two
snapshots bracketing that moment.

**The world's up axis is +Z**, not +Y, because the glass floor is looked
down through along -Z. Anything added has to respect that.

---

## The game

Your trail is your score. It grows as you fly and jumps when you collect
Energy Cores — 240 of them, laid out deterministically from a shared seed
so the wire carries one boolean per core and never a coordinate.

Four mechanics, and they interlock rather than stack:

**Jetstream Draft.** Fly along somebody's recent wake, going roughly the way
they went, and the room speeds you up. Anybody's slipstream is worth +25%;
your own colour is worth +65%. That is what makes you go looking for your
own kind rather than merely tolerating the crowd.

**Tail-Clip.** Cut *across* a rival's wake and it severs — everything behind
the cut scatters as shards in their colour for whoever gets back to them
first. Your own colour can never cut you. The crossing requirement is what
lets drafting and clipping coexist at all: following a wake is drafting,
cutting across it is an attack, and they are the same piece of sky.

**The Beacon.** One enormous spiked dome, the only landmark visible from
anywhere, and therefore the only clock the whole map shares. It charges
slowly alone and four times faster with craft circling it, then opens for
fourteen seconds and hangs a core in its mouth. First one there takes it.
For twenty seconds afterwards their wake is *live* — anybody who touches it
is cut, whichever way they were going — and everything they collect is
worth double.

**Shockwave Barrel Roll.** Double-tap A or D. Throws everything within
thirty-four metres clear and guards you from being cut for 1.4 seconds. The
only interaction in the game that takes nothing from anybody, which is why
it costs the roller trail to use.

---

## Testing

The interesting problems here are all about timing between two machines,
and none of them can be checked by hand. Two people with two browsers can
tell you a clip happened; they cannot tell you whether it happened for the
right reason, or whether the near-misses that should have been misses
actually were.

So the tests are headless clients that fly scripted geometry:

```bash
pnpm --filter server exec tsx src/testClient/predictionCheck.ts
```

| | |
|---|---|
| `predictionCheck` | client and server agree to 0.003cm over 280m |
| `coreCheck` | two craft on one core in the same tick — awarded exactly once |
| `coreReachCheck` | a core crossed at speed between two ticks is still collected |
| `draftCheck` | nine clients, because colours are `seat % 8` and two must match |
| `clipCheck` | eleven assertions over five staged geometries |
| `beaconCheck` | charge rate, the race, and the live wake |
| `rollCheck` | the same attack, defended and undefended |
| `awayCheck` | an abandoned tab stops being a player |
| `originCheck` | the deployed bundle refuses the origins it should |
| `loadCheck` | an empty room against a full one: tick rate and bandwidth |

And two that put a fight in front of a real browser so a human can watch it:

```bash
pnpm --filter server exec tsx src/testClient/clipDemo.ts --cut-me
pnpm --filter server exec tsx src/testClient/beaconDemo.ts --claim
pnpm --filter server exec tsx src/testClient/crowd.ts --count=23
```

---

## Performance

Measured rather than assumed, which changed what got optimised. Triangle
count turned out to be irrelevant — the terrain draws 180,000 triangles in
a single call for free, and half a million triangles of instanced trees and
grass cost nothing measurable. Three quarters of the frame was 260 cloud
quads, each with its own geometry and material, drawing 404 triangles
between them.

|  | draw calls | frame |
|---|---|---|
| before | 225 | 4.3ms |
| after, flying alone | 72 | 0.70ms |
| after, full room of 24 | 95 | 1.05ms |

A full room now costs less than a quarter of what an empty world cost
before, and each extra player is worth about one draw call. On the wire it
is 17 KB/s for a full room, and filling the room slows the server tick by
0.6%.

---

## Deploying

See [DEPLOY.md](./DEPLOY.md).

The short version: the server bundles to one self-contained CommonJS file
with no runtime dependencies, ships in a `node:20-alpine` image, and runs on
one Fly machine. One region on purpose — a Colyseus room lives in a single
process, so a second region would be a second *world* whose players are
alone, not a faster route to this one.
