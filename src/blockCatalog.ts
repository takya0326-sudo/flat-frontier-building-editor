export type BlockKind =
  | 'normal'
  | 'slab'
  | 'stairs'
  | 'wall'
  | 'fence'
  | 'door'
  | 'trapdoor'
  | 'fence_gate'
  | 'pane'
  | 'button'
  | 'pressure_plate'
  | 'wall_torch'
  | 'chain'
  | 'carpet'
  | 'bed'
  | 'sign'
  | 'hanging_sign'
  | 'wall_sign'
  | 'torch'
  | 'lantern'
  | 'plant'
  | 'crop'
  | 'liquid'
  | 'rail'
  | 'redstone'
  | 'decoration'
  | 'facing';

export type BlockOption = {
  id: string;
  label: string;
  nameJa: string;
  color: string;
  kind: BlockKind;
  category: string;
  defaultProperties?: Record<string, string>;
};

export type VanillaBlockData = {
  id: string;
  nameJa: string;
  category: string;
  kind: BlockKind;
  defaultProperties?: Record<string, string>;
};

export type MarkerOption = {
  id: `marker:${string}`;
  label: string;
  markerType: 'entrance' | 'road_connection' | 'npc_spawn' | 'shop_counter';
  color: string;
  category: 'マーカー';
};

export type CatalogItem =
  | ({ itemType: 'block' } & BlockOption)
  | ({ itemType: 'marker' } & MarkerOption);

export const markerCatalog: MarkerOption[] = [
  { id: 'marker:entrance', label: '入口', markerType: 'entrance', color: '#3b82f6', category: 'マーカー' },
  { id: 'marker:road_connection', label: '道路接続', markerType: 'road_connection', color: '#f59e0b', category: 'マーカー' },
  { id: 'marker:npc_spawn', label: 'NPC位置', markerType: 'npc_spawn', color: '#22c55e', category: 'マーカー' },
  { id: 'marker:shop_counter', label: 'カウンター', markerType: 'shop_counter', color: '#ec4899', category: 'マーカー' },
];

export const fallbackVanillaBlocks: BlockOption[] = [
  { id: 'minecraft:oak_planks', label: 'オークの板材', nameJa: 'オークの板材', color: '#b98246', kind: 'normal', category: '木材' },
  { id: 'minecraft:stone', label: '石', nameJa: '石', color: '#8a8e91', kind: 'normal', category: '石材' },
  { id: 'minecraft:cobblestone', label: '丸石', nameJa: '丸石', color: '#6f7478', kind: 'normal', category: '石材' },
  { id: 'minecraft:oak_slab', label: 'オークのハーフブロック', nameJa: 'オークのハーフブロック', color: '#c89255', kind: 'slab', category: 'ハーフブロック', defaultProperties: { type: 'bottom' } },
  { id: 'minecraft:oak_stairs', label: 'オークの階段', nameJa: 'オークの階段', color: '#c08347', kind: 'stairs', category: '階段', defaultProperties: { facing: 'south', half: 'bottom', shape: 'straight' } },
];

export const categoryOrder = [
  'すべて',
  '木材',
  '原木',
  '石材',
  '土・砂・自然',
  '鉱石・鉱物',
  'ガラス',
  'ハーフブロック',
  '階段',
  '壁',
  'フェンス',
  'ドア',
  'トラップドア',
  '装飾',
  '光源',
  '作業・収納',
  '植物',
  'Flat Frontier建材',
  '道路',
  'その他',
  'マーカー',
];
