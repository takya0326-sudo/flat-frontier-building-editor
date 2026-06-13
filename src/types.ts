export type Vec3 = { x: number; y: number; z: number };

export type Direction = 'north' | 'east' | 'south' | 'west';

export type SlabType = 'bottom' | 'top' | 'double';

export type StairHalf = 'bottom' | 'top';

export type StairShape =
  | 'straight'
  | 'inner_left'
  | 'inner_right'
  | 'outer_left'
  | 'outer_right';

export type MarkerType =
  | 'entrance'
  | 'road_connection'
  | 'npc_spawn'
  | 'shop_counter';

export type BlockProperties = Record<string, string | boolean>;

export type Block = Vec3 & {
  block: string;
  properties?: BlockProperties;
};

export type Marker = Vec3 & {
  type: MarkerType;
};

export type BuildingTemplate = {
  building_id: string;
  building_type: string;
  level: number;
  display_name: string;
  size: Vec3;
  reserved_area: Vec3;
  default_direction: 'north' | 'south' | 'east' | 'west';
  markers: Marker[];
  blocks: Block[];
  required_materials: Record<string, number>;
  construction_time_ticks: number;
  instant_complete_fron: boolean;
};
