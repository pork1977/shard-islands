import * as THREE from "three";

/**
 * A word sprayed onto the glass.
 *
 * The landing screen was deliberately wordless — a frosted floor, one glowing
 * handprint, nothing to read. This keeps that: it is not a label, an
 * instruction or a button, it is graffiti somebody left on the wrong side of
 * the glass. One word, hand-angled, with the overspray and the drips that
 * come of holding a can too close.
 *
 * Drawn rather than typeset with a webfont on purpose: a font has to load,
 * and a page whose entire promise is that it opens instantly cannot have its
 * first impression waiting on a font.
 */
export function generateSprayTextTexture(
  text: string,
  size = 1024,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = Math.round(size * 0.42);
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // A condensed, heavy sans is what a stencil reads as. The stack is all
  // system faces, so nothing is fetched.
  const fontSize = Math.round(h * 0.62);
  ctx.font = `900 ${fontSize}px "Arial Black", "Helvetica Neue", Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const cx = w * 0.5;
  const cy = h * 0.5;

  // Overspray first: the same word, blurred and faint, so the edges look
  // sprayed rather than printed.
  ctx.save();
  ctx.filter = "blur(14px)";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(text, cx, cy);
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(text, cx, cy);

  // Break the paint up. A perfectly solid fill reads as vinyl lettering, and
  // the whole point is that somebody did this in a hurry.
  const flecks = Math.round(size * 2.2);
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < flecks; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 3.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.5})`;
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  // Speckle around the letters, where the can misted past the edge.
  const mist = Math.round(size * 0.9);
  for (let i = 0; i < mist; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.16})`;
    ctx.fill();
  }

  // A couple of runs, because the paint was laid on too thick.
  for (let i = 0; i < 3; i++) {
    const x = w * (0.28 + Math.random() * 0.44);
    const top = h * (0.5 + Math.random() * 0.12);
    const length = h * (0.08 + Math.random() * 0.22);
    const gradient = ctx.createLinearGradient(x, top, x, top + length);
    gradient.addColorStop(0, "rgba(255,255,255,0.5)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, top, 2 + Math.random() * 2.5, length);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
