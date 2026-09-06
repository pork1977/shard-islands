import { ImageResponse } from "next/og";

/**
 * The card that appears when somebody pastes the link.
 *
 * More important than any amount of search work for a launch like this,
 * because nobody is going to find this game by searching for it — they are
 * going to be handed the link on Product Hunt, in a Slack, in a reply. A
 * link with no card is a grey rectangle, and a grey rectangle is a link
 * nobody clicks.
 *
 * Drawn rather than photographed: a screenshot of a procedural world is a
 * screenshot of one particular moment in it, and this has to survive being
 * shrunk into a timeline. Glass, a handprint, a dare.
 */
export const runtime = "nodejs";
export const alt = "Shard Islands — a multiplayer flight game in your browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background:
            "linear-gradient(150deg, #16293c 0%, #24455e 45%, #0d1a28 100%)",
        }}
      >
        {/* the panes */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexWrap: "wrap",
            opacity: 0.5,
          }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 300,
                height: 210,
                border: "1px solid rgba(190,225,255,0.22)",
                display: "flex",
              }}
            />
          ))}
        </div>

        {/* the handprint's glow */}
        <div
          style={{
            position: "absolute",
            left: 600,
            top: 250,
            width: 320,
            height: 320,
            marginLeft: -160,
            marginTop: -160,
            borderRadius: 160,
            background: "radial-gradient(circle, rgba(150,240,255,0.55), rgba(150,240,255,0))",
            display: "flex",
          }}
        />

        <div
          style={{
            fontSize: 132,
            fontWeight: 900,
            letterSpacing: -2,
            color: "rgba(226,242,255,0.92)",
            textShadow: "0 6px 40px rgba(0,0,0,0.55)",
            display: "flex",
          }}
        >
          DON&apos;T
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 34,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "rgba(160,215,255,0.9)",
            display: "flex",
          }}
        >
          Shard Islands
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 25,
            color: "rgba(210,232,255,0.62)",
            display: "flex",
          }}
        >
          A multiplayer flight game. No sign-up, nothing to install.
        </div>
      </div>
    ),
    size,
  );
}
