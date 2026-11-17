/**
 * Whether the realtime server is currently switched off on purpose.
 *
 * On 2026-11-17 the Fly machine was scaled to zero. The game had had no
 * players for months, it was only ever a demo, and a machine quietly
 * billing against a world nobody visits is the kind of cost you stop
 * noticing. See the banner at the top of DEPLOY.md.
 *
 * Until then the silence was the design: a join that never landed told the
 * player nothing at all, because a session that never found anyone else is
 * still a complete session. That was the right rule when failing to connect
 * meant something had gone wrong. It is the wrong rule now that it means a
 * decision has been taken, and the page still calls itself a multiplayer
 * game, so a visitor would be left to conclude the game is simply broken.
 *
 * A FLAG AND NOT A GUESS. This deliberately does not infer "switched off"
 * from a failed connection. The two are indistinguishable to the client,
 * and a player whose own wifi dropped would be told a feature had been
 * disabled, which is untrue and unhelpable. Only this constant says it.
 *
 * TO TURN MULTIPLAYER BACK ON, both halves, in either order:
 *   1. fly scale count 1 -r iad -a shard-islands   (see fly.toml)
 *   2. set this to false and push
 *
 * Forgetting step 2 is survivable by design: the notice is shown only
 * while the client is NOT connected, so a restored server makes a stale
 * flag disappear from the screen by itself. Forgetting step 1 is likewise
 * only a missing notice, never a broken game. Nothing here gates, delays
 * or prevents the join attempt itself \u2014 the client still tries, which is
 * exactly what lets it heal.
 */
export const MULTIPLAYER_OFF = true;
