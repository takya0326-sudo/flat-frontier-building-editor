import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Edges, Grid } from '@react-three/drei';
import {
  Box,
  ClipboardCopy,
  Download,
  Eraser,
  Eye,
  FileUp,
  MapPin,
  MousePointer2,
  RotateCcw,
} from 'lucide-react';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import * as THREE from 'three';
import type {
  Block,
  BlockProperties,
  BuildingTemplate,
  Direction,
  Marker,
  MarkerType,
  SlabType,
  StairHalf,
  StairShape,
  Vec3,
} from './types';
import {
  categoryOrder,
  fallbackVanillaBlocks,
  markerCatalog,
  type BlockOption,
  type CatalogItem,
  type VanillaBlockData,
} from './blockCatalog';
import { flatFrontierBlocks } from './data/flatFrontierBlocks';

type EditMode = 'select' | 'block' | 'erase' | 'marker';
type ViewPreset = 'diagonal' | 'top' | 'front';
type TextureMap = Map<string, THREE.Texture>;

const directionLabels: Record<Direction, string> = {
  north: '北',
  east: '東',
  south: '南',
  west: '西',
};

const slabLabels: Record<SlabType, string> = {
  bottom: '下付き',
  top: '上付き',
  double: '二重',
};

const halfLabels: Record<StairHalf, string> = {
  bottom: '下付き',
  top: '上付き',
};

const shapeLabels: Record<StairShape, string> = {
  straight: '直線',
  inner_left: '内側左',
  inner_right: '内側右',
  outer_left: '外側左',
  outer_right: '外側右',
};

const defaultTemplate: BuildingTemplate = {
  building_id: 'sample_building',
  building_type: 'general',
  level: 1,
  display_name: '',
  size: { x: 5, y: 5, z: 5 },
  reserved_area: { x: 7, y: 5, z: 7 },
  default_direction: 'south',
  markers: [],
  blocks: [],
  required_materials: {},
  construction_time_ticks: 2400,
  instant_complete_fron: false,
};

const keyOf = (position: Vec3) => `${position.x}:${position.y}:${position.z}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeInt = (value: number, min = 0, max = 128) => clamp(Math.round(value || 0), min, max);
const staticBlockCatalog = [...fallbackVanillaBlocks, ...flatFrontierBlocks];

function App() {
  const [template, setTemplate] = useState<BuildingTemplate>(() => normalizeTemplate(defaultTemplate));
  const [selectedBlockId, setSelectedBlockId] = useState('minecraft:oak_planks');
  const [mode, setMode] = useState<EditMode>('block');
  const [selectedMarker, setSelectedMarker] = useState<MarkerType>('entrance');
  const [slabType, setSlabType] = useState<SlabType>('bottom');
  const [stairFacing, setStairFacing] = useState<Direction>('south');
  const [stairHalf, setStairHalf] = useState<StairHalf>('bottom');
  const [stairShape, setStairShape] = useState<StairShape>('straight');
  const [buttonFace, setButtonFace] = useState('wall');
  const [buttonFacing, setButtonFacing] = useState<Direction>('south');
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [blockQuery, setBlockQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('すべて');
  const [vanillaBlocks, setVanillaBlocks] = useState<BlockOption[]>(fallbackVanillaBlocks);
  const [vanillaBlockCount, setVanillaBlockCount] = useState(fallbackVanillaBlocks.length);
  const [previewPosition, setPreviewPosition] = useState<Vec3 | null>(null);
  const [viewPreset, setViewPreset] = useState<ViewPreset>('diagonal');
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [jsonText, setJsonText] = useState('');
  const [message, setMessage] = useState('空きマスをクリックするとブロックを配置できます。');
  const [textureMap, setTextureMap] = useState<TextureMap>(() => new Map());
  const [textureStatus, setTextureStatus] = useState('テクスチャ未読込');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textureInputRef = useRef<HTMLInputElement | null>(null);
  const textureObjectUrlsRef = useRef<string[]>([]);

  const normalizedTemplate = useMemo(() => normalizeTemplate(template), [template]);
  const blockCatalog = useMemo(() => [...vanillaBlocks, ...flatFrontierBlocks], [vanillaBlocks]);
  const catalogItems = useMemo<CatalogItem[]>(() => [
    ...blockCatalog.map((block) => ({ ...block, itemType: 'block' as const })),
    ...markerCatalog.map((marker) => ({ ...marker, itemType: 'marker' as const })),
  ], [blockCatalog]);
  const findBlockOptionFor = (blockId: string) => findBlockOptionFromCatalog(blockId, blockCatalog);
  const selectedBlockOption = findBlockOptionFor(selectedBlockId);
  const selectedPlacedBlock = selectedBlockKey ? normalizedTemplate.blocks.find((block) => keyOf(block) === selectedBlockKey) : undefined;
  const selectedPlacedOption = selectedPlacedBlock ? findBlockOptionFor(selectedPlacedBlock.block) : undefined;

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/vanilla_blocks_ja.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('vanilla block data not found'))))
      .then((blocks: VanillaBlockData[]) => {
        if (cancelled || !Array.isArray(blocks) || blocks.length === 0) return;
        const mapped = blocks.map(vanillaBlockToOption);
        setVanillaBlocks(mapped);
        setVanillaBlockCount(mapped.length);
      })
      .catch(() => {
        if (!cancelled) {
          setVanillaBlocks(fallbackVanillaBlocks);
          setVanillaBlockCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const blockMap = useMemo(() => {
    const map = new Map<string, Block>();
    normalizedTemplate.blocks.forEach((block) => map.set(keyOf(block), block));
    return map;
  }, [normalizedTemplate.blocks]);

  const filteredItems = useMemo(() => {
    const query = normalizeSearch(blockQuery);
    return catalogItems.filter((item) => {
      const categoryMatches = selectedCategory === 'すべて' || item.category === selectedCategory;
      if (!categoryMatches) return false;
      if (!query) return true;
      return normalizeSearch(`${item.label} ${item.id} ${item.category} ${'kind' in item ? item.kind : ''}`).includes(query);
    });
  }, [blockQuery, catalogItems, selectedCategory]);

  const updateTemplate = (patch: Partial<BuildingTemplate>) => {
    setTemplate((current) => ({ ...current, ...patch }));
  };

  const hasTextureForBlock = (blockId: string) => Boolean(findTextureForBlock(blockId, textureMap));

  const loadTextureArchive = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setTextureStatus('テクスチャを読み込み中...');
    try {
      textureObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      textureObjectUrlsRef.current = [];
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const loader = new THREE.TextureLoader();
      const entries = Object.entries(zip.files).filter(([path, entry]) => (
        !entry.dir &&
        path.startsWith('assets/minecraft/textures/block/') &&
        path.endsWith('.png')
      ));
      const nextMap: TextureMap = new Map();
      await Promise.all(entries.map(async ([path, entry]) => {
        const blob = await entry.async('blob');
        const url = URL.createObjectURL(blob);
        textureObjectUrlsRef.current.push(url);
        const name = path.slice('assets/minecraft/textures/block/'.length, -'.png'.length);
        const texture = await loader.loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapNearestFilter;
        nextMap.set(name, texture);
      }));
      setTextureMap(nextMap);
      setTextureStatus(`${file.name} から ${nextMap.size} 件のブロックテクスチャを読み込みました。`);
    } catch (error) {
      setTextureStatus('テクスチャの読み込みに失敗しました。jar または zip を確認してください。');
    } finally {
      event.target.value = '';
    }
  };

  const updateSize = (axis: keyof Vec3, value: number) => {
    const size = { ...template.size, [axis]: normalizeInt(value, 1, 64) };
    setTemplate((current) => ({
      ...current,
      size,
      reserved_area: {
        x: Math.max(current.reserved_area.x, size.x),
        y: Math.max(current.reserved_area.y, size.y),
        z: Math.max(current.reserved_area.z, size.z),
      },
      blocks: current.blocks.filter((block) => isInside(block, size)),
      markers: current.markers.filter((marker) => isInside(marker, size, true)),
    }));
    setSelectedBlockKey(null);
  };

  const updateReservedArea = (axis: keyof Vec3, value: number) => {
    setTemplate((current) => ({
      ...current,
      reserved_area: {
        ...current.reserved_area,
        [axis]: Math.max(current.size[axis], normalizeInt(value, 1, 96)),
      },
    }));
  };

  const selectCatalogItem = (item: CatalogItem) => {
    if (item.itemType === 'marker') {
      setSelectedMarker(item.markerType);
      setMode('marker');
      setMessage(`${item.label}マーカーを配置できます。`);
      return;
    }
    setSelectedBlockId(item.id);
    setMode('block');
    setMessage(`${item.label}を選択しました。`);
  };

  const placeBlock = (position: Vec3) => {
    if (!isInside(position, template.size)) {
      setMessage('配置先が建物サイズの範囲外です。');
      return;
    }
    const baseProperties = buildProperties(selectedBlockOption, { slabType, stairFacing, stairHalf, stairShape, buttonFace, buttonFacing });
    const nextBlock: Block = {
      ...position,
      block: selectedBlockId,
      properties: baseProperties,
    };
    let nextSelectedKey = keyOf(nextBlock);
    let nextMessage = `${selectedBlockOption.label}を (${position.x}, ${position.y}, ${position.z}) に配置しました。`;
    let placed = false;
    setTemplate((current) => {
      if (selectedBlockOption.kind === 'door') {
        const upperPosition = { x: position.x, y: position.y + 1, z: position.z };
        const lowerBlock: Block = {
          ...nextBlock,
          properties: { ...(baseProperties ?? {}), half: 'lower' } as BlockProperties,
        };
        const upperBlock: Block = {
          ...upperPosition,
          block: selectedBlockId,
          properties: { ...(baseProperties ?? {}), half: 'upper' } as BlockProperties,
        };
        const lowerResult = placeBlockWithOccupancy(current.blocks, lowerBlock, blockCatalog);
        if (!lowerResult.ok) {
          placed = false;
          nextMessage = lowerResult.message ?? 'ドアの下側を配置できませんでした。';
          return current;
        }
        if (!isInside(upperPosition, current.size)) {
          placed = true;
          nextMessage = `${selectedBlockOption.label}の下側だけを配置しました。上側は建物サイズの範囲外です。`;
          nextSelectedKey = keyOf(lowerBlock);
          return { ...current, blocks: lowerResult.blocks };
        }
        const upperResult = placeBlockWithOccupancy(lowerResult.blocks, upperBlock, blockCatalog);
        placed = true;
        nextSelectedKey = keyOf(lowerBlock);
        if (!upperResult.ok) {
          nextMessage = `${selectedBlockOption.label}の下側だけを配置しました。上側の位置にはすでにブロックがあります。`;
          return { ...current, blocks: lowerResult.blocks };
        }
        nextMessage = `${selectedBlockOption.label}を lower / upper の2ブロックで配置しました。`;
        return { ...current, blocks: upperResult.blocks };
      }
      const result = placeBlockWithOccupancy(current.blocks, nextBlock, blockCatalog);
      placed = result.ok;
      nextMessage = result.message ?? nextMessage;
      nextSelectedKey = result.selectedKey ?? nextSelectedKey;
      return result.ok ? { ...current, blocks: result.blocks } : current;
    });
    if (!placed) {
      setMessage(nextMessage);
      return;
    }
    setSelectedBlockKey(keyOf(nextBlock));
    setSelectedBlockKey(nextSelectedKey);
    setMessage(nextMessage);
  };

  const eraseBlock = (position: Vec3) => {
    setTemplate((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => keyOf(block) !== keyOf(position)),
    }));
    if (selectedBlockKey === keyOf(position)) setSelectedBlockKey(null);
    setMessage('ブロックを削除しました。');
  };

  const placeMarker = (position: Vec3) => {
    if (!isInside(position, template.size, true)) {
      setMessage('マーカー配置先が範囲外です。');
      return;
    }
    setTemplate((current) => {
      const marker: Marker = { ...position, type: selectedMarker };
      const markers = current.markers.filter((item) => item.type !== selectedMarker);
      return { ...current, markers: [...markers, marker] };
    });
    setMessage(`${findMarkerLabel(selectedMarker)}を配置しました。`);
  };

  const handleCellClick = (position: Vec3) => {
    if (mode === 'block') placeBlock(position);
    if (mode === 'marker') placeMarker(position);
  };

  const handleBlockClick = (block: Block, adjacent: Vec3) => {
    if (mode === 'erase') {
      eraseBlock(block);
      return;
    }
    if (mode === 'block') {
      placeBlock(adjacent);
      return;
    }
    setSelectedBlockKey(keyOf(block));
    setMessage('ブロックを選択しました。左パネルの移動ボタンで動かせます。');
  };

  const selectExistingBlock = (block: Block) => {
    setSelectedBlockKey(keyOf(block));
    setMessage('ブロックを選択しました。左パネルの移動ボタンで動かせます。');
  };

  const moveSelectedBlock = (delta: Vec3, label: string) => {
    if (!selectedPlacedBlock) {
      setMessage('移動するブロックを先に選択してください。');
      return;
    }
    const nextPosition = {
      x: selectedPlacedBlock.x + delta.x,
      y: selectedPlacedBlock.y + delta.y,
      z: selectedPlacedBlock.z + delta.z,
    };
    if (!isInside(nextPosition, template.size)) {
      setMessage(`${label}は範囲外のため移動できません。`);
      return;
    }
    const nextKey = keyOf(nextPosition);
    if (blockMap.has(nextKey)) {
      setMessage(`${label}の移動先にはすでに別のブロックがあります。`);
      return;
    }
    setTemplate((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (
        keyOf(block) === selectedBlockKey ? { ...block, ...nextPosition } : block
      )),
    }));
    setSelectedBlockKey(nextKey);
    setMessage(`選択ブロックを${label}移動しました。`);
  };

  const updateSelectedBlock = (updater: (block: Block) => Block) => {
    if (!selectedPlacedBlock) {
      setMessage('編集するブロックを先に選択してください。');
      return;
    }
    setTemplate((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (keyOf(block) === selectedBlockKey ? updater(block) : block)),
    }));
  };

  const updateSelectedProperties = (properties: BlockProperties | undefined) => {
    updateSelectedBlock((block) => ({ ...block, properties }));
    setMessage('選択中ブロックの properties を更新しました。');
  };

  const setSelectedSlabProperty = (type: SlabType) => {
    updateSelectedProperties({ type });
  };

  const setSelectedStairProperty = (patch: Partial<{ facing: Direction; half: StairHalf; shape: StairShape }>) => {
    if (!selectedPlacedBlock) return;
    const current = getStairProperties(selectedPlacedBlock.properties);
    updateSelectedProperties({ ...current, ...patch, shape: 'straight' });
  };

  const setSelectedStringProperty = (name: string, value: string) => {
    if (!selectedPlacedBlock) return;
    updateSelectedProperties({ ...(selectedPlacedBlock.properties ?? {}), [name]: value } as BlockProperties);
  };

  const rotateSelectedBlock = (step: 1 | -1) => {
    if (!selectedPlacedBlock || !blockHasFacing(selectedPlacedBlock)) {
      setMessage('向きを変更できるブロックを選択してください。');
      return;
    }
    const directions: Direction[] = ['north', 'east', 'south', 'west'];
    const current = getFacing(selectedPlacedBlock);
    const next = directions[(directions.indexOf(current) + step + directions.length) % directions.length];
    if (selectedPlacedOption?.kind === 'stairs') {
      setSelectedStairProperty({ facing: next });
    } else {
      updateSelectedProperties({ ...(selectedPlacedBlock.properties ?? {}), facing: next } as BlockProperties);
    }
    setMessage(`選択中ブロックを${directionLabels[next]}向きにしました。`);
  };

  const setSelectedFacing = (facing: Direction) => {
    if (!selectedPlacedBlock || !blockHasFacing(selectedPlacedBlock)) {
      setMessage('向きを変更できるブロックを選択してください。');
      return;
    }
    if (selectedPlacedOption?.kind === 'stairs') {
      setSelectedStairProperty({ facing });
    } else {
      updateSelectedProperties({ ...(selectedPlacedBlock.properties ?? {}), facing } as BlockProperties);
    }
    setMessage(`選択中ブロックを${directionLabels[facing]}向きにしました。`);
  };

  const deleteSelectedBlock = () => {
    if (!selectedPlacedBlock) return;
    eraseBlock(selectedPlacedBlock);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select')) return;
      if (!selectedPlacedBlock) return;
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        rotateSelectedBlock(event.shiftKey ? -1 : 1);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelectedBlock();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelectedBlock({ x: 1, y: 0, z: 0 }, '東へ');
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelectedBlock({ x: -1, y: 0, z: 0 }, '西へ');
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelectedBlock({ x: 0, y: 0, z: 1 }, '南へ');
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelectedBlock({ x: 0, y: 0, z: -1 }, '北へ');
      }
      if (event.key === 'PageUp' || event.key === 'q' || event.key === 'Q') {
        event.preventDefault();
        moveSelectedBlock({ x: 0, y: 1, z: 0 }, '上へ');
      }
      if (event.key === 'PageDown' || event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        moveSelectedBlock({ x: 0, y: -1, z: 0 }, '下へ');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const buildJsonText = () => JSON.stringify(normalizedTemplate, null, 2);

  const copyJson = () => {
    const output = buildJsonText();
    setJsonText(output);
    navigator.clipboard?.writeText(output).catch(() => undefined);
    setMessage('JSONをクリップボードへコピーしました。');
  };

  const downloadJson = () => {
    const output = buildJsonText();
    setJsonText(output);
    const fileName = `${sanitizeFileName(normalizedTemplate.building_id)}.json`;
    const url = URL.createObjectURL(new Blob([output], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${fileName} をダウンロードしました。`);
  };

  const importJson = (value: string) => {
    const imported = normalizeTemplate(JSON.parse(value));
    setTemplate(imported);
    setSelectedBlockKey(null);
    setJsonText(JSON.stringify(imported, null, 2));
    setMessage('JSONを読み込みました。再編集できます。');
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importJson(await file.text());
    event.target.value = '';
  };

  return (
    <main className="appShell">
      <aside className="sidePanel">
        <div className="brand">
          <Box size={26} />
          <div>
            <h1>Flat Frontier Building Editor</h1>
            <p>NeoForge 26.1.2 向け建物JSONエディタ</p>
          </div>
        </div>

        <section>
          <h2>建物情報</h2>
          <label>
            建物ID
            <input value={template.building_id} onChange={(event) => updateTemplate({ building_id: event.target.value })} />
          </label>
          <label>
            表示名
            <input value={template.display_name} onChange={(event) => updateTemplate({ display_name: event.target.value })} />
          </label>
          <div className="formGrid">
            <label>
              種類
              <input value={template.building_type} onChange={(event) => updateTemplate({ building_type: event.target.value })} />
            </label>
            <label>
              レベル
              <input type="number" min={1} value={template.level} onChange={(event) => updateTemplate({ level: normalizeInt(Number(event.target.value), 1, 99) })} />
            </label>
          </div>
          <div className="formGrid">
            <label>
              初期向き
              <select value={template.default_direction} onChange={(event) => updateTemplate({ default_direction: event.target.value as BuildingTemplate['default_direction'] })}>
                <option value="north">北</option>
                <option value="east">東</option>
                <option value="south">南</option>
                <option value="west">西</option>
              </select>
            </label>
            <label>
              建築時間 ticks
              <input type="number" min={0} step={100} value={template.construction_time_ticks} onChange={(event) => updateTemplate({ construction_time_ticks: normalizeInt(Number(event.target.value), 0, 999999) })} />
            </label>
          </div>
          <div className="axisGrid">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label key={axis}>
                サイズ {axis.toUpperCase()}
                <input type="number" min={1} max={64} value={template.size[axis]} onChange={(event) => updateSize(axis, Number(event.target.value))} />
              </label>
            ))}
          </div>
          <div className="axisGrid">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label key={axis}>
                予約 {axis.toUpperCase()}
                <input type="number" min={1} max={96} value={template.reserved_area[axis]} onChange={(event) => updateReservedArea(axis, Number(event.target.value))} />
              </label>
            ))}
          </div>
          <label className="checkRow">
            <input type="checkbox" checked={template.instant_complete_fron} onChange={(event) => updateTemplate({ instant_complete_fron: event.target.checked })} />
            即時完成 instant_complete_fron
          </label>
        </section>

        <section>
          <h2>編集モード</h2>
          <div className="toolBar" role="toolbar" aria-label="編集モード">
            <button className={mode === 'select' ? 'active' : ''} onClick={() => setMode('select')} title="選択" aria-label="選択">
              <MousePointer2 />
            </button>
            <button className={mode === 'block' ? 'active' : ''} onClick={() => setMode('block')} title="ブロック配置" aria-label="ブロック配置">
              <Box />
            </button>
            <button className={mode === 'erase' ? 'active' : ''} onClick={() => setMode('erase')} title="ブロック削除" aria-label="ブロック削除">
              <Eraser />
            </button>
            <button className={mode === 'marker' ? 'active' : ''} onClick={() => setMode('marker')} title="マーカー配置" aria-label="マーカー配置">
              <MapPin />
            </button>
            <button
              onClick={() => {
                setTemplate(normalizeTemplate(defaultTemplate));
                setSelectedBlockKey(null);
                setMessage('初期状態に戻しました。');
              }}
              title="リセット"
              aria-label="リセット"
            >
              <RotateCcw />
            </button>
          </div>
          <div className="statusMessage">{message}</div>
        </section>

        <section>
          <h2>3Dビュー操作</h2>
          <div className="viewControls">
            <button onClick={() => setCameraResetKey((value) => value + 1)}>
              <RotateCcw size={16} />
              リセット
            </button>
            <button className={viewPreset === 'top' ? 'active' : ''} onClick={() => setViewPreset('top')}>
              <Eye size={16} />
              上
            </button>
            <button className={viewPreset === 'front' ? 'active' : ''} onClick={() => setViewPreset('front')}>
              <Eye size={16} />
              正面
            </button>
            <button className={viewPreset === 'diagonal' ? 'active' : ''} onClick={() => setViewPreset('diagonal')}>
              <Eye size={16} />
              斜め
            </button>
          </div>
        </section>

        <section>
          <h2>ブロック選択</h2>
          <div className="selectedBlockCard">
            <span style={{ background: selectedBlockOption.color }} />
            <div>
              <strong>{selectedBlockOption.label}</strong>
              <small>{selectedBlockOption.id}</small>
            </div>
          </div>
          <div className="catalogFilters">
            <label>
              検索
              <input value={blockQuery} onChange={(event) => setBlockQuery(event.target.value)} placeholder="階段 / stairs / オーク" />
            </label>
            <label>
              カテゴリ
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                {categoryOrder.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="catalogList">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                className={isSelectedCatalogItem(item, selectedBlockId, selectedMarker, mode) ? 'catalogItem active' : 'catalogItem'}
                onClick={() => selectCatalogItem(item)}
              >
                <span style={{ background: item.color }} />
                <strong>{item.label}</strong>
                <small>{item.id}{item.itemType === 'block' && hasTextureForBlock(item.id) ? ' / テクスチャ読込済み' : ''}</small>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>テクスチャ読込</h2>
          <div className="jsonActions">
            <button onClick={() => textureInputRef.current?.click()}>
              <FileUp size={16} />
              jar / zip を読み込む
            </button>
            <input ref={textureInputRef} type="file" accept=".jar,.zip,application/zip" onChange={loadTextureArchive} hidden />
          </div>
          <p className="helpText">{textureStatus}</p>
          <p className="helpText">読み込んだ画像はブラウザ内の3Dプレビューだけで使い、JSONには保存しません。</p>
        </section>

        <section>
          <h2>ブロックプロパティ</h2>
          <div className="propertyPanel">
            <strong>{selectedBlockOption.label}</strong>
            <small>{selectedBlockOption.id}</small>
            {selectedBlockOption.kind === 'slab' && (
              <label>
                ハーフブロック
                <select value={slabType} onChange={(event) => setSlabType(event.target.value as SlabType)}>
                  {(['bottom', 'top', 'double'] as const).map((value) => (
                    <option key={value} value={value}>{slabLabels[value]} / {value}</option>
                  ))}
                </select>
              </label>
            )}
            {selectedBlockOption.kind === 'stairs' && (
              <>
                <label>
                  向き
                  <select value={stairFacing} onChange={(event) => setStairFacing(event.target.value as Direction)}>
                    {(['north', 'east', 'south', 'west'] as const).map((value) => (
                      <option key={value} value={value}>{directionLabels[value]} / {value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  上下
                  <select value={stairHalf} onChange={(event) => setStairHalf(event.target.value as StairHalf)}>
                    {(['bottom', 'top'] as const).map((value) => (
                      <option key={value} value={value}>{halfLabels[value]} / {value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  形状
                  <select value={stairShape} onChange={(event) => setStairShape(event.target.value as StairShape)}>
                    <option value="straight">直線 / straight</option>
                  </select>
                </label>
              </>
            )}
            {selectedBlockOption.kind === 'button' && (
              <>
                <label>
                  設置面
                  <select value={buttonFace} onChange={(event) => setButtonFace(event.target.value)}>
                    <option value="floor">床 / floor</option>
                    <option value="wall">壁 / wall</option>
                    <option value="ceiling">天井 / ceiling</option>
                  </select>
                </label>
                <label>
                  向き
                  <select value={buttonFacing} onChange={(event) => setButtonFacing(event.target.value as Direction)}>
                    {(['north', 'east', 'south', 'west'] as const).map((value) => (
                      <option key={value} value={value}>{directionLabels[value]} / {value}</option>
                    ))}
                  </select>
                </label>
                <p>powered は Ver.0.1 では false で保存します。</p>
              </>
            )}
            {selectedBlockOption.kind === 'normal' && <p>通常ブロックは properties なしで保存します。</p>}
          </div>
        </section>

        <section>
          <h2>選択ブロックの移動</h2>
          <div className="moveCard">
            <p>{selectedPlacedBlock ? `現在座標: X=${selectedPlacedBlock.x}, Y=${selectedPlacedBlock.y}, Z=${selectedPlacedBlock.z}` : '3Dビューでブロックをクリックして選択してください。'}</p>
            <div className="moveGrid">
              <button onClick={() => moveSelectedBlock({ x: 1, y: 0, z: 0 }, '東へ')}>東へ</button>
              <button onClick={() => moveSelectedBlock({ x: -1, y: 0, z: 0 }, '西へ')}>西へ</button>
              <button onClick={() => moveSelectedBlock({ x: 0, y: 1, z: 0 }, '上へ')}>上へ</button>
              <button onClick={() => moveSelectedBlock({ x: 0, y: -1, z: 0 }, '下へ')}>下へ</button>
              <button onClick={() => moveSelectedBlock({ x: 0, y: 0, z: 1 }, '南へ')}>南へ</button>
              <button onClick={() => moveSelectedBlock({ x: 0, y: 0, z: -1 }, '北へ')}>北へ</button>
            </div>
          </div>
        </section>

        <section>
          <h2>選択中ブロック</h2>
          <div className="propertyPanel">
            {selectedPlacedBlock && selectedPlacedOption ? (
              <>
                <strong>{selectedPlacedOption.label}</strong>
                <small>{selectedPlacedBlock.block}</small>
                <p>座標: x={selectedPlacedBlock.x}, y={selectedPlacedBlock.y}, z={selectedPlacedBlock.z}</p>
                <p>kind: {selectedPlacedOption.kind}</p>
                <pre className="propertyJson">{JSON.stringify(selectedPlacedBlock.properties ?? {}, null, 2)}</pre>
                {selectedPlacedOption.kind === 'slab' && (
                  <label>
                    ハーフブロック type
                    <select value={getSlabType(selectedPlacedBlock.properties)} onChange={(event) => setSelectedSlabProperty(event.target.value as SlabType)}>
                      {(['bottom', 'top', 'double'] as const).map((value) => (
                        <option key={value} value={value}>{slabLabels[value]} / {value}</option>
                      ))}
                    </select>
                  </label>
                )}
                {blockHasFacing(selectedPlacedBlock) && (
                  <>
                    <label>
                      向き facing
                      <select value={getFacing(selectedPlacedBlock)} onChange={(event) => setSelectedFacing(event.target.value as Direction)}>
                        {(['north', 'east', 'south', 'west'] as const).map((value) => (
                          <option key={value} value={value}>{directionLabels[value]} / {value}</option>
                        ))}
                      </select>
                    </label>
                    {selectedPlacedOption.kind === 'stairs' && (
                      <>
                        <label>
                          上下 half
                          <select value={getStairProperties(selectedPlacedBlock.properties).half} onChange={(event) => setSelectedStairProperty({ half: event.target.value as StairHalf })}>
                            {(['bottom', 'top'] as const).map((value) => (
                              <option key={value} value={value}>{halfLabels[value]} / {value}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          形状 shape
                          <select value="straight" onChange={() => setSelectedStairProperty({ shape: 'straight' })}>
                            <option value="straight">直線 / straight</option>
                          </select>
                        </label>
                      </>
                    )}
                    {selectedPlacedOption.kind === 'button' && (
                      <>
                        <label>
                          設置面 face
                          <select value={getProperty(selectedPlacedBlock, 'face', 'wall')} onChange={(event) => setSelectedStringProperty('face', event.target.value)}>
                            <option value="floor">床 / floor</option>
                            <option value="wall">壁 / wall</option>
                            <option value="ceiling">天井 / ceiling</option>
                          </select>
                        </label>
                        <p>powered: {getProperty(selectedPlacedBlock, 'powered', 'false')}</p>
                      </>
                    )}
                    {selectedPlacedOption.kind === 'door' && (
                      <>
                        <label>
                          上下 half
                          <select value={getProperty(selectedPlacedBlock, 'half', 'lower')} onChange={(event) => setSelectedStringProperty('half', event.target.value)}>
                            <option value="lower">下 / lower</option>
                            <option value="upper">上 / upper</option>
                          </select>
                        </label>
                        <label>
                          ヒンジ hinge
                          <select value={getProperty(selectedPlacedBlock, 'hinge', 'left')} onChange={(event) => setSelectedStringProperty('hinge', event.target.value)}>
                            <option value="left">左 / left</option>
                            <option value="right">右 / right</option>
                          </select>
                        </label>
                        <label className="checkRow">
                          <input type="checkbox" checked={getBooleanProperty(selectedPlacedBlock, 'open', false)} onChange={(event) => setSelectedStringProperty('open', String(event.target.checked))} />
                          開く open
                        </label>
                        <p>powered: {getProperty(selectedPlacedBlock, 'powered', 'false')}</p>
                      </>
                    )}
                    {selectedPlacedOption.kind === 'trapdoor' && (
                      <>
                        <label>
                          上下 half
                          <select value={getProperty(selectedPlacedBlock, 'half', 'bottom')} onChange={(event) => setSelectedStringProperty('half', event.target.value)}>
                            <option value="bottom">下付き / bottom</option>
                            <option value="top">上付き / top</option>
                          </select>
                        </label>
                        <label className="checkRow">
                          <input type="checkbox" checked={getBooleanProperty(selectedPlacedBlock, 'open', false)} onChange={(event) => setSelectedStringProperty('open', String(event.target.checked))} />
                          開く open
                        </label>
                      </>
                    )}
                    <div className="rotateGrid">
                      <button onClick={() => rotateSelectedBlock(-1)}>左回転</button>
                      <button onClick={() => rotateSelectedBlock(1)}>右回転</button>
                      <button onClick={() => setSelectedFacing('north')}>北向き</button>
                      <button onClick={() => setSelectedFacing('east')}>東向き</button>
                      <button onClick={() => setSelectedFacing('south')}>南向き</button>
                      <button onClick={() => setSelectedFacing('west')}>西向き</button>
                    </div>
                  </>
                )}
                {(selectedPlacedOption.kind === 'fence' || selectedPlacedOption.kind === 'pane') && (
                  <DirectionBooleans block={selectedPlacedBlock} onChange={setSelectedStringProperty} />
                )}
                {selectedPlacedOption.kind === 'wall' && (
                  <>
                    <WallDirections block={selectedPlacedBlock} onChange={setSelectedStringProperty} />
                    <label className="checkRow">
                      <input type="checkbox" checked={getBooleanProperty(selectedPlacedBlock, 'up', true)} onChange={(event) => setSelectedStringProperty('up', String(event.target.checked))} />
                      中央柱 up
                    </label>
                  </>
                )}
                {selectedPlacedOption.kind === 'lantern' && (
                  <label className="checkRow">
                    <input type="checkbox" checked={getBooleanProperty(selectedPlacedBlock, 'hanging', false)} onChange={(event) => setSelectedStringProperty('hanging', String(event.target.checked))} />
                    吊り下げ hanging
                  </label>
                )}
                <button className="wideButton dangerButton" onClick={deleteSelectedBlock}>選択ブロックを削除</button>
              </>
            ) : (
              <p>3Dビュー上の配置済みブロックをクリックすると、ここで座標や properties を編集できます。</p>
            )}
          </div>
        </section>

        <section>
          <h2>マーカー設定</h2>
          <div className="markerList">
            {markerCatalog.map((marker) => (
              <button
                key={marker.id}
                className={selectedMarker === marker.markerType && mode === 'marker' ? 'markerButton active' : 'markerButton'}
                onClick={() => {
                  setSelectedMarker(marker.markerType);
                  setMode('marker');
                }}
              >
                <span style={{ background: marker.color }} />
                {marker.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>JSON出力 / 読み込み</h2>
          <div className="jsonActions">
            <button onClick={copyJson}>
              <ClipboardCopy size={16} />
              コピー
            </button>
            <button onClick={downloadJson}>
              <Download size={16} />
              ダウンロード
            </button>
            <button onClick={() => fileInputRef.current?.click()}>
              <FileUp size={16} />
              読み込み
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={loadFile} hidden />
          </div>
          <textarea className="jsonTextarea" value={jsonText} onChange={(event) => setJsonText(event.target.value)} spellCheck={false} placeholder="JSONをコピー、またはここへ貼り付けて読み込めます。" />
          <button className="wideButton" onClick={() => importJson(jsonText)}>テキストから読み込み</button>
          <div className="materials">
            {Object.entries(normalizedTemplate.required_materials).map(([id, count]) => (
              <div key={id}>
                <span>{id}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>操作説明</h2>
          <p className="helpText">左ドラッグでカメラ回転、ホイールでズーム、右ドラッグで平行移動できます。ブロック配置モードでは、半透明プレビューの位置にクリックで配置します。削除モードではブロックをクリックして削除します。</p>
        </section>
      </aside>

      <section className="viewport">
        <div className="statsBar">
          <span>{normalizedTemplate.blocks.length} ブロック</span>
          <span>{normalizedTemplate.markers.length} マーカー</span>
          <span>{Object.keys(normalizedTemplate.required_materials).length} 材料</span>
          <span>バニラ {vanillaBlockCount} 件</span>
        </div>
        <Canvas camera={{ position: [16, 12, 16], fov: 45 }} shadows>
          <color attach="background" args={['#c9d6df']} />
          <ambientLight intensity={0.7} />
          <directionalLight castShadow position={[8, 14, 10]} intensity={1.35} />
          <EditorScene
            blockMap={blockMap}
            blockCatalog={blockCatalog}
            blocks={normalizedTemplate.blocks}
            markers={normalizedTemplate.markers}
            mode={mode}
            previewPosition={previewPosition}
            selectedBlockKey={selectedBlockKey}
            selectedBlockOption={selectedBlockOption}
            size={template.size}
            textureMap={textureMap}
            viewPreset={viewPreset}
            cameraResetKey={cameraResetKey}
            onCellClick={handleCellClick}
            onBlockClick={handleBlockClick}
            onBlockSelect={selectExistingBlock}
            onPreviewChange={setPreviewPosition}
          />
        </Canvas>
      </section>
    </main>
  );
}

function EditorScene({
  size,
  blocks,
  markers,
  blockCatalog,
  mode,
  previewPosition,
  selectedBlockKey,
  selectedBlockOption,
  blockMap,
  textureMap,
  viewPreset,
  cameraResetKey,
  onCellClick,
  onBlockClick,
  onBlockSelect,
  onPreviewChange,
}: {
  size: Vec3;
  blocks: Block[];
  markers: Marker[];
  blockCatalog: BlockOption[];
  mode: EditMode;
  previewPosition: Vec3 | null;
  selectedBlockKey: string | null;
  selectedBlockOption: BlockOption;
  blockMap: Map<string, Block>;
  textureMap: TextureMap;
  viewPreset: ViewPreset;
  cameraResetKey: number;
  onCellClick: (position: Vec3) => void;
  onBlockClick: (block: Block, adjacent: Vec3) => void;
  onBlockSelect: (block: Block) => void;
  onPreviewChange: (position: Vec3 | null) => void;
}) {
  const cells = useMemo(() => {
    const positions: Vec3[] = [];
    for (let x = 0; x < size.x; x += 1) {
      for (let z = 0; z < size.z; z += 1) {
        positions.push({ x, y: 0, z });
      }
    }
    return positions;
  }, [size.x, size.z]);

  const sceneOffset: [number, number, number] = [-size.x / 2 + 0.5, 0, -size.z / 2 + 0.5];

  return (
    <>
      <CameraRig size={size} viewPreset={viewPreset} cameraResetKey={cameraResetKey} />
      <group
        position={sceneOffset}
        onPointerLeave={() => onPreviewChange(null)}
      >
        <Grid
          position={[size.x / 2 - 0.5, -0.02, size.z / 2 - 0.5]}
          args={[size.x, size.z]}
          cellSize={1}
          sectionSize={4}
          cellThickness={0.75}
          sectionThickness={1.5}
          cellColor="#7b8794"
          sectionColor="#1f2937"
          fadeDistance={80}
          infiniteGrid={false}
        />
        <mesh position={[size.x / 2 - 0.5, size.y / 2 - 0.5, size.z / 2 - 0.5]}>
          <boxGeometry args={[size.x, size.y, size.z]} />
          <meshBasicMaterial color="#1f2937" transparent opacity={0.04} />
          <Edges color="#4b5563" />
        </mesh>
        {cells.map((position) => (
          <Cell
            key={keyOf(position)}
            position={position}
            hasBlock={blockMap.has(keyOf(position))}
            onClick={onCellClick}
            onHover={(next) => onPreviewChange(mode === 'block' ? next : null)}
          />
        ))}
        {blocks.map((block) => (
          <BlockMesh
            key={keyOf(block)}
            block={block}
            blockCatalog={blockCatalog}
            selected={selectedBlockKey === keyOf(block)}
            texture={findTextureForBlock(block.block, textureMap)}
            onClick={(adjacent) => onBlockClick(block, adjacent)}
            onSelect={() => onBlockSelect(block)}
            onHover={(adjacent) => onPreviewChange(mode === 'block' && isInside(adjacent, size) && !blockMap.has(keyOf(adjacent)) ? adjacent : null)}
          />
        ))}
        {previewPosition && mode === 'block' && isInside(previewPosition, size) && !blockMap.has(keyOf(previewPosition)) && (
          <PreviewBlock position={previewPosition} blockOption={selectedBlockOption} texture={findTextureForBlock(selectedBlockOption.id, textureMap)} />
        )}
        {markers.map((marker) => (
          <MarkerMesh key={marker.type} marker={marker} />
        ))}
      </group>
    </>
  );
}

function CameraRig({ size, viewPreset, cameraResetKey }: { size: Vec3; viewPreset: ViewPreset; cameraResetKey: number }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const center = new THREE.Vector3(0, Math.max(1, size.y / 2), 0);
    const distance = Math.max(size.x, size.y, size.z) * 1.75 + 6;
    const positions: Record<ViewPreset, THREE.Vector3> = {
      diagonal: new THREE.Vector3(distance, distance * 0.72, distance),
      top: new THREE.Vector3(0.001, distance * 1.15, 0.001),
      front: new THREE.Vector3(0, Math.max(4, size.y * 0.65), distance),
    };
    camera.position.copy(positions[viewPreset]);
    camera.lookAt(center);
    controlsRef.current?.target.copy(center);
    controlsRef.current?.update();
  }, [camera, size.x, size.y, size.z, viewPreset, cameraResetKey]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      enableZoom
      minDistance={4}
      maxDistance={120}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}

function Cell({
  position,
  hasBlock,
  onClick,
  onHover,
}: {
  position: Vec3;
  hasBlock: boolean;
  onClick: (position: Vec3) => void;
  onHover: (position: Vec3) => void;
}) {
  if (hasBlock) return null;
  return (
    <mesh
      position={[position.x, -0.49, position.z]}
      onClick={(event) => {
        event.stopPropagation();
        onClick(position);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        onHover(position);
      }}
    >
      <boxGeometry args={[0.94, 0.04, 0.94]} />
      <meshBasicMaterial transparent opacity={0.18} color="#ecfdf5" />
    </mesh>
  );
}

function BlockMesh({
  block,
  blockCatalog,
  selected,
  texture,
  onClick,
  onSelect,
  onHover,
}: {
  block: Block;
  blockCatalog: BlockOption[];
  selected: boolean;
  texture?: THREE.Texture;
  onClick: (adjacent: Vec3) => void;
  onSelect: () => void;
  onHover: (adjacent: Vec3) => void;
}) {
  const paletteBlock = findBlockOptionFromCatalog(block.block, blockCatalog);
  const adjacentFromEvent = (event: any) => {
    const normal = event.face?.normal ?? new THREE.Vector3(0, 1, 0);
    return {
      x: block.x + Math.round(normal.x),
      y: block.y + Math.round(normal.y),
      z: block.z + Math.round(normal.z),
    };
  };

  return (
    <group
      position={[block.x, block.y, block.z]}
      onClick={(event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          onSelect();
          return;
        }
        onClick(adjacentFromEvent(event));
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        onHover(adjacentFromEvent(event));
      }}
    >
      <BlockShape block={block} blockOption={paletteBlock} selected={selected} texture={texture} />
    </group>
  );
}

function BlockShape({ block, blockOption, selected, texture }: { block: Block; blockOption: BlockOption; selected: boolean; texture?: THREE.Texture }) {
  if (blockOption.kind === 'slab') return <SlabShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'stairs') return <StairShapeMesh block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'button') return <ButtonShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'pressure_plate') return <ThinBox color={blockOption.color} selected={selected} texture={texture} args={[0.78, 0.08, 0.78]} position={[0, -0.46, 0]} />;
  if (blockOption.kind === 'torch') return <TorchShape selected={selected} wall={false} />;
  if (blockOption.kind === 'wall_torch') return <TorchShape selected={selected} wall block={block} />;
  if (blockOption.kind === 'lantern') return <LanternShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'chain') return <ThinBox color={blockOption.color} selected={selected} texture={texture} args={[0.14, 1, 0.14]} position={[0, 0, 0]} />;
  if (blockOption.kind === 'fence') return <FenceShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'wall') return <WallShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'pane') return <PaneShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'door') return <DoorShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'trapdoor') return <TrapdoorShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'carpet') return <ThinBox color={blockOption.color} selected={selected} texture={texture} args={[1, 0.06, 1]} position={[0, -0.47, 0]} />;
  if (blockOption.kind === 'sign' || blockOption.kind === 'wall_sign' || blockOption.kind === 'hanging_sign') return <SignShape block={block} color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'plant' || blockOption.kind === 'crop') return <CrossShape color={blockOption.color} selected={selected} texture={texture} />;
  if (blockOption.kind === 'liquid') return <ThinBox color={blockOption.color} selected={selected} args={[1, 0.18, 1]} position={[0, -0.38, 0]} transparent />;
  if (blockOption.kind === 'rail' || blockOption.kind === 'redstone') return <RailShape color={blockOption.color} selected={selected} texture={texture} />;
  return <BoxShape color={blockOption.color} selected={selected} texture={texture} transparent={block.block.includes('glass')} />;
}

function Material({ color, selected, transparent = false, texture }: { color: string; selected: boolean; transparent?: boolean; texture?: THREE.Texture }) {
  return (
    <meshStandardMaterial
      color={texture ? '#ffffff' : color}
      map={texture}
      roughness={0.88}
      metalness={0.04}
      emissive={selected ? '#facc15' : '#000000'}
      emissiveIntensity={selected ? 0.18 : 0}
      transparent={transparent}
      opacity={transparent ? 0.58 : 1}
    />
  );
}

function BoxShape({ color, selected, transparent = false, texture }: { color: string; selected: boolean; transparent?: boolean; texture?: THREE.Texture }) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <Material color={color} selected={selected} transparent={transparent} texture={texture} />
      <Edges color={selected ? '#facc15' : '#1f2937'} />
    </mesh>
  );
}

function ThinBox({ color, selected, args, position, rotation = [0, 0, 0], transparent = false, texture }: { color: string; selected: boolean; args: [number, number, number]; position: [number, number, number]; rotation?: [number, number, number]; transparent?: boolean; texture?: THREE.Texture }) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <Material color={color} selected={selected} texture={texture} transparent={transparent} />
      <Edges color={selected ? '#facc15' : '#1f2937'} />
    </mesh>
  );
}

function SlabShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const type = getSlabType(block.properties);
  const height = type === 'double' ? 1 : 0.5;
  const y = type === 'top' ? 0.25 : type === 'bottom' ? -0.25 : 0;
  return (
    <mesh castShadow receiveShadow position={[0, y, 0]}>
      <boxGeometry args={[1, height, 1]} />
      <Material color={color} selected={selected} texture={texture} />
      <Edges color={selected ? '#facc15' : '#1f2937'} />
    </mesh>
  );
}

function StairShapeMesh({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const props = getStairProperties(block.properties);
  const rotationY: Record<Direction, number> = {
    north: Math.PI,
    east: Math.PI / 2,
    south: 0,
    west: -Math.PI / 2,
  };
  const lowerY = props.half === 'top' ? 0.25 : -0.25;
  const upperY = props.half === 'top' ? -0.25 : 0.25;

  return (
    <group rotation={[0, rotationY[props.facing], 0]}>
      <mesh castShadow receiveShadow position={[0, lowerY, 0]}>
        <boxGeometry args={[1, 0.5, 1]} />
        <Material color={color} selected={selected} texture={texture} />
        <Edges color={selected ? '#facc15' : '#1f2937'} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, upperY, 0.25]}>
        <boxGeometry args={[1, 0.5, 0.5]} />
        <Material color={color} selected={selected} texture={texture} />
        <Edges color={selected ? '#facc15' : '#1f2937'} />
      </mesh>
    </group>
  );
}

function ButtonShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const face = getProperty(block, 'face', 'wall');
  const facing = getFacing(block);
  const width = 0.46;
  const height = 0.3;
  const thickness = 0.1;
  const sideOffset = 0.5 - thickness / 2;
  if (face === 'floor') return <ThinBox color={color} selected={selected} texture={texture} args={[0.42, 0.1, 0.32]} position={[0, -0.45, 0]} />;
  if (face === 'ceiling') return <ThinBox color={color} selected={selected} texture={texture} args={[0.42, 0.1, 0.32]} position={[0, 0.45, 0]} />;
  const transforms: Record<Direction, { args: [number, number, number]; position: [number, number, number] }> = {
    north: { args: [width, height, thickness], position: [0, 0, -sideOffset] },
    south: { args: [width, height, thickness], position: [0, 0, sideOffset] },
    east: { args: [thickness, height, width], position: [sideOffset, 0, 0] },
    west: { args: [thickness, height, width], position: [-sideOffset, 0, 0] },
  };
  const transform = transforms[facing];
  return <ThinBox color={color} selected={selected} texture={texture} args={transform.args} position={transform.position} />;
}

function TorchShape({ selected, wall = false, block }: { selected: boolean; wall?: boolean; block?: Block }) {
  const facing = block ? getFacing(block) : 'south';
  const rotationY: Record<Direction, number> = { north: Math.PI, east: Math.PI / 2, south: 0, west: -Math.PI / 2 };
  return (
    <group rotation={[0, wall ? rotationY[facing] : 0, 0]}>
      <mesh castShadow position={wall ? [0, 0.05, 0.35] : [0, -0.12, 0]} rotation={wall ? [Math.PI / 5, 0, 0] : [0, 0, 0]}>
        <boxGeometry args={[0.12, 0.72, 0.12]} />
        <meshStandardMaterial color="#6f4a2d" emissive={selected ? '#facc15' : '#000000'} emissiveIntensity={selected ? 0.15 : 0} />
        <Edges color={selected ? '#facc15' : '#1f2937'} />
      </mesh>
      <mesh position={wall ? [0, 0.42, 0.18] : [0, 0.28, 0]}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

function LanternShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const hanging = getBooleanProperty(block, 'hanging', false);
  return (
    <group>
      {hanging && <ThinBox color="#374151" selected={selected} args={[0.08, 0.36, 0.08]} position={[0, 0.32, 0]} />}
      <ThinBox color={color} selected={selected} texture={texture} args={[0.42, 0.52, 0.42]} position={[0, hanging ? -0.05 : -0.24, 0]} />
      <mesh position={[0, hanging ? -0.05 : -0.24, 0]}>
        <boxGeometry args={[0.26, 0.34, 0.26]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.28} transparent opacity={0.78} />
      </mesh>
    </group>
  );
}

function FenceShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  return (
    <group>
      <ThinBox color={color} selected={selected} texture={texture} args={[0.24, 1, 0.24]} position={[0, 0, 0]} />
      {directionEnabled(block, 'north') && <ThinBox color={color} selected={selected} texture={texture} args={[0.18, 0.22, 0.9]} position={[0, 0.12, -0.35]} />}
      {directionEnabled(block, 'south') && <ThinBox color={color} selected={selected} texture={texture} args={[0.18, 0.22, 0.9]} position={[0, 0.12, 0.35]} />}
      {directionEnabled(block, 'east') && <ThinBox color={color} selected={selected} texture={texture} args={[0.9, 0.22, 0.18]} position={[0.35, 0.12, 0]} />}
      {directionEnabled(block, 'west') && <ThinBox color={color} selected={selected} texture={texture} args={[0.9, 0.22, 0.18]} position={[-0.35, 0.12, 0]} />}
    </group>
  );
}

function WallShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const wallHeight = getBooleanProperty(block, 'up', true) ? 0.82 : 0.62;
  return (
    <group>
      <ThinBox color={color} selected={selected} texture={texture} args={[0.42, wallHeight, 0.42]} position={[0, -0.5 + wallHeight / 2, 0]} />
      {wallPart(block, 'north') && <ThinBox color={color} selected={selected} texture={texture} args={[0.32, 0.62, 0.84]} position={[0, -0.19, -0.34]} />}
      {wallPart(block, 'south') && <ThinBox color={color} selected={selected} texture={texture} args={[0.32, 0.62, 0.84]} position={[0, -0.19, 0.34]} />}
      {wallPart(block, 'east') && <ThinBox color={color} selected={selected} texture={texture} args={[0.84, 0.62, 0.32]} position={[0.34, -0.19, 0]} />}
      {wallPart(block, 'west') && <ThinBox color={color} selected={selected} texture={texture} args={[0.84, 0.62, 0.32]} position={[-0.34, -0.19, 0]} />}
    </group>
  );
}

function PaneShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const ns = directionEnabled(block, 'north') || directionEnabled(block, 'south') || (!directionEnabled(block, 'east') && !directionEnabled(block, 'west'));
  const ew = directionEnabled(block, 'east') || directionEnabled(block, 'west');
  return (
    <group>
      {ns && <ThinBox color={color} selected={selected} texture={texture} args={[0.08, 1, 1]} position={[0, 0, 0]} transparent />}
      {ew && <ThinBox color={color} selected={selected} texture={texture} args={[1, 1, 0.08]} position={[0, 0, 0]} transparent />}
    </group>
  );
}

function DoorShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const facing = getFacing(block);
  const open = getBooleanProperty(block, 'open', false);
  const hinge = getProperty(block, 'hinge', 'left') === 'right' ? 'right' : 'left';
  const closedPanels: Record<Direction, { args: [number, number, number]; position: [number, number, number] }> = {
    north: { args: [0.94, 1, 0.1], position: [0, 0, -0.45] },
    south: { args: [0.94, 1, 0.1], position: [0, 0, 0.45] },
    east: { args: [0.1, 1, 0.94], position: [0.45, 0, 0] },
    west: { args: [0.1, 1, 0.94], position: [-0.45, 0, 0] },
  };
  const openPanels: Record<Direction, Record<'left' | 'right', { args: [number, number, number]; position: [number, number, number] }>> = {
    north: {
      left: { args: [0.1, 1, 0.94], position: [0.45, 0, 0] },
      right: { args: [0.1, 1, 0.94], position: [-0.45, 0, 0] },
    },
    south: {
      left: { args: [0.1, 1, 0.94], position: [-0.45, 0, 0] },
      right: { args: [0.1, 1, 0.94], position: [0.45, 0, 0] },
    },
    east: {
      left: { args: [0.94, 1, 0.1], position: [0, 0, 0.45] },
      right: { args: [0.94, 1, 0.1], position: [0, 0, -0.45] },
    },
    west: {
      left: { args: [0.94, 1, 0.1], position: [0, 0, -0.45] },
      right: { args: [0.94, 1, 0.1], position: [0, 0, 0.45] },
    },
  };
  const panel = open ? openPanels[facing][hinge] : closedPanels[facing];
  return <ThinBox color={color} selected={selected} texture={texture} args={panel.args} position={panel.position} />;
}

function TrapdoorShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const half = getProperty(block, 'half', 'bottom');
  const open = getBooleanProperty(block, 'open', false);
  if (open) return <ThinBox color={color} selected={selected} texture={texture} args={[0.92, 0.92, 0.1]} position={[0, 0, -0.44]} rotation={[Math.PI / 2, 0, 0]} />;
  return <ThinBox color={color} selected={selected} texture={texture} args={[0.92, 0.1, 0.92]} position={[0, half === 'top' ? 0.45 : -0.45, 0]} />;
}

function SignShape({ block, color, selected, texture }: { block: Block; color: string; selected: boolean; texture?: THREE.Texture }) {
  const facing = getFacing(block);
  const rotationY: Record<Direction, number> = { north: 0, south: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };
  return (
    <group rotation={[0, rotationY[facing], 0]}>
      <ThinBox color={color} selected={selected} texture={texture} args={[0.82, 0.42, 0.08]} position={[0, 0.16, -0.28]} />
      <ThinBox color={color} selected={selected} texture={texture} args={[0.08, 0.5, 0.08]} position={[0, -0.3, -0.28]} />
    </group>
  );
}

function CrossShape({ color, selected, texture }: { color: string; selected: boolean; texture?: THREE.Texture }) {
  return (
    <group>
      <ThinBox color={color} selected={selected} texture={texture} args={[0.04, 0.82, 0.9]} position={[0, -0.09, 0]} transparent />
      <ThinBox color={color} selected={selected} texture={texture} args={[0.9, 0.82, 0.04]} position={[0, -0.09, 0]} transparent />
    </group>
  );
}

function RailShape({ color, selected, texture }: { color: string; selected: boolean; texture?: THREE.Texture }) {
  return (
    <group>
      <ThinBox color={color} selected={selected} texture={texture} args={[0.08, 0.05, 0.92]} position={[-0.24, -0.47, 0]} />
      <ThinBox color={color} selected={selected} texture={texture} args={[0.08, 0.05, 0.92]} position={[0.24, -0.47, 0]} />
      <ThinBox color={color} selected={selected} texture={texture} args={[0.62, 0.04, 0.08]} position={[0, -0.44, -0.25]} />
      <ThinBox color={color} selected={selected} texture={texture} args={[0.62, 0.04, 0.08]} position={[0, -0.44, 0.25]} />
    </group>
  );
}

function PreviewBlock({ position, blockOption, texture }: { position: Vec3; blockOption: BlockOption; texture?: THREE.Texture }) {
  return (
    <mesh position={[position.x, position.y, position.z]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={texture ? '#ffffff' : blockOption.color} map={texture} transparent opacity={0.34} />
      <Edges color="#256f66" />
    </mesh>
  );
}

function MarkerMesh({ marker }: { marker: Marker }) {
  const option = markerCatalog.find((item) => item.markerType === marker.type);
  return (
    <group position={[marker.x, marker.y + 0.62, marker.z]}>
      <mesh>
        <sphereGeometry args={[0.24, 24, 16]} />
        <meshStandardMaterial color={option?.color ?? '#ffffff'} emissive={option?.color ?? '#ffffff'} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, -0.36, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.12, 0.5, 0.12]} />
        <meshStandardMaterial color={option?.color ?? '#ffffff'} />
      </mesh>
    </group>
  );
}

function DirectionBooleans({ block, onChange }: { block: Block; onChange: (name: string, value: string) => void }) {
  return (
    <div className="propertyGrid">
      {(['north', 'east', 'south', 'west'] as const).map((direction) => (
        <label className="checkRow" key={direction}>
          <input type="checkbox" checked={directionEnabled(block, direction)} onChange={(event) => onChange(direction, String(event.target.checked))} />
          {directionLabels[direction]}
        </label>
      ))}
    </div>
  );
}

function WallDirections({ block, onChange }: { block: Block; onChange: (name: string, value: string) => void }) {
  return (
    <div className="propertyGrid">
      {(['north', 'east', 'south', 'west'] as const).map((direction) => (
        <label key={direction}>
          {directionLabels[direction]}
          <select value={getProperty(block, direction, 'none')} onChange={(event) => onChange(direction, event.target.value)}>
            <option value="none">なし / none</option>
            <option value="low">低い / low</option>
            <option value="tall">高い / tall</option>
          </select>
        </label>
      ))}
    </div>
  );
}

function normalizeTemplate(value: Partial<BuildingTemplate> & Record<string, unknown>): BuildingTemplate {
  const rawSize = value.size as Partial<Vec3> | undefined;
  const size = sanitizeVec3(rawSize, defaultTemplate.size, 1, 64);
  const reserved_area = sanitizeVec3(value.reserved_area as Partial<Vec3> | undefined, size, 1, 96);
  const blocks = Array.isArray(value.blocks)
    ? value.blocks
      .map(normalizeBlock)
      .filter((block): block is Block => block !== null)
      .filter((block) => isInside(block, size))
    : [];
  const markers = Array.isArray(value.markers)
    ? value.markers.filter((marker): marker is Marker => isMarker(marker) && isInside(marker, size, true))
    : [];

  return {
    building_id: String(value.building_id ?? defaultTemplate.building_id),
    building_type: String(value.building_type ?? defaultTemplate.building_type),
    level: normalizeInt(Number(value.level ?? defaultTemplate.level), 1, 99),
    display_name: String(value.display_name ?? defaultTemplate.display_name),
    size,
    reserved_area: {
      x: Math.max(reserved_area.x, size.x),
      y: Math.max(reserved_area.y, size.y),
      z: Math.max(reserved_area.z, size.z),
    },
    default_direction: isDirection(value.default_direction) ? value.default_direction : defaultTemplate.default_direction,
    markers,
    blocks,
    required_materials: aggregateMaterials(blocks),
    construction_time_ticks: normalizeInt(Number(value.construction_time_ticks ?? defaultTemplate.construction_time_ticks), 0, 999999),
    instant_complete_fron: Boolean(value.instant_complete_fron),
  };
}

function normalizeBlock(value: unknown): Block | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const blockId = String(raw.block ?? raw.block_id ?? '');
  if (!blockId) return null;
  const blockOption = findBlockOptionFromCatalog(blockId, staticBlockCatalog);
  const rawProperties = raw.properties as Record<string, unknown> | undefined;
  return {
    x: normalizeInt(Number(raw.x), 0, 128),
    y: normalizeInt(Number(raw.y), 0, 128),
    z: normalizeInt(Number(raw.z), 0, 128),
    block: blockId,
    properties: normalizeProperties(blockOption, rawProperties),
  };
}

function normalizeProperties(blockOption: BlockOption, properties?: Record<string, unknown>): BlockProperties | undefined {
  if (blockOption.kind === 'slab') {
    return { type: isSlabType(properties?.type) ? properties.type : 'bottom' };
  }
  if (blockOption.kind === 'stairs') {
    return {
      facing: isDirection(properties?.facing) ? properties.facing : 'south',
      half: isStairHalf(properties?.half) ? properties.half : 'bottom',
      shape: 'straight',
    };
  }
  if (blockOption.kind === 'door') {
    const defaults = defaultPropertiesForKind('door');
    return { ...defaults, ...stringifyProperties(properties) } as BlockProperties;
  }
  const defaults = blockOption.defaultProperties;
  if (!defaults) return undefined;
  return { ...defaults, ...stringifyProperties(properties) } as BlockProperties;
}

function buildProperties(
  blockOption: BlockOption,
  values: { slabType: SlabType; stairFacing: Direction; stairHalf: StairHalf; stairShape: StairShape; buttonFace: string; buttonFacing: Direction },
): BlockProperties | undefined {
  if (blockOption.kind === 'slab') return { type: values.slabType };
  if (blockOption.kind === 'stairs') {
    return { facing: values.stairFacing, half: values.stairHalf, shape: values.stairShape };
  }
  if (blockOption.kind === 'button') {
    return { face: values.buttonFace, facing: values.buttonFacing, powered: 'false' } as BlockProperties;
  }
  if (blockOption.kind === 'door') {
    return { facing: 'south', half: 'lower', hinge: 'left', open: 'false', powered: 'false' } as BlockProperties;
  }
  return blockOption.defaultProperties ? { ...blockOption.defaultProperties } as BlockProperties : undefined;
}

function vanillaBlockToOption(block: VanillaBlockData): BlockOption {
  return {
    id: block.id,
    label: block.nameJa,
    nameJa: block.nameJa,
    color: inferBlockColor(block.id, block.category),
    kind: block.kind,
    category: block.category,
    defaultProperties: block.defaultProperties,
  };
}

function inferBlockColor(id: string, category: string) {
  if (category === '木材' || category === '原木') return '#a66a36';
  if (category === '石材' || category === '壁' || category === '階段' || category === 'ハーフブロック') return '#858b8f';
  if (category === '土・砂・自然') return id.includes('sand') ? '#d8c27a' : '#79543c';
  if (category === '鉱石・鉱物') return '#777d83';
  if (category === 'ガラス') return '#93d9e8';
  if (category === 'フェンス' || category === 'ドア' || category === 'トラップドア') return '#9a6336';
  if (category === '光源') return '#f0b93c';
  if (category === '植物') return '#4f8f3f';
  if (category === '作業・収納') return '#9d6b3b';
  if (id.includes('red')) return '#a33e3e';
  if (id.includes('blue')) return '#465fa8';
  if (id.includes('green')) return '#4f8d4b';
  if (id.includes('yellow')) return '#d8c345';
  if (id.includes('black')) return '#34313a';
  if (id.includes('white')) return '#dedede';
  return '#a3a3a3';
}

function findTextureForBlock(blockId: string, textureMap: TextureMap) {
  if (!blockId.startsWith('minecraft:')) return undefined;
  const name = blockId.slice('minecraft:'.length);
  const candidates = textureCandidates(name);
  for (const candidate of candidates) {
    const texture = textureMap.get(candidate);
    if (texture) return texture;
  }
  return undefined;
}

function textureCandidates(name: string) {
  const candidates = [name];
  const woodFamilies = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped'];
  for (const family of woodFamilies) {
    if (name === `${family}_stairs` || name === `${family}_slab` || name === `${family}_fence` || name === `${family}_fence_gate`) {
      candidates.push(`${family}_planks`);
    }
    if (name === `${family}_button` || name === `${family}_pressure_plate` || name === `${family}_door` || name === `${family}_trapdoor`) {
      candidates.push(`${family}_planks`);
    }
  }
  candidates.push(
    name.replace(/_stairs$/, ''),
    name.replace(/_slab$/, ''),
    name.replace(/_wall$/, ''),
    name.replace(/_button$/, ''),
    name.replace(/_pressure_plate$/, ''),
    name.replace(/_fence$/, ''),
    name.replace(/_fence_gate$/, ''),
    name.replace(/_pane$/, ''),
  );
  return Array.from(new Set(candidates.filter(Boolean)));
}

function placeBlockWithOccupancy(blocks: Block[], nextBlock: Block, blockCatalog: BlockOption[]): { ok: boolean; blocks: Block[]; message?: string; selectedKey?: string } {
  const samePositionBlocks = blocks.filter((block) => keyOf(block) === keyOf(nextBlock));
  if (samePositionBlocks.length === 0) {
    return { ok: true, blocks: [...blocks, nextBlock], selectedKey: keyOf(nextBlock) };
  }

  const nextOccupancy = getBlockOccupancy(nextBlock, blockCatalog);
  const existing = samePositionBlocks[0];
  const existingOccupancy = getBlockOccupancy(existing, blockCatalog);

  if (
    nextBlock.block === existing.block &&
    nextOccupancy.kind === 'slab' &&
    existingOccupancy.kind === 'slab' &&
    nextOccupancy.slot !== existingOccupancy.slot
  ) {
    const mergedBlock: Block = {
      ...existing,
      properties: { type: 'double' },
    };
    return {
      ok: true,
      blocks: blocks.map((block) => (block === existing ? mergedBlock : block)),
      message: '上下のハーフブロックを二重 / double に統合しました。',
      selectedKey: keyOf(mergedBlock),
    };
  }

  return {
    ok: false,
    blocks,
    message: '配置先の同じ座標はすでに占有されています。',
  };
}

function getBlockOccupancy(block: Block, blockCatalog: BlockOption[]): { kind: 'full' } | { kind: 'slab'; slot: 'bottom' | 'top' } {
  const option = findBlockOptionFromCatalog(block.block, blockCatalog);
  if (option.kind === 'slab') {
    const type = getSlabType(block.properties);
    if (type === 'bottom' || type === 'top') return { kind: 'slab', slot: type };
  }
  return { kind: 'full' };
}

function aggregateMaterials(blocks: Block[]) {
  return blocks.reduce<Record<string, number>>((materials, block) => {
    materials[block.block] = (materials[block.block] ?? 0) + 1;
    return materials;
  }, {});
}

function findBlockOptionFromCatalog(blockId: string, blockCatalog: BlockOption[]): BlockOption {
  const fallbackKind = inferBlockKind(blockId);
  return blockCatalog.find((item) => item.id === blockId) ?? {
    id: blockId,
    label: blockId,
    nameJa: blockId,
    color: '#a3a3a3',
    kind: fallbackKind,
    category: '読み込み済み',
    defaultProperties: defaultPropertiesForKind(fallbackKind),
  };
}

function defaultPropertiesForKind(kind: BlockOption['kind']): Record<string, string> | undefined {
  if (kind === 'slab') return { type: 'bottom' };
  if (kind === 'stairs') return { facing: 'south', half: 'bottom', shape: 'straight' };
  if (kind === 'door') return { facing: 'south', half: 'lower', hinge: 'left', open: 'false', powered: 'false' };
  if (kind === 'trapdoor') return { facing: 'south', half: 'bottom', open: 'false' };
  if (kind === 'button') return { face: 'wall', facing: 'south', powered: 'false' };
  if (kind === 'fence_gate') return { facing: 'south', open: 'false' };
  if (kind === 'wall_torch' || kind === 'wall_sign') return { facing: 'south' };
  if (kind === 'lantern') return { hanging: 'false' };
  if (kind === 'fence' || kind === 'pane') return { north: 'false', east: 'false', south: 'false', west: 'false' };
  if (kind === 'wall') return { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true' };
  return undefined;
}

function inferBlockKind(blockId: string): BlockOption['kind'] {
  if (blockId === 'minecraft:water' || blockId === 'minecraft:lava') return 'liquid';
  if (blockId.endsWith('_pressure_plate')) return 'pressure_plate';
  if (blockId.endsWith('_hanging_sign')) return 'hanging_sign';
  if (blockId.endsWith('_fence_gate')) return 'fence_gate';
  if (blockId.endsWith('_wall_sign')) return 'wall_sign';
  if (blockId.endsWith('_wall_torch')) return 'wall_torch';
  if (blockId.endsWith('_button')) return 'button';
  if (blockId.endsWith('_slab')) return 'slab';
  if (blockId.endsWith('_stairs')) return 'stairs';
  if (blockId.endsWith('_trapdoor')) return 'trapdoor';
  if (blockId.endsWith('_door')) return 'door';
  if (blockId.endsWith('_fence')) return 'fence';
  if (blockId.endsWith('_wall')) return 'wall';
  if (blockId.endsWith('_pane')) return 'pane';
  if (blockId.endsWith('_sign')) return 'sign';
  if (blockId.endsWith('_carpet')) return 'carpet';
  if (blockId.endsWith('_bed')) return 'bed';
  if (blockId.includes('torch')) return 'torch';
  if (blockId.includes('lantern')) return 'lantern';
  if (blockId.includes('chain')) return 'chain';
  if (blockId.includes('rail')) return 'rail';
  if (blockId.includes('redstone')) return 'redstone';
  return 'normal';
}

function blockHasFacing(block: Block) {
  const option = findBlockOptionFromCatalog(block.block, staticBlockCatalog);
  return option.kind === 'stairs' || option.kind === 'button' || option.kind === 'wall_torch' || option.kind === 'door' || option.kind === 'trapdoor' || option.kind === 'fence_gate' || option.kind === 'wall_sign' || option.kind === 'facing' || Boolean(block.properties && 'facing' in block.properties);
}

function getFacing(block: Block): Direction {
  if (block.properties && 'facing' in block.properties) return block.properties.facing;
  return 'south';
}

function stringifyProperties(properties?: Record<string, unknown>) {
  if (!properties) return {};
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, String(value)]));
}

function getProperty(block: Block, name: string, fallback: string) {
  const properties = block.properties as Record<string, string | boolean> | undefined;
  const value = properties && name in properties ? properties[name] : undefined;
  return typeof value === 'string' ? value : fallback;
}

function getBooleanProperty(block: Block, name: string, fallback: boolean) {
  const properties = block.properties as Record<string, string | boolean> | undefined;
  const value = properties && name in properties ? properties[name] : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return fallback;
}

function directionEnabled(block: Block, direction: Direction) {
  return getBooleanProperty(block, direction, true);
}

function wallPart(block: Block, direction: Direction) {
  return getProperty(block, direction, 'none') !== 'none';
}

function findMarkerLabel(type: MarkerType) {
  return markerCatalog.find((item) => item.markerType === type)?.label ?? type;
}

function isSelectedCatalogItem(item: CatalogItem, selectedBlockId: string, selectedMarker: MarkerType, mode: EditMode) {
  if (item.itemType === 'block') return item.id === selectedBlockId && mode === 'block';
  return item.markerType === selectedMarker && mode === 'marker';
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function isInside(position: Vec3, size: Vec3, allowGroundEdge = false) {
  const minZ = allowGroundEdge ? -1 : 0;
  return (
    position.x >= 0 &&
    position.x < size.x &&
    position.y >= 0 &&
    position.y < size.y &&
    position.z >= minZ &&
    position.z < size.z
  );
}

function sanitizeVec3(value: Partial<Vec3> | undefined, fallback: Vec3, min: number, max: number): Vec3 {
  return {
    x: normalizeInt(Number(value?.x ?? fallback.x), min, max),
    y: normalizeInt(Number(value?.y ?? fallback.y), min, max),
    z: normalizeInt(Number(value?.z ?? fallback.z), min, max),
  };
}

function sanitizeFileName(value: string) {
  return (value || 'building_template').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isMarker(value: unknown): value is Marker {
  if (!value || typeof value !== 'object') return false;
  const marker = value as Partial<Marker>;
  return isMarkerType(marker.type) && Number.isFinite(Number(marker.x)) && Number.isFinite(Number(marker.y)) && Number.isFinite(Number(marker.z));
}

function isMarkerType(value: unknown): value is MarkerType {
  return value === 'entrance' || value === 'road_connection' || value === 'npc_spawn' || value === 'shop_counter';
}

function isDirection(value: unknown): value is Direction {
  return value === 'north' || value === 'east' || value === 'south' || value === 'west';
}

function isSlabType(value: unknown): value is SlabType {
  return value === 'bottom' || value === 'top' || value === 'double';
}

function isStairHalf(value: unknown): value is StairHalf {
  return value === 'bottom' || value === 'top';
}

function getSlabType(properties: Block['properties']): SlabType {
  return properties && 'type' in properties && isSlabType(properties.type) ? properties.type : 'bottom';
}

function getStairProperties(properties: Block['properties']) {
  if (properties && 'facing' in properties) {
    return {
      facing: properties.facing,
      half: isStairHalf(properties.half) ? properties.half : 'bottom',
      shape: 'straight' as const,
    };
  }
  return { facing: 'south', half: 'bottom', shape: 'straight' } as const;
}

export { App };
