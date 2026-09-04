import * as THREE from "three";

// Baked once at startup rather than evaluated per-pixel per-frame: the pebble
// pattern never changes, and a 9-cell Worley search in a fragment shader at
// full res is exactly the kind of cost mobile Safari can't absorb.
//
// Produces a tileable "rolled glass" height field (Worley F1 domes) plus a
// fine sandblast jitter, encoded as a normal map. The shader refracts light
// through these normals, which is what actually reads as glass — a flat tint
// reads as painted plaster no matter how the color is tuned.
export function generateFrostedGlassNormalTexture(size = 512, cells = 26): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);

  // one feature point per lattice cell, indices wrapped so the result tiles
  const points = new Float32Array(cells * cells * 2);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const i = (cy * cells + cx) * 2;
      points[i] = cx + Math.random();
      points[i + 1] = cy + Math.random();
    }
  }

  const height = new Float32Array(size * size);
  const scale = cells / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x * scale;
      const py = y * scale;
      const cx = Math.floor(px);
      const cy = Math.floor(py);

      let minDistSq = Number.MAX_VALUE;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const nx = cx + i;
          const ny = cy + j;
          const gx = ((nx % cells) + cells) % cells;
          const gy = ((ny % cells) + cells) % cells;
          const k = (gy * cells + gx) * 2;
          // shift the stored point out of its wrapped cell into this neighbour
          const fx = points[k] - gx + nx;
          const fy = points[k + 1] - gy + ny;
          const dx = fx - px;
          const dy = fy - py;
          const d = dx * dx + dy * dy;
          if (d < minDistSq) minDistSq = d;
        }
      }

      // domes centred on feature points -> rolled-glass pebbling
      const d = Math.sqrt(minDistSq);
      height[y * size + x] = Math.max(0, 1 - d * 1.6);
    }
  }

  const wrap = (v: number) => ((v % size) + size) % size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = height[y * size + wrap(x - 1)];
      const hR = height[y * size + wrap(x + 1)];
      const hD = height[wrap(y - 1) * size + x];
      const hU = height[wrap(y + 1) * size + x];

      // fine sandblast roughness on top of the rolled bumps
      const jitterX = (Math.random() - 0.5) * 0.35;
      const jitterY = (Math.random() - 0.5) * 0.35;

      let nx = (hL - hR) * 2.2 + jitterX;
      let ny = (hD - hU) * 2.2 + jitterY;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;

      const o = (y * size + x) * 4;
      image.data[o] = (nx * 0.5 + 0.5) * 255;
      image.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      image.data[o + 2] = (nz / len) * 255;
      image.data[o + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
