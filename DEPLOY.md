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

**A GitHub repository.** Already done — <https://github.com/pork1977/shard-islands>,
private. Both Fly and Vercel deploy from it, and both redeploy on a push to
`master`.

---

## 1. The realtime server

Either connect the repository in the Fly dashboard ("Launch an App from
GitHub"), or from the CLI:

```bash
fly auth login
fly apps create shard-islands
fly deploy
```

`fly deploy` builds the image on Fly's own builders, so you do **not** need
Docker installed locally.

**If you use the dashboard launcher, check the config it generates.** It
writes its own `fly.toml` from the form rather than using the one committed
here, and a generated config without an `[http_service]` block means Fly
never allocates a public IP — the deploy reports success, and the hostname
resolves to no address at all. `fly ips list` shows the truth in one line:

```bash
fly ips list                       # empty means nothing is reachable
fly ips allocate-v4 --shared       # free
fly ips allocate-v6
```

**And check the machine count.** The launcher created two, both healthy,
both passing checks — and that quietly breaks the game. A Colyseus room
lives in one process, so two machines are two worlds and players balanced
onto different ones cannot see each other:

```bash
fly status                         # one machine under Machines, not two
fly scale count 1
```

`fly.toml` is committed and already sets the region (`iad`, US East), the
machine size, the health check and the connection limits. Change
`primary_region` there if you want it somewhere else — see the note in the
file about why there is only one.

Check it came up:

```bash
curl https://shard-islands.fly.dev/health
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
NEXT_PUBLIC_GAME_SERVER_URL = wss://shard-islands.fly.dev
```

`wss://`, not `ws://`. A page served over HTTPS cannot open an insecure
socket, and the browser refuses it with a mixed-content error that never
mentions WebSockets.

It is inlined into the client bundle at **build** time, so changing it later
means redeploying the frontend, not just restarting anything.

Deploy, and note the domain you get — `shard-islands.vercel.app`, or your own
if you attach one.

---

## Domains in play

| | |
|---|---|
| `www.shardislands.me` | **canonical — the one that serves the game** |
| `shardislands.me` | 308 to the canonical |
| `www.shardisland.me`, `shardisland.me` | the singular spelling, 308 to the canonical |
| `shard-islands.vercel.app` | Vercel's own, still serves; covered by the canonical tag |

**Vercel will not build a redirect chain.** If A already redirects to B, it
refuses to let you redirect B anywhere — so the order matters: repoint
whatever points AT a domain before redirecting the domain itself. Changing
which spelling is canonical means doing the apex first and the www second,
not the other way round.

**The apex redirects to `www`, so `www` is the origin a browser actually
sends.** That is the one the allowlist must contain. Listing only the apex
would give a site that loads perfectly and leaves every player alone in the
sky — the redirect happens before the game ever opens a socket, so by the
time it does, the page came from `www`.

All four hostnames stay on the allowlist even though three of them now only
ever redirect. They cost nothing as entries, and if the canonical spelling
is ever changed again the alternative is a baffling hour of "why is
everybody alone".

## 3. Lock the origins

This is the step that is easy to skip and should not be. Until it is done,
any website can point its traffic at your server and run their game on your
bill.

```bash
fly secrets set ALLOWED_ORIGINS="https://www.shardislands.me,https://shardislands.me,https://www.shardislands.me,https://shardislands.me,https://shard-islands.vercel.app"
```

Use the real domain from step 2. Several are allowed, comma-separated — list
both the Vercel domain and your own if you attach one, because a custom
domain sends its own Origin and would otherwise be refused.

Setting a secret restarts the machine. Confirm:

```bash
curl https://shard-islands.fly.dev/health   # originsLocked: true
```

### A new domain resolves for the world before it resolves for you

A freshly registered domain that was looked up before it existed leaves a
cached NXDOMAIN in whichever resolver was asked, and a negative cache has
to expire on its own — `ipconfig /flushdns` clears the machine but not the
resolver upstream of it. So the site can be live and correct everywhere and
still be unreachable from the one desk that has been checking on it.

Test with a resolver that was never asked too early:

```bash
nslookup www.shardislands.me 1.1.1.1
curl -I --resolve www.shardislands.me:443:<that IP> https://www.shardislands.me/
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

**Vercel Authentication.** A new project on a Pro team starts with SSO
protection on, so every `.vercel.app` URL asks for a login and the game is
playable only by you. Project Settings -> Deployment Protection.

### Proving the origin lock from a browser

`originCheck.ts` proves the logic locally. To prove the DEPLOYED server, use
a real browser, because a browser is the only thing the lock is defending
against — open any page on an origin that is NOT in the allowlist (the local
dev site does nicely) and run:

```js
new WebSocket("wss://shard-islands.fly.dev/")   // must fail
new WebSocket("ws://localhost:2567/")           // control: must connect
```

The control matters. Without it a refusal could just as easily be a bad URL,
and "it failed" would look like success.

Driving a real colyseus.js client from Node was tried for this and does not
work: under Node its socket arrives with no Origin however the header is
injected, so the test reports a wide-open server that a browser is in fact
refused by.

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
