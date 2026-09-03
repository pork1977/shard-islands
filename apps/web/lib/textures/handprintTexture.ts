import * as THREE from "three";

// Procedural handprint glyph so phase 1 needs no external art asset yet — a
// stylized palm + five fingers drawn on an offscreen canvas and used as an
// alpha-masked glow texture on the "touch here" hotspot.
export function generateHandprintTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";

  const cx = size * 0.5;
  const palmCy = size * 0.62;
  const palmRx = size * 0.22;
  const palmRy = size * 0.26;

  // palm
  ctx.beginPath();
  ctx.ellipse(cx, palmCy, palmRx, palmRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // thumb (angled, shorter, off to one side)
  drawFinger(ctx, cx - palmRx * 0.95, palmCy - size * 0.02, size * 0.075, size * 0.22, -0.65);

  // four fingers, fanned slightly
  const fingerBaseY = palmCy - palmRy * 0.85;
  const fingerSpecs = [
    { dx: -0.62, len: 0.3, angle: -0.16 },
    { dx: -0.22, len: 0.37, angle: -0.05 },
    { dx: 0.2, len: 0.36, angle: 0.05 },
    { dx: 0.58, len: 0.28, angle: 0.16 },
  ];
  for (const f of fingerSpecs) {
    drawFinger(ctx, cx + f.dx * palmRx, fingerBaseY, size * 0.055, size * f.len, f.angle);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawFinger(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  radius: number,
  length: number,
  angle: number,
) {
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(angle);
  const r = radius;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(-r, -length + r);
  ctx.arc(0, -length + r, r, Math.PI, 0);
  ctx.lineTo(r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
