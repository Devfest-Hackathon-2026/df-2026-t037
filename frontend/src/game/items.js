// 着替えのアイテム一覧（デザイン元：docs/design/Kisekae.dc.html）
// 今のデータ（growthExp・bond・志望大学）から入手済みかを判定できるものだけを並べる。
// 季節の着せかえ・教科マスター・図鑑の子が条件のものは、記録の仕組みができてから足す
import { ENDLESS, LEGEND } from './rules';
import { UNIVERSITIES } from './universities';

/** 場所（頭・首・胸・手・背中）＋エフェクト。rules.js の SLOTS と同じ並び */
export const SLOT_LABEL = { head: '頭', neck: '首', chest: '胸', hand: '手', back: '背中', effect: '効果' };

export const FILTERS = [
  { id: 'all', label: 'すべて', slots: null },
  { id: 'head', label: '頭', slots: ['head'] },
  { id: 'neck', label: '首・胸', slots: ['neck', 'chest'] },
  { id: 'hand', label: '手', slots: ['hand'] },
  { id: 'back', label: '背中', slots: ['back'] },
  { id: 'effect', label: 'エフェクト', slots: ['effect'] },
];

/**
 * 大学の装備（親密度3・5）をどこにつけるか。
 * 2つを同時につけると装備つきの絵になるので、同じ大学の2つは必ず別の場所にする
 */
const UNI_EQUIP_SLOT = {
  'akamon-bag': 'hand', 'ginkgo-badge': 'chest',
  labcoat: 'back', goggles: 'head',
  'rescue-helmet': 'head', 'probe-antenna': 'back',
  'fountain-pen': 'hand', 'red-bowtie': 'neck',
  soroban: 'hand', 'messenger-bag': 'back',
  backpack: 'back', globe: 'hand',
  'cheer-flag': 'back', megaphone: 'hand',
  wagasa: 'back', 'jiyu-fan': 'hand',
  'fossil-hammer': 'hand', loupe: 'neck',
};

const MEDALS = [
  { id: 'medal-bronze', name: '銅メダル', times: 1 },
  { id: 'medal-silver', name: '銀メダル', times: 2 },
  { id: 'medal-gold', name: '金メダル', times: 3 },
];

/**
 * 今の状態での着替えアイテム一覧。
 * 返す形：{ id, name, slot, owned, note, kind: 'normal' | 'legend', uniEquip?: 'lv3' | 'lv5' }
 */
export function buildItems({ universityId, growthExp, bond }) {
  const items = [];
  const exp = Math.max(0, Number(growthExp) || 0);
  const b = Math.max(0, Number(bond) || 0);

  // 大学の装備：今の子は親密度で解放。ほかの大学の分はロックとして見せる（Kisekae.dc.html と同じ）
  for (const u of UNIVERSITIES) {
    const mine = u.id === universityId;
    for (const [key, need, tag] of [['equipLv3', 3, 'lv3'], ['equipLv5', 5, 'lv5']]) {
      const eq = u[key];
      items.push({
        id: eq.id,
        name: eq.name,
        slot: UNI_EQUIP_SLOT[eq.id] || 'hand',
        owned: mine && b >= need,
        note: `${u.character}の親密度${need}`,
        kind: 'normal',
        uniEquip: mine ? tag : undefined,
      });
    }
  }

  // 記念メダル：5万EXPごと
  for (const m of MEDALS) {
    const need = ENDLESS.medalExp * m.times;
    items.push({
      id: m.id, name: m.name, slot: 'neck', owned: exp >= need,
      note: `育成EXP ${(need / 10000).toLocaleString('ja-JP')}万`, kind: 'normal',
    });
  }

  // エフェクト
  items.push(
    { id: 'gold-frame', name: '金のふち', slot: 'effect', owned: b >= 7, note: '今の子の親密度7', kind: 'normal' },
    { id: 'heart', name: 'ハート', slot: 'effect', owned: b >= 10, note: '今の子の親密度10', kind: 'normal' },
    { id: 'rainbow-aura', name: '虹のオーラ', slot: 'effect', owned: exp >= ENDLESS.medalExp * 4, note: '育成EXP 20万', kind: 'normal' },
  );

  // レジェンド：模試の成績などが条件。今は確認の仕組みがないので、すべてロック
  for (const l of LEGEND) {
    items.push({ id: l.id, name: l.name, slot: l.slot, owned: false, note: l.condition, kind: 'legend' });
  }

  return items;
}

/**
 * 記録のあとで新しく入手できた着替えの名前（親密度アップ・5万EXPごとのメダルなど）。
 * before / after は { growthExp, bond }。入手済みが増えたものだけを返す
 */
export function newlyUnlockedItems(universityId, before, after) {
  const had = new Set(
    buildItems({ universityId, growthExp: before.growthExp, bond: before.bond })
      .filter((i) => i.owned)
      .map((i) => i.id)
  );
  return buildItems({ universityId, growthExp: after.growthExp, bond: after.bond })
    .filter((i) => i.owned && !had.has(i.id))
    .map((i) => i.name);
}

/** 着替えで使う空の装備 */
export const emptyEquipped = () => ({ head: null, neck: null, chest: null, hand: null, back: null, effect: null });

/** 保存されている装備のうち、今も持っているものだけを残す */
export function sanitizeEquipped(equipped, items) {
  const owned = new Map(items.filter((i) => i.owned).map((i) => [i.id, i]));
  const out = emptyEquipped();
  if (equipped && typeof equipped === 'object') {
    for (const slot of Object.keys(out)) {
      const it = owned.get(equipped[slot]);
      if (it && it.slot === slot) out[slot] = it.id;
    }
  }
  return out;
}

/** 大学の装備2つ（親密度3・5）を両方つけていれば、装備つきの絵（{大学id}-equip.svg）で表示する */
export function wearsUniEquip(equipped, items) {
  const tags = new Set(
    Object.values(equipped || {})
      .map((id) => items.find((i) => i.id === id)?.uniEquip)
      .filter(Boolean)
  );
  return tags.has('lv3') && tags.has('lv5');
}
