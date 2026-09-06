"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store/useGameStore";
import { CONTROLS, MECHANICS, SUPPORT, THE_POINT } from "@/lib/world/howToPlay";

const SEEN_KEY = "shard-islands:seen-help";

/**
 * A question mark, and what is behind it.
 *
 * The version of this that does not get built is a modal on the landing
 * screen with a "do not show again" checkbox. That screen works precisely
 * because there is nothing to read on it — a pane of glass, a handprint,
 * and a word telling you not to press it. People press it out of
 * curiosity, and a tutorial in front of that turns a dare into a product
 * before anything has happened.
 *
 * So this never appears uninvited. It is a mark in the corner that opens a
 * page of text for the people who want one, which is the same bargain every
 * good game makes: teach by doing, and keep a reference for the rest.
 *
 * The one concession is a single pulse on a player's first visit, so that
 * the mark is noticed to exist. After that it never moves again.
 */
export default function HowToPlay() {
  const phase = useGameStore((s) => s.phase);
  const [open, setOpen] = useState(false);

  /**
   * Read once, as the initial state rather than in an effect.
   *
   * The whole Experience tree is client-only, so there is no server render
   * to disagree with — and answering "has this person been here before"
   * before the first paint avoids the mark pulsing for a beat at somebody
   * who has seen it a hundred times.
   */
  const [firstVisit, setFirstVisit] = useState(() => {
    try {
      return !localStorage.getItem(SEEN_KEY);
    } catch {
      // Private browsing, or storage refused. Nothing here matters enough
      // to be worth an error; the mark simply does not pulse.
      return false;
    }
  });

  const markSeen = () => {
    setFirstVisit(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // as above
    }
  };

  // Never on the glass. The landing screen has no text and keeps none.
  if (phase === "landing") return null;

  return (
    <>
      <button
        aria-label="How to play"
        onClick={() => {
          setOpen((v) => !v);
          markSeen();
        }}
        style={{
          position: "fixed",
          right: 18,
          // Clear of the control legend, which sits at bottom 16 and grew
          // taller when the barrel roll was added — the mark ended up
          // behind it, which is a poor showing for the one thing on screen
          // whose entire job is to be found.
          bottom: 186,
          // And above it in the stack, so no future row can bury it again.
          zIndex: 20,
          width: 34,
          height: 34,
          borderRadius: 17,
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontSize: 16,
          fontWeight: 700,
          color: "#eaf6ff",
          background: open
            ? "rgba(120,190,255,0.45)"
            : "rgba(38,74,112,0.72)",
          border: "1px solid rgba(170,220,255,0.65)",
          boxShadow: "0 0 14px rgba(90,170,255,0.35)",
          textShadow: "0 1px 6px rgba(0,0,0,0.6)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          animation: firstVisit ? "shardHelpPulse 2.4s ease-in-out 3" : undefined,
        }}
      >
        ?
      </button>

      <style>{`
        @keyframes shardHelpPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(140,210,255,0.0); }
          50%      { box-shadow: 0 0 0 9px rgba(140,210,255,0.18); }
        }
      `}</style>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(4,8,14,0.55)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            zIndex: 50,
            cursor: "pointer",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 460,
              width: "calc(100% - 40px)",
              maxHeight: "80vh",
              overflowY: "auto",
              padding: "22px 24px",
              borderRadius: 14,
              cursor: "default",
              background: "rgba(10,17,28,0.92)",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.5)",
              fontFamily:
                "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              color: "rgba(255,255,255,0.86)",
              fontSize: 13.5,
              lineHeight: 1.65,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: "#cfe9ff",
                marginBottom: 14,
              }}
            >
              {THE_POINT}
            </div>

            <Section title="Controls">
              {CONTROLS.map((c) => (
                <Row key={c.name} name={c.name} keys={c.keys} what={c.what} />
              ))}
            </Section>

            <Section title="What is out there">
              {MECHANICS.map((m) => (
                <Row key={m.name} name={m.name} what={m.what} />
              ))}
            </Section>

            {/* Only if there is somewhere to send them. */}
            {SUPPORT.url !== "" && (
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 13,
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    color: "#cfe9ff",
                  }}
                >
                  {SUPPORT.title}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 12,
                    lineHeight: 1.55,
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  {SUPPORT.why}
                </div>
                <a
                  href={SUPPORT.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 9,
                    padding: "5px 11px",
                    borderRadius: 7,
                    fontSize: 12,
                    letterSpacing: 0.4,
                    textDecoration: "none",
                    color: "rgba(255,225,170,0.95)",
                    background: "rgba(255,196,90,0.1)",
                    border: "1px solid rgba(255,205,120,0.35)",
                  }}
                >
                  {SUPPORT.action} →
                </a>
              </div>
            )}

            <button
              onClick={() => setOpen(false)}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "8px 0",
                borderRadius: 8,
                cursor: "pointer",
                color: "#fff",
                background: "rgba(120,190,255,0.18)",
                border: "1px solid rgba(255,255,255,0.22)",
                fontSize: 13,
                letterSpacing: 1,
              }}
            >
              Fly
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2.4,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ name, keys, what }: { name: string; keys?: string; what: string }) {
  return (
    <div style={{ marginBottom: 7 }}>
      <span style={{ color: "#fff", fontWeight: 600 }}>{name}</span>
      {keys && (
        <span
          style={{
            marginLeft: 7,
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: 11,
            background: "rgba(255,255,255,0.14)",
            border: "1px solid rgba(255,255,255,0.24)",
          }}
        >
          {keys}
        </span>
      )}
      <span style={{ color: "rgba(255,255,255,0.62)" }}> — {what}</span>
    </div>
  );
}
