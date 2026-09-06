/**
 * The only thing in this game that outlives a room.
 *
 * There are no accounts and no server-side persistence: a room empties and
 * takes every score with it. That is deliberate — it is why there is no
 * sign-up and no lobby — but it does leave the game with no arc at all.
 * Nothing you did last time exists, so there is nothing to come back and
 * beat.
 *
 * This is the cheapest possible fix and the only one that fits: three
 * numbers in the player's own browser. No account, no server, no name to
 * type, nothing to moderate — and, importantly, it works for a player who
 * was turned away by the capacity gate and is flying solo, which on a busy
 * day is most of them. A server-side board would record everyone EXCEPT
 * those people.
 *
 * "A run" is one visit, not one trail. The score only ever climbs while
 * you are flying, so appending every improvement would fill the board with
 * 210, 211, 212 from a single session. Each visit therefore owns one slot
 * and keeps overwriting it.
 */

const KEY = "shard-islands:best";
const KEEP = 3;

interface Run {
  /** Which visit this score belongs to, so a visit occupies one slot. */
  id: string;
  score: number;
}

/**
 * Fixed for the life of the page.
 *
 * Not crypto.randomUUID(): this has to work in whatever browser somebody
 * arrives with, and the value only has to be unlike the other two entries
 * in one person's own storage.
 */
const visitId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

function read(): Run[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything could be in here: an older shape, a half-written value, or
    // something a person typed into devtools. Take only what type-checks.
    return parsed
      .filter(
        (r): r is Run =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as Run).id === "string" &&
          Number.isFinite((r as Run).score),
      )
      .map((r) => ({ id: r.id, score: Math.round(r.score) }));
  } catch {
    // Private browsing, storage disabled, or malformed JSON. A missing
    // best is not worth an error; the row simply does not appear.
    return [];
  }
}

/** Best runs, longest first. */
export function readBests(): number[] {
  return read()
    .map((r) => r.score)
    .sort((a, b) => b - a)
    .slice(0, KEEP);
}

/**
 * Offer a score. Cheap to call often: it writes only when the board would
 * actually change, which after the first few seconds of a good run means
 * about once a second and then not at all.
 */
export function recordScore(score: number): void {
  if (!Number.isFinite(score) || score <= 0) return;
  const rounded = Math.round(score);

  const runs = read();
  const mine = runs.find((r) => r.id === visitId);

  if (mine) {
    if (rounded <= mine.score) return;
    mine.score = rounded;
  } else {
    runs.push({ id: visitId, score: rounded });
  }

  const kept = runs.sort((a, b) => b.score - a.score).slice(0, KEEP);

  // A visit that has been pushed off the board keeps its slot anyway,
  // otherwise it would be re-added on the very next poll and the write
  // would never settle.
  if (!kept.some((r) => r.id === visitId)) {
    kept[kept.length - 1] = { id: visitId, score: rounded };
  }

  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // as above
  }
}
