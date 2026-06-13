import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const jarPath = process.argv[2];
const langPath = 'assets/minecraft/lang/ja_jp.json';
const outputPath = resolve('public/data/vanilla_blocks_ja.json');

if (!jarPath) {
  console.error('Usage: node scripts/generateVanillaBlocks.mjs "/path/to/minecraft.jar"');
  process.exit(1);
}

if (!existsSync(jarPath)) {
  console.error(`Minecraft jar not found: ${jarPath}`);
  process.exit(1);
}

function readJarEntry(jarFile, entryPath) {
  try {
    return execFileSync('unzip', ['-p', jarFile, entryPath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function findMinecraftRootFromJar(jarFile) {
  const normalized = resolve(jarFile);
  const marker = `${join('versions', '')}`;
  const index = normalized.lastIndexOf(marker);
  if (index === -1) return null;
  return normalized.slice(0, index);
}

function readAssetIndexLanguage(jarFile) {
  const minecraftRoot = findMinecraftRootFromJar(jarFile);
  if (!minecraftRoot) return null;
  const assetsDir = join(minecraftRoot, 'assets');
  const indexesDir = join(assetsDir, 'indexes');
  if (!existsSync(indexesDir)) return null;

  const indexes = readdirSync(indexesDir)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  for (const indexFile of indexes) {
    const indexPath = join(indexesDir, indexFile);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    const entry = index.objects?.['minecraft/lang/ja_jp.json'];
    if (!entry?.hash) continue;
    const objectPath = join(assetsDir, 'objects', entry.hash.slice(0, 2), entry.hash);
    if (existsSync(objectPath)) {
      console.warn(`${langPath} was not found in the jar. Using local Minecraft asset index ${indexFile} instead.`);
      return readFileSync(objectPath, 'utf8');
    }
  }
  return null;
}

function inferKind(id) {
  if (id === 'minecraft:water' || id === 'minecraft:lava') return 'liquid';
  if (id.endsWith('_pressure_plate')) return 'pressure_plate';
  if (id.endsWith('_hanging_sign')) return 'hanging_sign';
  if (id.endsWith('_fence_gate')) return 'fence_gate';
  if (id.endsWith('_trapdoor')) return 'trapdoor';
  if (id.endsWith('_wall_sign')) return 'wall_sign';
  if (id.endsWith('_wall_torch') || id === 'minecraft:redstone_wall_torch') return 'wall_torch';
  if (id.endsWith('_button')) return 'button';
  if (id.endsWith('_stairs')) return 'stairs';
  if (id.endsWith('_lantern')) return 'lantern';
  if (id.endsWith('_torch')) return 'torch';
  if (id.endsWith('_carpet')) return 'carpet';
  if (id.endsWith('_bed')) return 'bed';
  if (id.endsWith('_fence')) return 'fence';
  if (id.endsWith('_door')) return 'door';
  if (id.endsWith('_slab')) return 'slab';
  if (id.endsWith('_wall')) return 'wall';
  if (id.endsWith('_pane')) return 'pane';
  if (id.endsWith('_sign')) return 'sign';
  if (id.includes('chain')) return 'chain';
  if (id.includes('rail')) return 'rail';
  if (id.includes('redstone')) return 'redstone';
  if (/(sapling|flower|mushroom|coral|kelp|vines|moss|azalea|grass|fern|bush|roots|lily_pad|cactus|sugar_cane|bamboo|nether_sprouts|twisting_vines|weeping_vines)/.test(id)) return 'plant';
  if (/(wheat|carrots|potatoes|beetroots|melon_stem|pumpkin_stem|cocoa|pitcher_crop|torchflower_crop|sweet_berry_bush|cave_vines)/.test(id)) return 'crop';
  if (/(banner|skull|head|pot|painting|decorated_pot|candle|bell)/.test(id)) return 'decoration';
  return 'normal';
}

function defaultPropertiesFor(kind) {
  if (kind === 'slab') return { type: 'bottom' };
  if (kind === 'stairs') return { facing: 'south', half: 'bottom', shape: 'straight' };
  if (kind === 'wall') return { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true' };
  if (kind === 'fence' || kind === 'pane') return { north: 'false', east: 'false', south: 'false', west: 'false' };
  if (kind === 'fence_gate') return { facing: 'south', open: 'false' };
  if (kind === 'door') return { facing: 'south', half: 'lower', hinge: 'left', open: 'false', powered: 'false' };
  if (kind === 'trapdoor') return { facing: 'south', half: 'bottom', open: 'false' };
  if (kind === 'button') return { face: 'wall', facing: 'south', powered: 'false' };
  if (kind === 'wall_torch') return { facing: 'south' };
  if (kind === 'lantern') return { hanging: 'false' };
  if (kind === 'wall_sign') return { facing: 'south' };
  return undefined;
}

function inferCategory(id, nameJa, kind) {
  const text = `${id} ${nameJa}`;
  if (kind === 'slab') return 'ハーフブロック';
  if (kind === 'stairs') return '階段';
  if (kind === 'wall') return '壁';
  if (kind === 'fence' || kind === 'fence_gate') return 'フェンス';
  if (kind === 'door') return 'ドア';
  if (kind === 'trapdoor') return 'トラップドア';
  if (kind === 'lantern' || kind === 'torch' || kind === 'wall_torch' || /light|lamp|candle|lantern|torch|glow|sea_lantern|ランタン|松明|たいまつ|照明|ろうそく|光/.test(text)) return '光源';
  if (/glass|ガラス/.test(text)) return 'ガラス';
  if (/log|stem|hyphae|原木|幹|菌糸/.test(text)) return '原木';
  if (/planks|wood|bamboo|板材|木材|竹/.test(text)) return '木材';
  if (/ore|raw_|diamond|emerald|lapis|redstone|coal|copper|iron|gold|netherite|amethyst|quartz|鉱石|原石|ダイヤモンド|エメラルド|ラピス|レッドストーン|石炭|銅|鉄|金|ネザライト|アメジスト|クォーツ/.test(text)) return '鉱石・鉱物';
  if (/stone|cobble|brick|deepslate|granite|diorite|andesite|tuff|basalt|blackstone|石|丸石|レンガ|深層岩|花崗岩|閃緑岩|安山岩|凝灰岩|玄武岩|ブラックストーン/.test(text)) return '石材';
  if (/dirt|grass|sand|gravel|clay|mud|snow|ice|nylium|netherrack|soul_|end_stone|土|草|砂|砂利|粘土|泥|雪|氷|ナイリウム|ネザーラック|ソウル|エンドストーン/.test(text)) return '土・砂・自然';
  if (kind === 'plant' || kind === 'crop' || /leaves|sapling|flower|mushroom|coral|kelp|vines|moss|azalea|crop|wheat|cactus|sugar_cane|bush|葉|苗木|花|キノコ|サンゴ|昆布|ツタ|苔|作物|小麦|サボテン|サトウキビ|低木/.test(text)) return '植物';
  if (/crafting|furnace|chest|barrel|anvil|table|loom|stonecutter|grindstone|smithing|brewing|cauldron|beacon|hopper|dropper|dispenser|shulker|作業台|かまど|チェスト|樽|金床|台|織機|石切台|砥石|鍛冶|醸造|大釜|ビーコン|ホッパー|ドロッパー|ディスペンサー|シュルカー/.test(text)) return '作業・収納';
  if (kind === 'carpet' || kind === 'bed' || kind === 'sign' || kind === 'wall_sign' || kind === 'hanging_sign' || kind === 'chain' || kind === 'rail' || kind === 'redstone' || kind === 'decoration' || kind === 'button' || kind === 'pressure_plate' || /bed|banner|carpet|wool|painting|pot|skull|head|decorated|sherd|chain|rail|bell|ベッド|旗|カーペット|羊毛|絵画|植木鉢|頭|模様入り|壺|鎖|レール|鐘/.test(text)) return '装飾';
  return 'その他';
}

const langRaw = readJarEntry(jarPath, langPath) ?? readAssetIndexLanguage(jarPath);
if (!langRaw) {
  console.error(`Could not read ${langPath} from ${jarPath} or local Minecraft assets.`);
  process.exit(1);
}
const lang = JSON.parse(langRaw);
const blocks = Object.entries(lang)
  .filter(([key]) => key.startsWith('block.minecraft.'))
  .map(([key, nameJa]) => {
    const path = key.slice('block.minecraft.'.length);
    const id = `minecraft:${path}`;
    const kind = inferKind(id);
    const block = {
      id,
      nameJa: String(nameJa),
      category: inferCategory(id, String(nameJa), kind),
      kind,
    };
    const defaultProperties = defaultPropertiesFor(kind);
    if (defaultProperties) block.defaultProperties = defaultProperties;
    return block;
  })
  .sort((a, b) => a.id.localeCompare(b.id));

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(blocks, null, 2)}\n`);

console.log(`Generated ${blocks.length} vanilla blocks: ${outputPath}`);
