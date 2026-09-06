# Product Hunt launch kit

Copy-paste ready. Character counts are checked against Product Hunt's limits
by `node brand/checkcopy.mjs`.

---

## Name

```
Shard Islands
```

## Tagline (60 max)

**Use this one:**

```
Press the handprint. The floor shatters. You're flying.
```

It is three beats and a story, it contains an instruction, and it does not
waste a single word explaining what a browser game is.

Alternatives if you want the category stated outright:

```
A multiplayer flight game hiding under a glass floor
```

```
Break the glass. Fly. Your light trail is your score.
```

## Description (260 max)

```
A frosted glass floor, one glowing handprint, one word: DON'T. Press it and the floor shatters — you fall into a shared sky of up to 24 craft. Fly through Energy Cores to grow your light trail. Longest trail wins. No sign-up, nothing to install.
```

## Topics

`Games` · `Web App` · `Fun`

Product Hunt renames topics from time to time — pick the closest live ones,
but do **not** tag this AI. There is no model anywhere in it and someone will
say so in the comments.

## Links

- Website: `https://www.shardislands.me`
- Also fine to add: the GitHub repo, if you make it public

---

## First comment (the maker's comment)

This is the field that actually matters. Post it the moment the launch goes
live.

```
Hey Product Hunt 👋

I built this one for you lot, genuinely. No waitlist, no sign-up, no "book a demo" — just a link you can click right now and be flying inside fifteen seconds.

**What it is:** a real-time multiplayer flight game that runs in the tab you already have open. You land on what looks like a pane of frosted glass with a glowing handprint and one word: DON'T. Press it anyway. The floor shatters and you fall into a shared sky with everyone else who is on the site right now.

**How to play — this is the entire list:**

• WASD to steer, drag the mouse to look around
• Shift to boost, Space to hover
• Fly through the glowing Energy Cores. Your light trail IS your score
• Cut ACROSS someone else's trail and it snaps. Whatever falls off is loose for anyone to collect. Your own colour can never cut you
• Double-tap A or D for a barrel roll that shoves everyone near you away and makes you briefly uncuttable
• The spiked dome charges up and then opens. First one to the core floating above it gets 20 seconds where their trail cuts anyone who touches it

Longest trail wins. There is no round timer and no end screen — it is king-of-the-hill, so you drop in, take the top spot off whoever has it, and leave when you feel like it. Your own best runs are saved in your browser, so there is something to come back and beat.

**Under the hood:** Next.js + React Three Fiber on the front, a Colyseus server on Fly.io running authoritative physics at 20 ticks a second, with client-side prediction and reconciliation so it feels instant even from the other side of the planet. Both halves run the identical physics code out of a shared package, which is the only reason the prediction lines up.

It is also capped at 64 people flying at once. I load-tested it properly and the tick rate falls off a cliff past about seventy — so rather than let a busy day turn into a laggy mess for everybody, the ceiling sits below where I measured it sagging.

So if you land in an empty sky, it is either a quiet moment or the server politely telling you it is full — either way, give it a few minutes and come back, or drag a friend in. It is a much better game with someone to cut up.

It is free and it always will be. Tell me what breaks 🙏
```

---

## Gallery

Upload in this order. The first image is what people see before they click.

1. `ph-gallery-1-hero.png`
2. **A real gameplay screenshot** — see below
3. `ph-gallery-2-howitworks.png`
4. `ph-gallery-3-mechanics.png`
5. `ph-gallery-4-controls.png`

### The one thing missing

Every designed slide here is a *claim*. A real screenshot of the sky, with
trails and other craft in it, is *evidence* — and for a game it will do more
work than all four slides put together. Grab two or three at 1270×760:

- one mid-flight with a long trail behind you
- one with the Beacon open (the dome lit, pillar up)
- one looking down at the islands from altitude

Windows: `Win + Shift + S`, or F11 for fullscreen first and then PrtScn.

## Icon

Use `ph-icon-b-240.png` — cyan hand on deep violet.

The dark navy site icon is right for a browser tab and wrong for Product
Hunt, which is a white page full of competing thumbnails where a dark square
reads as a hole. Tested at 56px on white against the other two candidates:
the pale-gradient versions wash out completely, and B is the only one that
still has a readable silhouette and a colour you can pick out of a list.
