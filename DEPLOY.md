# Deploying Shard Islands

Two halves, deployed separately: the **frontend** (`apps/web`) on Vercel, and
the **realtime server** (`apps/server`) on Fly.io.

Everything in this repository is ready. What follows is the part that needs
an account holder.

---

## Before you start

**A Fly.io account.** There is no free tier any more — Fly withdrew it for
new accounts in October 2024. It is pay-as-you-go with a card on file, and
what this game needs is small:

| | |
|---|---|
| `shared-cpu-1x`, 512MB, running continuously | ~$3.30/month |
| Bandwidth, North America / Europe | $0.02/GB |
| A full room of 24 players | ~1.4 GB/hour, so ~$0.03/hour |

A quiet month is a few pounds. A Product Hunt day with a hundred concurrent
players for twelve hours adds something like a pound of bandwidth on top.
Check <https://fly.io/docs/about/pricing/> before committing — that page is
the only authority and it changes.

**A Vercel account.** The free Hobby tier covers this frontend.

**A GitHub repository.** This repo has no remote yet. Vercel can deploy from
the CLI instead, but connecting a repository is what gives you preview
deployments and a deploy on every push.

---

## 1. The realtime server

```bash
fly auth login
fly apps create shard-islands-server
fly deploy
```

`fly deploy` builds the image on Fly's own builders, so you do **not** need
Docker installed locally.

`fly.toml` is committed and already sets the region (`iad`, US East), the
machine size, the health check and the connection limits. Change
`primary_region` there if you want it somewhere else — see the note in the
file about why there is only one.

Check it came up:

```bash
curl https://shard-islands-server.fly.dev/health
```

```json
{ "ok": true, "uptimeSeconds": 12, "rooms": 0, "players": 0, "originsLocked": false }
```

`originsLocked: false` is expected at this point, and step 3 fixes it.

---

## 2. The frontend

Import the repository at <https://vercel.com/new>. Vercel detects Next.js on
its own; the only thing it cannot guess is where the game server lives.

Set one environment variable, for **all** environments:

```
NEXT_PUBLIC_GAME_SERVER_URL = wss://shard-islands-server.fly.dev
```

`wss://`, not `ws://`. A page served over HTTPS cannot open an insecure
socket, and the browser refuses it with a mixed-content error that never
mentions WebSockets.

It is inlined into the client bundle at **build** time, so changing it later
means redeploying the frontend, not just restarting anything.

Deploy, and note the domain you get — `shard-islands.vercel.app`, or your own
if you attach one.

---

## 3. Lock the origins

This is the step that is easy to skip and should not be. Until it is done,
any website can point its traffic at your server and run their game on your
bill.

```bash
fly secrets set ALLOWED_ORIGINS="https://shard-islands.vercel.app"
```

Use the real domain from step 2. Several are allowed, comma-separated — list
both the Vercel domain and your own if you attach one, because a custom
domain sends its own Origin and would otherwise be refused.

Setting a secret restarts the machine. Confirm:

```bash
curl https://shard-islands-server.fly.dev/health   # originsLocked: true
```

**Do not add `*.vercel.app` to the production server.** It would trust every
preview deployment of every fork of this repository. If you want working
previews, that is what a staging server is for — see below.

---

## 4. Check it actually works

Open the Vercel URL in two browsers. You should see two craft, two labels,
and each other's trails.

If the sky is empty and you are alone, the join failed. By design that is
silent — the game never shows a connecting spinner — so look here:

```bash
fly logs
```

A refused origin logs `[server] refused origin https://...`, which almost
always means the domain in `ALLOWED_ORIGINS` does not exactly match the one
in the browser's address bar.

---

## Optional: a staging server for preview branches

Only worth it if you want preview deployments to be playable.

```bash
fly apps create shard-islands-staging
fly deploy --app shard-islands-staging
fly secrets set --app shard-islands-staging ALLOWED_ORIGINS="*.vercel.app"
```

Then in Vercel, set `NEXT_PUBLIC_GAME_SERVER_URL` for the **Preview**
environment only to `wss://shard-islands-staging.fly.dev`, leaving Production
pointed at the production server. The wildcard allowance then exists only on
a machine that has nothing to lose.

Cost: a second machine, so roughly double the fixed monthly cost.

---

## Running it back

```bash
fly releases                  # every deploy, numbered
fly releases rollback         # back to the previous one
```

Vercel keeps every deployment; promoting an older one to production is a
button in its dashboard.

---

## Watching it

```bash
fly logs                      # live
fly status                    # machine state and health
fly machine list
```

`/health` reports uptime, live room count, connected players, and whether
the origin lock is on. It is a plain JSON endpoint, so anything that can
poll a URL — a free uptime monitor will do — can watch it and tell you
before a player does.
