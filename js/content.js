// Hero portrait: one cut-out photo shown as pixel blocks. Remake it with tools/portrait/cutout.swift
// (see README). Set to null for the drawn figure.
export const PORTRAIT = {
  src: 'assets/portrait.png',
  meta: 'assets/portrait.json',
  bottom: 0.62,        // use the photo down to this fraction of its height; the last rows dissolve
  height: 4.5,         // world units for that part of the photo
  yOffset: -0.42,
  // street-light colour fix: this box [u0, v0, u1, v1] (0..1 of the PNG) is white (the T-shirt),
  // and the cheeks should come out at this colour (measured on a daylight photo, IMG_1047)
  white: [0.3, 0.36, 0.62, 0.5],
  skinTarget: [146, 88, 70],
  saturation: 1.0,
};
// The work entries live in content.json (one file for the screens, the detail pages, the hidden
// readable layer and llms.txt). Edit it by hand and run tools/build.py, or use the page with ?edit.
export async function loadContent() {
  const res = await fetch('content.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`content.json: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.work) || !data.work.length) throw new Error('content.json has no work entries');
  return data;
}
