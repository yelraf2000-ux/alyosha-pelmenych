// The product illustrations, drawn as SVG. build.mjs turns them into the web files.
//
// These are drawings, on purpose: a drawing cannot be mistaken for a photo of the real food.
// Everything is drawn in the logo's manner: warm-brown outlines, cream dough, flat colour.
// A picture placed in incoming/ under the product's slug is used instead of its drawing.
//
// To add a product: add its slug to PRODUCTS below and run `node scripts/product-art/build.mjs`.

const LINE = '#7a4a1e';
const OUTLINE = `stroke="${LINE}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
const DETAIL = `fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;

// ---------- Dumplings (drawn around 0,0, about 100 units wide) ----------

const DUMPLINGS = {
  pelmeni: `
    <path d="M-42,6 C-46,-28 -20,-44 0,-44 C20,-44 46,-28 42,6 C40,26 21,36 9,27 C5,33 -5,33 -9,27 C-21,36 -40,26 -42,6 Z" fill="url(#dough)" ${OUTLINE}/>
    <g ${DETAIL}>
      <path d="M0,25 C-2,10 -10,-4 -22,-12"/><path d="M0,25 C0,8 0,-6 0,-20"/><path d="M0,25 C2,10 10,-4 22,-12"/>
      <path d="M-9,26 C-16,18 -24,12 -32,10"/><path d="M9,26 C16,18 24,12 32,10"/>
    </g>`,
  manty: `
    <path d="M0,-42 C26,-40 44,-22 44,4 C44,28 24,40 0,40 C-24,40 -44,28 -44,4 C-44,-22 -26,-40 0,-42 Z" fill="url(#dough)" ${OUTLINE}/>
    <g ${DETAIL}>
      <path d="M-24,-20 C-10,-8 10,-8 24,-20"/><path d="M-24,22 C-10,10 10,10 24,22"/>
      <path d="M-22,-18 C-10,-6 -10,8 -22,20"/><path d="M22,-18 C10,-6 10,8 22,20"/>
      <path d="M-6,1 L6,1"/><path d="M0,-5 L0,7"/>
    </g>`,
  khinkali: `
    <path d="M0,-44 C-9,-44 -11,-33 -8,-25 C-32,-20 -48,0 -48,17 C-48,34 -25,42 0,42 C25,42 48,34 48,17 C48,0 32,-20 8,-25 C11,-33 9,-44 0,-44 Z" fill="url(#dough)" ${OUTLINE}/>
    <g ${DETAIL}>
      <path d="M-6,-22 C-14,-8 -26,4 -37,12"/><path d="M-3,-22 C-7,-4 -13,10 -18,25"/><path d="M0,-22 L0,28"/>
      <path d="M3,-22 C7,-4 13,10 18,25"/><path d="M6,-22 C14,-8 26,4 37,12"/>
    </g>`,
};

/** Twelve small pelmeni in a loose pile: a ring of eight, three inside, one on top. */
function pile() {
  const ring = Array.from({ length: 8 }, (_, i) => {
    const angle = ((i * 45 + 22.5) * Math.PI) / 180;
    return { x: 146 * Math.cos(angle), y: 100 * Math.sin(angle), scale: 0.86, turn: [-14, 9, -6, 16, -11, 7, -17, 12][i] };
  });
  const inside = [
    { x: -58, y: -18, scale: 0.9, turn: -8 },
    { x: 58, y: -18, scale: 0.9, turn: 10 },
    { x: 0, y: 34, scale: 0.92, turn: -4 },
    { x: 0, y: -44, scale: 0.96, turn: 5, lift: true },
  ];
  // Farther pieces first, so nearer ones overlap them; the top one goes last.
  return [...ring, ...inside].sort((a, b) => Number(a.lift ?? false) - Number(b.lift ?? false) || a.y - b.y);
}

/** Six large pieces in a ring. */
function ring(scale) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = ((i * 60 + 30) * Math.PI) / 180;
    return { x: 138 * Math.cos(angle), y: 98 * Math.sin(angle), scale, turn: [-7, 5, -4, 8, -6, 4][i] };
  }).sort((a, b) => a.y - b.y);
}

// ---------- Hints of the filling, shown beside the plate (drawn around 0,0) ----------

const meat = (fill, fat) => `
  <path d="M-52,-8 C-56,-38 -16,-46 14,-40 C46,-34 58,-10 50,16 C42,40 4,44 -24,36 C-46,30 -50,12 -52,-8 Z" fill="${fill}" ${OUTLINE}/>
  <path d="M-40,-16 C-38,-30 -14,-35 10,-31" fill="none" stroke="${fat}" stroke-width="7" stroke-linecap="round"/>
  <path d="M-20,8 C-6,2 12,6 24,16" fill="none" stroke="${fat}" stroke-width="3" stroke-linecap="round" opacity=".8"/>`;

const peppercorns = (x, y) =>
  [[0, 0], [17, -10], [9, 14]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="6.5" fill="#3a2a22" ${OUTLINE}/>`).join('');

const HINTS = {
  chicken: `
    <g transform="rotate(-32)">
      <path d="M26,-9 L74,-7 L74,7 L26,9 Z" fill="#fff8ea" ${OUTLINE}/>
      <circle cx="80" cy="-9" r="10" fill="#fff8ea" ${OUTLINE}/><circle cx="80" cy="9" r="10" fill="#fff8ea" ${OUTLINE}/>
      <path d="M-50,0 C-50,-36 -8,-42 22,-22 C36,-13 40,-7 40,0 C40,7 36,13 22,22 C-8,42 -50,36 -50,0 Z" fill="#e3a65c" ${OUTLINE}/>
      <path d="M-32,-14 C-20,-25 -2,-25 10,-18" fill="none" stroke="#f7cf95" stroke-width="6" stroke-linecap="round"/>
    </g>`,
  beef: `${meat('#c9483b', '#fff1df')}${peppercorns(44, 46)}`,
  porkAndBeef: `
    <g transform="translate(-34,-16) scale(.78)">${meat('#f3a9a2', '#fff6ee')}</g>
    <g transform="translate(34,18) scale(.78)">${meat('#c9483b', '#fff1df')}</g>
    ${peppercorns(-52, 44)}`,
  cheeseAndCream: `
    <g transform="translate(-30,8)">
      <path d="M-46,22 L30,-30 L46,-12 L46,24 Z" fill="#ffd257" ${OUTLINE}/>
      <path d="M30,-30 L46,-12" ${DETAIL}/><path d="M-46,22 L46,-12" ${DETAIL} opacity=".5"/>
      <circle cx="6" cy="10" r="6" fill="#f0b53a"/><circle cx="28" cy="4" r="4.5" fill="#f0b53a"/><circle cx="-16" cy="16" r="4" fill="#f0b53a"/>
    </g>
    <g transform="translate(46,-4)">
      <path d="M-18,-26 L18,-26 L22,-34 L26,-26 L20,-18 C26,-4 24,22 16,30 L-16,30 C-24,22 -26,-4 -20,-18 Z" fill="#ffffff" ${OUTLINE}/>
      <path d="M20,-12 C36,-12 36,12 20,14" fill="none" ${OUTLINE}/>
      <path d="M-16,-17 C-6,-12 6,-12 17,-17" fill="none" stroke="#f3e2bd" stroke-width="6" stroke-linecap="round"/>
    </g>`,
  shrimp: [[-26, -6, -18], [34, 22, 150]].map(([x, y, turn]) => `
    <g transform="translate(${x},${y}) rotate(${turn}) scale(.92)">
      <path d="M-34,22 C-50,-22 -8,-50 30,-32 C44,-25 48,-9 41,2 C32,-12 10,-20 -4,-8 C-15,2 -13,17 -6,28 Z" fill="#f7a08c" ${OUTLINE}/>
      <path d="M-6,28 L-22,42 L-28,26 Z" fill="#f47f6b" ${OUTLINE}/>
      <g ${DETAIL}><path d="M-24,-8 L-10,2"/><path d="M-12,-28 L-2,-12"/><path d="M10,-36 L12,-19"/></g>
      <circle cx="33" cy="-14" r="3.5" fill="${LINE}"/>
    </g>`).join(''),
  herbs: `
    <g fill="none" stroke="#4f8a45" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M-20,44 C-18,10 -8,-20 6,-44"/>
      <path d="M-17,18 L-40,0"/><path d="M-13,0 L-34,-22"/><path d="M-7,-16 L-22,-40"/>
      <path d="M-15,12 L6,2"/><path d="M-10,-6 L12,-14"/><path d="M-3,-24 L18,-34"/>
    </g>
    <g transform="translate(38,22)">
      <path d="M0,24 L0,2" fill="none" stroke="#4f8a45" stroke-width="5" stroke-linecap="round"/>
      <path d="M0,4 C-22,6 -30,-10 -20,-22 C-18,-32 -4,-34 0,-24 C4,-34 18,-32 20,-22 C30,-10 22,6 0,4 Z" fill="#6fb25f" stroke="#3f7437" stroke-width="4" stroke-linejoin="round"/>
    </g>`,
};

const beefWithHerbs = `<g transform="translate(-28,-6) scale(.86)">${HINTS.beef}</g><g transform="translate(46,-22) scale(.7)">${HINTS.herbs}</g>`;

// ---------- The picture ----------

const BACKGROUNDS = {
  pelmeni: ['#f4f9fc', '#d4e7f3'],
  manty: ['#fdf5f0', '#f3d6c8'],
  khinkali: ['#f8f5fd', '#ddd4f1'],
};

function picture(kind, pieces, hint) {
  const [light, dark] = BACKGROUNDS[kind];
  const cx = 350;
  const cy = 300;
  const drawn = pieces
    .map((p) => `<g transform="translate(${(cx + p.x).toFixed(1)},${(cy + p.y - (p.lift ? 10 : 0)).toFixed(1)}) rotate(${p.turn}) scale(${p.scale})">${DUMPLINGS[kind]}</g>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img">
  <defs>
    <radialGradient id="bg" cx="35%" cy="25%" r="95%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
    <radialGradient id="dough" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#fff3d6"/><stop offset=".6" stop-color="#f3d6a0"/><stop offset="1" stop-color="#dfb673"/></radialGradient>
    <radialGradient id="plate" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".72" stop-color="#ffffff"/><stop offset="1" stop-color="#efe8dd"/></radialGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <ellipse cx="${cx + 8}" cy="${cy + 26}" rx="262" ry="212" fill="#2b2520" opacity=".12"/>
  <ellipse cx="${cx}" cy="${cy}" rx="262" ry="212" fill="url(#plate)" ${OUTLINE}/>
  <ellipse cx="${cx}" cy="${cy}" rx="214" ry="168" fill="none" stroke="#e6dccd" stroke-width="3"/>
${drawn}
  <g transform="translate(668,462) scale(1.3)">${hint}</g>
</svg>
`;
}

const PRODUCTS = {
  'pelmeni-kurinye-iz-bedra': ['pelmeni', pile(), HINTS.chicken],
  'pelmeni-kurinye-slivochno-syrnye': ['pelmeni', pile(), HINTS.cheeseAndCream],
  'pelmeni-kurinye-s-krevetkoy': ['pelmeni', pile(), HINTS.shrimp],
  'pelmeni-govyazhi': ['pelmeni', pile(), HINTS.beef],
  'pelmeni-govyazhi-s-zelenyu': ['pelmeni', pile(), beefWithHerbs],
  'manty-kurinye': ['manty', ring(1.16), HINTS.chicken],
  'manty-govyazhi': ['manty', ring(1.16), HINTS.beef],
  'hinkali-govyazhi': ['khinkali', ring(1.12), HINTS.beef],
  'hinkali-svino-govyazhi': ['khinkali', ring(1.12), HINTS.porkAndBeef],
};

/** slug -> SVG text of that product's illustration. */
export function drawIllustrations() {
  return new Map(Object.entries(PRODUCTS).map(([slug, [kind, pieces, hint]]) => [slug, picture(kind, pieces, hint)]));
}
