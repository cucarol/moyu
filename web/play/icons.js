// Roulette's item icons, drawn by hand on a 16x16 grid (no system emoji: they shrink to
// mush at table size). Each row is one line of pixels; each letter is a colour from the
// icon's palette, '.' is clear. itemIcon() returns a canvas, cached; scale it up with
// nearest-neighbour only.

const K = '#03110d'; // the outline every icon shares

const ART = {
  // 思维链: a thought cloud, three beats of thinking
  cot: {
    pal: { k: K, a: '#7dffc8', w: '#e6fff4' },
    rows: [
      '................',
      '...kkkk..kkkk...',
      '..kwwaakkaaaak..',
      '.kwaaaaaaaaaaak.',
      'kaaaaaaaaaaaaaak',
      'kaaaaaaaaaaaaaak',
      'kaakkaakkaakkaak',
      'kaakkaakkaakkaak',
      'kaaaaaaaaaaaaaak',
      '.kaaaaaaaaaaaak.',
      '..kkaaaakkaaak..',
      '...kkkkk.kkkk...',
      '..kk............',
      '.kaak...........',
      '.kaak...........',
      '..kk............',
    ],
  },
  // 幻觉 (a match's): an eye seeing things, sparkles round it
  mirage: {
    pal: { k: K, w: '#fbeaff', a: '#e08cff', d: '#7a3aa8', s: '#ffd6ff' },
    rows: [
      '.s..............',
      'sss..........s..',
      '.s..........sss.',
      '......kkkk...s..',
      '...kkkwwwwkkk...',
      '..kwwwddddwwwk..',
      '.kwwwdaaaadwwwk.',
      'kwwwdaaskaadwwwk',
      'kwwwdaakkaadwwwk',
      '.kwwwdaaaadwwwk.',
      '..kwwwddddwwwk..',
      '...kkkwwwwkkk...',
      '......kkkk......',
      '..s.............',
      '.sss............',
      '..s.............',
    ],
  },
  // /compact: two arrows pressing a slab flat
  compact: {
    pal: { k: K, a: '#9fd0ff', w: '#f0f8ff' },
    rows: [
      '......kkkk......',
      '......kaak......',
      '......kaak......',
      '...kkkkaakkkk...',
      '....kaaaaaak....',
      '.....kaaaak.....',
      '......kaak......',
      'kkkkkkkkkkkkkkkk',
      'kwwwwwwwwwwwwwwk',
      'kkkkkkkkkkkkkkkk',
      '......kaak......',
      '.....kaaaak.....',
      '....kaaaaaak....',
      '...kkkkaakkkk...',
      '......kaak......',
      '......kkkk......',
    ],
  },
  // 提示词注入: a syringe on the slant, needle down, loaded
  inject: {
    pal: { k: K, r: '#ff4fa0', w: '#e8f4ff', g: '#9aa8a6', n: '#f0f0f0' },
    rows: [
      '...........kk...',
      '..........kggk..',
      '........kk.kggk.',
      '.......kggkggggk',
      '........kggggkgk',
      '.......kwwggk.k.',
      '......kwwwwggk..',
      '.....kwrrwwkgk..',
      '....kwrrrwk.k...',
      '...kwrrrwk......',
      '...kgrrwk.......',
      '...kggwk........',
      '..knkkk.........',
      '.knk............',
      'knk.............',
      '.k..............',
    ],
  },
  // 温度拉满: a thermometer at the top in front of a fire
  temp: {
    pal: { k: K, r: '#ff3b30', w: '#ffe9c8', f: '#d8432a', o: '#ff9a3c', y: '#ffe066' },
    rows: [
      '..kk.......k....',
      '.krrk.....kfk...',
      '.krrk....kffk...',
      '.krrk....kfffkk.',
      '.krrk...kfffkkfk',
      '.krrk..kfffokkff',
      '.krrk..kffoofkff',
      '.krrk.kfffooffff',
      '.krrk.kffoooooff',
      '.krrk.kffooyooff',
      '.krrk.kfooyyyoff',
      '.krrk.kfoyyyyoff',
      'krwrrkkfoyyyyoff',
      'krrrrkkfooyyooff',
      '.krrk.kfffooofff',
      '..kk...kffffffkk',
    ],
  },
  // 429: a stop sign that says so
  limit: {
    pal: { k: K, a: '#ff8a5c', w: '#fff4ec' },
    rows: [
      '....kkkkkkkk....',
      '...kaaaaaaaak...',
      '..kaaaaaaaaaak..',
      '.kaaaaaaaaaaaak.',
      'kaaaaaaaaaaaaaak',
      'kaaaaaaaaaaaaaak',
      'kaawawawwwawwwak',
      'kaawawaaawawawak',
      'kaawwwawwwawwwak',
      'kaaawawaaaaaawak',
      'kaaawawwwawwwwak',
      'kaaaaaaaaaaaaaak',
      '.kaaaaaaaaaaaak.',
      '..kaaaaaaaaaak..',
      '...kaaaaaaaak...',
      '....kkkkkkkk....',
    ],
  },
  // 作为一个 AI 语言模型: a shield with AI on it
  refuse: {
    pal: { k: K, a: '#e8e2c8', d: '#5a5040', w: '#fffbea' },
    rows: [
      '..kkkkkkkkkkkk..',
      '..kwwaaaaaaaak..',
      '..kwaaaaaaaaak..',
      '..kaaaaaaaaaak..',
      '..kaadaadddaak..',
      '..kadadaadaaak..',
      '..kadddaadaaak..',
      '..kadadaadaaak..',
      '..kadadadddaak..',
      '..kaaaaaaaaaak..',
      '...kaaaaaaaak...',
      '....kaaaaaak....',
      '.....kaaaak.....',
      '......kaak......',
      '.......kk.......',
      '................',
    ],
  },
  // 缓存命中: a floppy disk with a plus on its label
  cache: {
    pal: { k: K, a: '#3fae5a', g: '#b8c4c0', w: '#effff0', p: '#1f7a34' },
    rows: [
      'kkkkkkkkkkkkk...',
      'kaaaggggggaakk..',
      'kaaaggkkggaaak..',
      'kaaaggkkggaaaak.',
      'kaaaggggggaaaaak',
      'kaaaaaaaaaaaaaak',
      'kaawwwwwwwwwwaak',
      'kaawwwwppwwwwaak',
      'kaawwwwppwwwwaak',
      'kaawwppppppwwaak',
      'kaawwppppppwwaak',
      'kaawwwwppwwwwaak',
      'kaawwwwppwwwwaak',
      'kaawwwwwwwwwwaak',
      'kaawwwwwwwwwwaak',
      'kkkkkkkkkkkkkkkk',
    ],
  },
  // 越狱: a padlock sprung open
  jailbreak: {
    pal: { k: K, a: '#d8d8e4', w: '#ff5fd2' },
    rows: [
      '.....kkkkkk.....',
      '....kaaaaaak....',
      '...kaakkkkaak...',
      '...kak....kak...',
      '...kak....kak...',
      '...kak..........',
      '...kak..........',
      '.kkkkkkkkkkkkk..',
      '.kwwwwwwwwwwwk..',
      '.kwwwwwkkwwwwk..',
      '.kwwwwkaakwwwk..',
      '.kwwwwwkkwwwwk..',
      '.kwwwwwkkwwwwk..',
      '.kwwwwwwwwwwwk..',
      '.kkkkkkkkkkkkk..',
      '................',
    ],
  },
};

const cache = new Map();

export function itemIcon(id) {
  if (cache.has(id)) return cache.get(id);
  const art = ART[id];
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  art?.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = art.pal[ch];
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  cache.set(id, c);
  return c;
}

export const ICON_IDS = Object.keys(ART);
