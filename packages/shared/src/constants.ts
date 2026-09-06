// Single source of truth for physics/gameplay constants shared by the client's
// predicted flight controller and the server's authoritative simulation.
// Keeping both sides importing from here is what lets prediction and the
// authoritative sim agree without drifting apart.

export const SERVER_TICK_RATE_HZ = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE_HZ;

export const FLIGHT = {
  // Raised across the board: the map is 1400 units across, and at the old
  // cruise it took over a minute and a half to cross, which is what made
  // the ground look like it was barely moving.
  baseForwardSpeed: 26,
  diveSpeedMultiplier: 1.9,
  turnDamping: 6, // higher = snappier steering response
  /** Boost has to be unmistakable — 1.5x was not felt at all. */
  boostSpeedMultiplier: 2.7,
} as const;

export const TRAIL = {
  pointSpacingMeters: 0.75, // arc-length spacing between recorded trail points
  hotSegmentLength: 24, // most-recent points kept at full resolution for collision
  /**
   * Widened from 0.4 for tail-clip.
   *
   * A trail you can be killed for touching has to be a thing you can SEE
   * from a distance and judge the edge of. At the old width it was a
   * filament under a metre across in a sky two point eight kilometres wide —
   * fine as decoration, impossible as a hazard, and any hitbox generous
   * enough to be playable would have been many times wider than the thing
   * being drawn. Widening the ribbon is what lets the hitbox be honest.
   */
  baseThickness: 1.4,
} as const;

/**
 * Jetstream Draft.
 *
 * Two tiers rather than the flat colour gate first sketched. A hard "only
 * your own colour may draft" rule is dead weight in the rooms this will
 * actually launch in: with eight colours and two players in the sky, the
 * mechanic would almost never be available at all. Grading it keeps the
 * intent — you go and look for your own kind, because that is where the real
 * boost is — while leaving something worth doing behind a stranger.
 */
export const DRAFT = {
  /** Behind anybody's trail. */
  strangerMultiplier: 1.25,
  /** Behind a craft of your own colour. */
  alliedMultiplier: 1.65,
  /** How closely the drafter has to be following the trail's own direction. */
  minHeadingAgreement: 0.55,
  /** Trail points back from the leader that still pull. */
  hotPoints: 34,
} as const;

/**
 * Tail-Clip.
 *
 * Cut across somebody else's wake and it severs: everything behind the cut
 * stops being theirs and scatters as shards for whoever gets there first.
 *
 * Two gates, and between them they turn eight arbitrary colours into teams:
 *
 *   Your own colour cannot be clipped at all. That is Paul's rule, and this
 *   is the half of it that carries its weight — a player who shares your
 *   hue is somebody you can fly alongside at speed with no risk, which is
 *   the entire reason to seek them out.
 *
 *   You have to cut ACROSS a wake rather than follow it. Without that,
 *   drafting a stranger — which sits you directly on their trail by
 *   design — would sever it instantly, and the two mechanics would be
 *   unable to coexist. With it they interlock: tuck in behind a rival for
 *   the small draft, or cut across them for the kill.
 */
export const CLIP = {
  /**
   * How close the clipper's path has to come to the victim's ribbon.
   *
   * Comfortably wider than the ribbon is drawn, and deliberately so: the
   * plan's hard constraint is that nothing may require fine motor
   * precision, and a hitbox measured to the pixel would make the highest
   * stakes mechanic in the game a lottery at flying speed.
   */
  radius: 4,
  /**
   * Above this much agreement with the wake's own direction you are
   * following it, not cutting it — and following is what drafting is for.
   */
  maxHeadingAgreement: 0.35,
  /** Grace after being cut, so nobody is chain-clipped down to nothing. */
  immunityMs: 2600,
  /**
   * What flying into an overcharged craft's live wake costs, as a fraction
   * of the victim's SCORE rather than of their ribbon.
   *
   * An ordinary cut takes what it geometrically severs, which is right: a
   * short ribbon genuinely has less to lose. A live wake is not a cut in
   * the same sense — it is a flat punishment for touching the wire — and
   * charging it against ribbon length let a craft whose ribbon had not yet
   * caught up with its score walk away having lost a single point.
   */
  liveWakeCost: 0.6,
  /** No cut leaves a player with less than this. */
  minTrailLength: 14,
  /**
   * How much of the severed trail comes back as shards. The rest is simply
   * gone — a clip has to cost the world something, or trail length only
   * ever inflates.
   */
  shardYield: 0.7,
  /** Most shards one cut can scatter, however long the severed tail was. */
  maxShards: 12,
  /**
   * How long shards lie there before fading. Long enough for a fight over
   * them, short enough that the sky does not silt up with old kills.
   */
  shardLifeMs: 26000,
  /**
   * Dead time before a shard can be taken.
   *
   * Without it the victim simply re-collects their own tail on the spot,
   * having lost nothing. A second and a half of flight at cruise puts both
   * craft forty metres past the cut, so both have to turn and come back —
   * which is the fight the mechanic exists to create.
   */
  shardArmMs: 1500,
  /** Same generous bubble the cores use; a shard is a pickup like any other. */
  shardPickupRadius: 20,
} as const;

/**
 * The Shockwave Barrel Roll.
 *
 * Everything the game has built so far is offence: draft to catch somebody,
 * cut across them to take their trail, overcharge to become untouchable.
 * There has been no answer to being hunted except to fly away, and the
 * craft that is being hunted is by definition the slower one.
 *
 * So: snap into a full roll and throw everything nearby off you. It shoves,
 * it does not kill — this is the one interaction in the game that takes
 * nothing from anybody, which is exactly why it can afford to be usable
 * whenever you are in trouble.
 *
 * It is also the counterplay to overcharge, which otherwise had none worth
 * the name. The guard outlasts the shove, so a roll timed into somebody's
 * live wake gets you through it.
 */
export const ROLL = {
  /** How quickly the second tap has to follow the first. */
  doubleTapMs: 300,
  /** How long the craft is inverted. */
  durationSeconds: 0.62,
  /**
   * Before another. Long enough that it is a decision rather than a habit,
   * short enough to be there when a second attacker arrives.
   */
  cooldownSeconds: 6,

  /** Everything inside this is thrown clear. */
  radius: 34,
  /** How hard, as metres per second of velocity handed to the victim. */
  shoveSpeed: 46,
  /** How quickly that bleeds off. Higher is snappier. */
  shoveDamping: 2.6,

  /**
   * Immunity to being cut, from the moment the roll starts.
   *
   * Deliberately longer than the roll itself. The shove alone would not
   * save anybody — a craft already committed to a pass is through you
   * before the push has moved it far enough — so the roll has to buy time
   * as well as distance, or it would look like a defence and not be one.
   */
  guardMs: 1400,

  /**
   * What it costs in trail.
   *
   * A defence with no price is simply held down. Paying score for it means
   * rolling out of trouble has cost you the thing you were in trouble over,
   * which is the right shape for a panic button.
   */
  trailCost: 8,
} as const;

export const INTERACTION_RADII = {
  /**
   * Raised from 3. At three metres, catching a slipstream at fifty metres a
   * second was threading a needle nobody threaded; the fantasy is sitting in
   * somebody's wake, not landing a precision shot.
   */
  draftLateral: 7,
  /** Superseded by CLIP.radius, which is the real one. */
  tailClip: CLIP.radius,
  /** Superseded by ROLL.radius, which is the real one. */
  barrelRoll: ROLL.radius,
  crystalVoidEvent: 40,
} as const;

export const ROOM = {
  maxPlayers: 24,
} as const;

/**
 * The join was refused because the machine is full, not because anything
 * broke.
 *
 * Shared for the same reason the seat colours are: the client has to tell
 * "there was no room for you" apart from "the server is unreachable", and
 * it does completely different things with each — the first is final and
 * should drop straight into a solo flight, the second is worth retrying.
 * A number agreed in two places is a number that will disagree.
 */
export const SKY_FULL = 4200;

/**
 * What the server will believe about a player who has just landed.
 *
 * The descent is the one part of a session the server does not simulate —
 * the client alone knows where its fall ended — so the landing message is
 * taken on trust by design. Trust with no ceiling is a different thing
 * though: the same message carries the trail length, and a value taken on
 * faith is a score anyone can type into a console.
 *
 * Twelve seconds of falling past cores worth CORE_TRAIL_VALUE each does not
 * plausibly produce more than this, and it is a long way under the 350 cap
 * a good flight reaches. Generous enough that a genuinely brilliant descent
 * is never clipped, mean enough that nobody arrives as the Alpha.
 */
export const SPAWN = {
  maxTrailLength: 120,
} as const;
