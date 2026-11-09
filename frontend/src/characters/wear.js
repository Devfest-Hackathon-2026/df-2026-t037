// 着替えでつけたアイテムを、キャラの絵に重ねる部品（レジェンド・ミシック・メダル・エフェクト）。
// 座標はキャラのSVGと同じ 160×160（体の中心 80,92・半径50）。
// back：体の後ろ（<g class="squish"> の前に入れる）／front：体の前（</svg> の直前に入れる）
// 大学の装備（親密度3・5）は、今までどおり ○○-equip.svg の絵で表す

const star = (cx, cy, r, fill, extra = '') => {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" ${extra}></polygon>`;
};

const heart = (x, y, s, fill, cls = '', delay = 0) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path class="${cls}" style="animation-delay:${delay}s" d="M0 3 C-6 -2 -5 -8 0 -5 C5 -8 6 -2 0 3 Z" fill="${fill}"></path></g>`;

const petal = (x, y, r, delay) =>
  `<g transform="translate(${x} ${y}) rotate(${r}) scale(1.6)"><path class="wear-fall" style="animation-delay:${delay}s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g>`;

const medal = (fill, dark, label) =>
  `<g class="wear-medal">` +
  `<path d="M72 112 L80 126 L88 112" fill="none" stroke="#5B8DEF" stroke-width="3.2" stroke-linejoin="round"></path>` +
  `<path d="M75 112 L80 121 L85 112" fill="none" stroke="#D0607A" stroke-width="1.4"></path>` +
  `<circle cx="80" cy="131" r="7.2" fill="${fill}" stroke="${dark}" stroke-width="1.4"></circle>` +
  `<text x="80" y="134" font-size="7" font-weight="900" text-anchor="middle" fill="${dark}" font-family="'M PLUS Rounded 1c', sans-serif">${label}</text>` +
  `</g>`;

export const WEAR = {
  // ===== レジェンド =====
  'a-crown': {
    front:
      `<g class="wear-crown" transform="translate(104 44) rotate(18) scale(1.35)">` +
      `<path d="M-14 6 L-14 -6 L-7 1 L0 -10 L7 1 L14 -6 L14 6 Z" fill="#F5C33B" stroke="#9A6A04" stroke-width="1.4" stroke-linejoin="round"></path>` +
      `<rect x="-14" y="4" width="28" height="5" rx="1.5" fill="#E0A21A" stroke="#9A6A04" stroke-width="1.2"></rect>` +
      `<circle cx="0" cy="-3" r="2.2" fill="#D0607A"></circle><circle cx="-8" cy="1" r="1.6" fill="#5B8DEF"></circle><circle cx="8" cy="1" r="1.6" fill="#3FAE7A"></circle>` +
      `<text x="0" y="8.4" font-size="5" font-weight="900" text-anchor="middle" fill="#7A4A04" font-family="'M PLUS Rounded 1c', sans-serif">A</text>` +
      `</g>` +
      `<path class="twinkle" d="M128 24 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" fill="#FFE07A"></path>`,
  },
  'comeback-wings': {
    back:
      `<g class="wear-wingL"><path d="M42 92 Q8 86 -6 46 Q12 58 20 48 Q16 66 30 66 Q18 76 34 80 Q24 86 44 84 Z" fill="#FFFFFF" stroke="#6F86B8" stroke-width="2.4" stroke-linejoin="round"></path>` +
      `<path d="M38 86 Q16 80 4 58 M36 78 Q22 72 16 60" fill="none" stroke="#9FB4D6" stroke-width="1.5" stroke-linecap="round"></path></g>` +
      `<g class="wear-wingR"><path d="M118 92 Q152 86 166 46 Q148 58 140 48 Q144 66 130 66 Q142 76 126 80 Q136 86 116 84 Z" fill="#FFFFFF" stroke="#6F86B8" stroke-width="2.4" stroke-linejoin="round"></path>` +
      `<path d="M122 86 Q144 80 156 58 M124 78 Q138 72 144 60" fill="none" stroke="#9FB4D6" stroke-width="1.5" stroke-linecap="round"></path></g>`,
  },
  star70: {
    front:
      `<g class="wear-star70">${star(80, 134, 11, '#F5C33B', 'stroke="#9A6A04" stroke-width="1.3" stroke-linejoin="round"')}` +
      `<text x="80" y="137" font-size="7" font-weight="900" text-anchor="middle" fill="#7A4A04" font-family="'M PLUS Rounded 1c', sans-serif">70</text></g>`,
  },
  // 流れ星：大きさとタイミングをずらして5つ流れる
  meteor: {
    front: [
      [150, 6, 1.0, 0], [128, -4, 0.7, 0.7], [160, 34, 0.85, 1.4], [110, 2, 0.6, 2.1], [156, 60, 0.7, 2.8],
    ].map(([x, y, k, d]) =>
      `<g class="wear-meteor" style="animation-delay:${d}s"><g transform="translate(${x} ${y}) scale(${k})">` +
      `<path d="M0 0 L-40 34" stroke="#FFE07A" stroke-width="4" stroke-linecap="round" opacity=".45"></path>` +
      `<path d="M0 0 L-30 25.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity=".9"></path>` +
      star(-40, 34, 7, '#FFE07A', 'stroke="#E0A21A" stroke-width="1.2"') +
      `</g></g>`
    ).join('') +
      star(24, 30, 2.4, '#FFF4C2', 'class="twinkle"') + star(140, 96, 2, '#FFF4C2', 'class="twinkle" style="animation-delay:.8s"'),
  },
  'sun-aura': {
    back:
      `<g class="wear-sun"><circle cx="80" cy="92" r="62" fill="#FFD27A" opacity=".22"></circle>` +
      Array.from({ length: 12 }, (_, i) => {
        const a = (Math.PI / 6) * i;
        const x1 = 80 + 56 * Math.cos(a), y1 = 92 + 56 * Math.sin(a);
        const x2 = 80 + 70 * Math.cos(a), y2 = 92 + 70 * Math.sin(a);
        return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#F5A623" stroke-width="4" stroke-linecap="round" opacity=".7"></path>`;
      }).join('') +
      `</g>`,
  },

  // ===== ミシック（最上級のエフェクト） =====
  // ===== ミシック（最上級のエフェクト）：レジェンドより大きく・常に動く =====
  phoenix: {
    back:
      `<circle class="wear-pulse" cx="80" cy="92" r="70" fill="#FF9A2E" opacity=".14"></circle>` +
      `<circle class="wear-pulse" style="animation-delay:.6s" cx="80" cy="92" r="58" fill="none" stroke="#FFB648" stroke-width="3" opacity=".6"></circle>` +
      `<g class="wear-flapL"><path d="M60 106 Q14 102 -6 40 Q20 58 24 32 Q38 66 46 44 Q46 78 66 90 Z" fill="#FF5A1F"></path>` +
      `<path d="M58 102 Q24 96 8 54 Q28 66 32 48 Q42 76 62 88 Z" fill="#FF9A2E"></path>` +
      `<path d="M56 98 Q34 92 22 70 Q36 76 40 66 Q46 82 60 88 Z" fill="#FFE07A"></path></g>` +
      `<g class="wear-flapR"><path d="M100 106 Q146 102 166 40 Q140 58 136 32 Q122 66 114 44 Q114 78 94 90 Z" fill="#FF5A1F"></path>` +
      `<path d="M102 102 Q136 96 152 54 Q132 66 128 48 Q118 76 98 88 Z" fill="#FF9A2E"></path>` +
      `<path d="M104 98 Q126 92 138 70 Q124 76 120 66 Q114 82 100 88 Z" fill="#FFE07A"></path></g>`,
    front: `<circle class="wear-ember" style="animation-delay:0s" cx="26" cy="96" r="2.2" fill="#FFB648"></circle><circle class="wear-ember" style="animation-delay:0.4s" cx="134" cy="96" r="2" fill="#FF7A2C"></circle><circle class="wear-ember" style="animation-delay:0.9s" cx="46" cy="120" r="1.8" fill="#FFD27A"></circle><circle class="wear-ember" style="animation-delay:1.3s" cx="116" cy="118" r="2.2" fill="#FFB648"></circle><circle class="wear-ember" style="animation-delay:1.7s" cx="16" cy="70" r="1.6" fill="#FF7A2C"></circle><circle class="wear-ember" style="animation-delay:0.2s" cx="146" cy="66" r="1.8" fill="#FFD27A"></circle><circle class="wear-ember" style="animation-delay:2.1s" cx="64" cy="130" r="1.5" fill="#FF9A2E"></circle><circle class="wear-ember" style="animation-delay:0.6s" cx="98" cy="132" r="1.7" fill="#FFB648"></circle><circle class="wear-ember" style="animation-delay:1.5s" cx="80" cy="40" r="1.6" fill="#FFD27A"></circle>`,
  },
  aurora: {
    back:
      `<defs><linearGradient id="wear-aur-a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5CF2C2"/><stop offset=".5" stop-color="#6FC8FF"/><stop offset="1" stop-color="#B78CFF"/></linearGradient>` +
      `<linearGradient id="wear-aur-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF9AD5"/><stop offset=".5" stop-color="#9B8CFF"/><stop offset="1" stop-color="#5CF2C2"/></linearGradient></defs>` +
      `<ellipse class="wear-pulse" cx="80" cy="40" rx="86" ry="44" fill="#8FE8FF" opacity=".25"></ellipse>` +
      `<path class="wear-aurora" d="M-10 30 Q30 -4 70 26 Q110 56 170 14 L170 44 Q110 84 70 52 Q30 24 -10 60 Z" fill="url(#wear-aur-a)" opacity=".7"></path>` +
      `<path class="wear-aurora" style="animation-delay:-1.4s" d="M-10 58 Q36 28 80 52 Q124 76 170 40 L170 60 Q124 96 80 70 Q36 48 -10 80 Z" fill="url(#wear-aur-b)" opacity=".55"></path>` +
      `<path class="wear-aurora" style="animation-delay:-2.6s" d="M-10 12 Q40 -14 84 8 Q128 30 170 0 L170 16 Q128 48 84 24 Q40 4 -10 30 Z" fill="url(#wear-aur-a)" opacity=".45"></path>`,
    front:
      [[18, 18, 3.4, 0], [140, 26, 3, 0.5], [124, 8, 2.4, 1.0], [40, 4, 2.2, 1.5], [150, 70, 2.6, 0.3], [10, 64, 2.4, 1.2], [96, 2, 2, 0.8], [62, 14, 1.8, 1.8]]
        .map(([x, y, r, d]) => star(x, y, r, '#FFFFFF', `class="wear-sparkle" style="animation-delay:${d}s"`)).join(''),
  },
  sakura: {
    back: `<circle class="wear-pulse" cx="80" cy="92" r="66" fill="#FFD3DE" opacity=".35"></circle>`,
    front:
      `<g transform="translate(14 6) rotate(20) scale(1.8)"><path class="wear-fall" style="animation-delay:0s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(40 -6) rotate(80) scale(1.4)"><path class="wear-fall" style="animation-delay:0.5s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(66 4) rotate(140) scale(2)"><path class="wear-fall" style="animation-delay:1.0s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(96 -4) rotate(200) scale(1.5)"><path class="wear-fall" style="animation-delay:1.5s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(122 8) rotate(260) scale(1.9)"><path class="wear-fall" style="animation-delay:2.0s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(148 -2) rotate(30) scale(1.4)"><path class="wear-fall" style="animation-delay:2.5s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(28 30) rotate(110) scale(1.2)"><path class="wear-fall" style="animation-delay:3.0s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(136 26) rotate(170) scale(1.6)"><path class="wear-fall" style="animation-delay:3.4s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(86 16) rotate(60) scale(1.3)"><path class="wear-fall" style="animation-delay:0.25s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(54 22) rotate(240) scale(1.7)"><path class="wear-fall" style="animation-delay:1.25s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(110 30) rotate(300) scale(1.2)"><path class="wear-fall" style="animation-delay:2.25s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g><g transform="translate(4 40) rotate(330) scale(1.5)"><path class="wear-fall" style="animation-delay:3.7s" d="M0 0 C3 -3 6 -1 5 3 C3 5 0 4 0 0 Z" fill="#FFB7C8" stroke="#F48FAA" stroke-width=".4"></path></g>` +
      `<g><g transform="translate(22 128) scale(1.3)"><g class="wear-bloom-in"><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(0)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(72)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(144)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(216)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(288)"></ellipse><circle r="1.8" fill="#F5C33B"></circle></g></g><g transform="translate(140 124) scale(1.1)"><g class="wear-bloom-in"><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(0)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(72)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(144)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(216)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(288)"></ellipse><circle r="1.8" fill="#F5C33B"></circle></g></g><g transform="translate(132 40) scale(0.9)"><g class="wear-bloom-in"><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(0)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(72)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(144)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(216)"></ellipse><ellipse cx="0" cy="-4" rx="3" ry="4.4" fill="#FFC9D6" stroke="#F48FAA" stroke-width=".5" transform="rotate(288)"></ellipse><circle r="1.8" fill="#F5C33B"></circle></g></g></g>`,
  },

  // ===== メダル・エフェクト =====
  'medal-bronze': { front: medal('#E3A36B', '#8A5426', '5') },
  'medal-silver': { front: medal('#E4E8EE', '#7A8494', '10') },
  'medal-gold': { front: medal('#F5C33B', '#9A6A04', '15') },
  'gold-frame': { back: `<circle cx="80" cy="92" r="58" fill="none" stroke="#F2C230" stroke-width="3" opacity=".8"></circle><circle cx="80" cy="92" r="62" fill="none" stroke="#FFE7A0" stroke-width="1.5" stroke-dasharray="2 4"></circle>` },
  heart: { front: heart(28, 50, 1.1, '#FF8FA3', 'wear-float', 0) + heart(134, 44, 0.9, '#FF6F8E', 'wear-float', 0.8) + heart(140, 80, 0.7, '#FFB0BE', 'wear-float', 1.5) },
  'rainbow-aura': {
    back: `<circle cx="80" cy="92" r="64" fill="none" stroke="#FF8FA3" stroke-width="3" opacity=".5"></circle><circle cx="80" cy="92" r="60" fill="none" stroke="#F5C33B" stroke-width="3" opacity=".5"></circle><circle cx="80" cy="92" r="56" fill="none" stroke="#7FD08A" stroke-width="3" opacity=".5"></circle><circle cx="80" cy="92" r="52.5" fill="none" stroke="#7FB2F0" stroke-width="2.5" opacity=".5"></circle>`,
  },
};

/** 装備（{ head, neck, ... }）から、重ねる絵を集める */
export function wearLayers(equipped) {
  const back = [];
  const front = [];
  if (equipped && typeof equipped === 'object') {
    for (const id of Object.values(equipped)) {
      const w = id && WEAR[id];
      if (!w) continue;
      if (w.back) back.push(w.back);
      if (w.front) front.push(w.front);
    }
  }
  return { back: back.join(''), front: front.join('') };
}

// 進化の段階ごとの体の中心と大きさ（たまご・1回目の進化は体が小さく下にある）。
// 絵は最終進化（中心 80,92・半径50）で描いてあるので、段階に合わせて縮めて動かす
const BODY = { 1: { cx: 80, cy: 112, k: 0.64 }, 2: { cx: 80, cy: 100, k: 0.8 }, 3: { cx: 80, cy: 92, k: 1 } };
const fit = (layer, stage) => {
  const b = BODY[stage] || BODY[3];
  return b.k === 1 ? layer : `<g transform="translate(${b.cx} ${b.cy}) scale(${b.k}) translate(-80 -92)">${layer}</g>`;
};

// ===== 学年の小物（高1はそのまま・高2は学年章のバッジ・高3は必勝の鉢巻） =====
// 図鑑で「同じキャラでも学年で見た目がちがう」ことが分かるように、着替えとは別に重ねる
// 東大の銀杏バッジ（60,126）をつけた絵は、学年章はその左に小さくずらす
const BADGE_AT = { 'todai-equip': 'translate(41 117) scale(.82)', 'todai-lv5': 'translate(41 117) scale(.82)' };
const gradeBadge = (at = 'translate(52 116)') =>
  `<g class="grade-badge" transform="${at}">` +
  `<path d="M0 -9 L8 -5 L8 3 Q8 8 0 11 Q-8 8 -8 3 L-8 -5 Z" fill="#3D5A99" stroke="#F5C33B" stroke-width="1.8" stroke-linejoin="round"></path>` +
  `<text x="0" y="4.6" font-size="10" font-weight="900" text-anchor="middle" fill="#FFFFFF" font-family="'M PLUS Rounded 1c', sans-serif">Ⅱ</text>` +
  `<path class="twinkle" d="M7 -11 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1z" fill="#FFE07A"></path>` +
  `</g>`;
const HACHIMAKI =
  `<g class="grade-hachimaki">` +
  // 結び目のうしろで風になびく2本のはし
  `<path class="hachi-tail" d="M121 63 Q133 58 142 64 Q134 66 123 67 Z" fill="#FFFFFF" stroke="#D9DAE6" stroke-width="1"></path>` +
  `<path class="hachi-tail2" d="M121 66 Q132 70 138 79 Q129 76 121 70 Z" fill="#FFFFFF" stroke="#D9DAE6" stroke-width="1"></path>` +
  // 額にまいた帯（体の丸にそって少し曲げる）
  `<path d="M43 57 Q80 49 117 57 L123 68 Q80 61 37 68 Z" fill="#FFFFFF" stroke="#D9DAE6" stroke-width="1.2" stroke-linejoin="round"></path>` +
  `<circle cx="80" cy="60.5" r="5.6" fill="#E5484D"></circle>` +
  `<text x="64" y="64.4" font-size="7.4" font-weight="900" text-anchor="middle" fill="#C8102E" font-family="'M PLUS Rounded 1c', sans-serif">必</text>` +
  `<text x="96" y="64.4" font-size="7.4" font-weight="900" text-anchor="middle" fill="#C8102E" font-family="'M PLUS Rounded 1c', sans-serif">勝</text>` +
  `<ellipse cx="121" cy="64.5" rx="3.6" ry="4.2" fill="#FFFFFF" stroke="#D9DAE6" stroke-width="1"></ellipse>` +
  `</g>`;
/** 学年の小物の絵（高1・学年なしは空）。look：{ uni, variant }（装備つきの絵とかぶらない位置にする） */
export function gradeLayer(grade, look = {}) {
  if (grade === '高校2年生') return gradeBadge(BADGE_AT[`${look.uni}-${look.variant}`]);
  if (grade === '高校3年生') return HACHIMAKI;
  return '';
}

/**
 * SVG文字列に重ねる（後ろは体のグループの前、前は </svg> の直前）。stage で位置と大きさを合わせる。
 * grade：学年の小物（高2のバッジ・高3の鉢巻）。着替えより先（下）に重ねる
 */
export function withWear(svg, equipped, stage = 3, grade = null, look = {}) {
  const layers = wearLayers(equipped);
  const back = layers.back;
  const front = gradeLayer(grade, look) + layers.front;
  if (!back && !front) return svg;
  let out = svg;
  if (back) {
    const i = out.indexOf('<g class="squish"');
    const at = i >= 0 ? i : out.indexOf('>') + 1;
    out = `${out.slice(0, at)}<g class="tama-wear-back">${fit(back, stage)}</g>${out.slice(at)}`;
  }
  if (front) {
    const end = out.lastIndexOf('</svg>');
    if (end >= 0) out = `${out.slice(0, end)}<g class="tama-wear-front">${fit(front, stage)}</g>${out.slice(end)}`;
  }
  return out;
}
