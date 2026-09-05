import { Client, type Room } from "colyseus.js";

/**
 * Joining a room that already has people in it.
 *
 * Every test that cares about colour used to assume it would get seats
 * zero upward — draftCheck wanted seat 8 for an ally, clipCheck padded the
 * room with exactly seven bodies to land on one. Both are correct only in
 * an empty room, and the room is very often not empty: a browser left open
 * on the game holds a seat, and then every seat shifts by one and two tests
 * fail for a reason that has nothing to do with what they are testing.
 *
 * It cost an afternoon once already. So nothing here counts seats — it asks
 * for a colour and keeps joining until it gets one.
 */

const ENDPOINT = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function join(): Promise<Room> {
  const room = await new Client(ENDPOINT).joinOrCreate("shard_islands");
  // The player's own entry arrives a beat after the join resolves, and
  // everything below reads it immediately.
  for (let i = 0; i < 40 && !room.state?.players?.get(room.sessionId); i++) {
    await sleep(25);
  }
  return room;
}

export function seatOf(room: Room): number {
  return (room.state.players.get(room.sessionId) as { seat: number } | undefined)?.seat ?? -1;
}

export function colourOf(room: Room): number {
  return (room.state.players.get(room.sessionId) as { colour: number } | undefined)?.colour ?? -1;
}

/**
 * Keep joining until one of the new clients has (or pointedly does not
 * have) the colour asked for.
 *
 * Returns that client plus everything else joined along the way, which the
 * caller has to leave: they are holding seats.
 */
export async function joinWithColour(
  colour: number,
  match: boolean,
  limit = 18,
): Promise<{ room: Room; padding: Room[] }> {
  const padding: Room[] = [];

  for (let i = 0; i < limit; i++) {
    const room = await join();
    const mine = colourOf(room);
    if (match ? mine === colour : mine !== colour) return { room, padding };
    padding.push(room);
  }

  for (const room of padding) await room.leave();
  throw new Error(
    `could not find a client ${match ? "matching" : "differing from"} colour ${colour}` +
      ` in ${limit} joins — is the room full?`,
  );
}

/** Leaves every room given, ignoring any that have already gone. */
export async function leaveAll(rooms: (Room | undefined)[]) {
  for (const room of rooms) {
    if (!room) continue;
    try {
      await room.leave();
    } catch {
      // already gone
    }
  }
}
