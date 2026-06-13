# Flat Frontier Building Editor

Minecraft Java Edition / NeoForge 26.1.2 向け MOD「Flat Frontier」で使用する建物テンプレート JSON を作成する、ブラウザ完結型の 3D 建物エディタです。

React + Vite + TypeScript + React Three Fiber で作成しています。サーバーは不要で、GitHub Pages に静的サイトとして公開できます。

## 主な機能

- 3D グリッド上への立方体ブロック配置・削除
- ブロックパレットから `block` ID を選択
- 建物サイズ `x / y / z` と `reserved_area` の編集
- `entrance` / `road_connection` / `npc_spawn` / `shop_counter` マーカーの配置
- 建物テンプレート JSON の出力
- JSON の読み込みと再編集
- ブロック数から `required_materials` を自動集計
- ハーフブロックと階段ブロックの `properties` 編集
- 配置済みブロックの選択と 1 ブロック単位の移動
- 左側に設定、右側に 3D ビューを置いた 2 カラム編集画面
- Webサイト全体はスクロールせず、左側パネルだけ内部スクロール
- GitHub Pages デプロイ用の設定

## 操作方法

### 画面構成

画面左側はタブ式の設定パネルです。
上部には、選択中ブロック、配置予定座標、ブロック数、マーカー数、現在の編集モードを常時表示します。
タブ内容だけが内部スクロールし、Webサイト全体にはスクロールを出さない構成です。
画面右側は大きな 3D ビューです。

左パネルのタブは次の役割です。

- 建物: 建物ID、表示名、種類、サイズ、予約範囲などの建物設定
- ブロック: ブロック検索、カテゴリ選択、ブロック一覧、配置時 properties
- 編集: 編集モード、選択中ブロックの座標、移動、回転、properties 編集、削除、マーカー設定
- 範囲: 開始座標と終了座標を指定した一括配置、上書き配置、範囲削除
- JSON: JSON コピー、ダウンロード、読み込み、サンプル読み込み、材料集計、ヘルプ

### 起動直後の状態

起動直後はブロックもマーカーも配置されていない空の状態から始まります。
サンプル建物は自動配置しません。必要な場合は、別途 JSON を読み込んで編集します。

### ブロックの配置方法

左側の「ブロックパレット」から配置したいブロックを選びます。
ブロックタブでは、日本語名または `block id` で検索できます。例: `階段`、`stairs`、`オーク`
検索結果は最初に最大 50 件を表示し、「さらに表示」で追加表示できます。
編集モードが「ブロック配置」の状態で、3D ビュー上の空いているマスに出る半透明プレビュー位置をクリックするとブロックを配置できます。
配置済みブロックの面をクリックした場合は、クリックした面の法線方向に 1 マスずらした座標へ配置します。
たとえば上面をクリックすると `y+1`、側面をクリックすると東西南北方向に 1 マスずれた位置へ配置されます。
床グリッドをクリックした場合は `y=0` に配置されます。

### ブロックの削除方法

編集モードで「ブロック削除」を選び、3D ビュー上の配置済みブロックをクリックします。
選択中のブロックを削除した場合、選択状態も解除されます。

### ブロックの選択方法

3D ビュー上の配置済みブロックをクリックすると、そのブロックが選択されます。
選択中ブロックは枠線と発光で分かりやすく表示されます。

### ブロックの移動方法

3D ビュー上の配置済みブロックをクリックすると、そのブロックが選択されます。
左側パネルの「選択ブロックの移動」から「東へ」「西へ」「上へ」「下へ」「南へ」「北へ」を押すと、1 ブロックずつ移動できます。
移動先が建物サイズの範囲外の場合、または移動先に別のブロックがある場合は移動できません。

### ハーフブロックの置き方

「ハーフブロック」カテゴリから `_slab` のブロックを選びます。
「ブロックプロパティ」で `type` を `bottom` / `top` / `double` から選んで配置します。
3D ビューでは `bottom` は下半分、`top` は上半分、`double` は通常ブロック相当の高さで表示されます。
`bottom` と `top` の同種ハーフブロックが同じ座標で重なった場合は、`double` として扱える設計にしています。

### 階段ブロックの置き方

「階段」カテゴリから `_stairs` のブロックを選びます。
「ブロックプロパティ」で `facing`、`half`、`shape` を選んで配置します。
現在の `shape` は `straight` に対応しています。
階段は簡易形状で表示され、`facing` に応じて見た目の向きも変わります。

### 階段ブロックの向き変更

3D ビュー上で配置済みの階段ブロックをクリックすると、左側パネルの「選択中ブロック」に情報が表示されます。
そこで `facing`、`half`、`shape` を編集できます。
「左回転」「右回転」「北向き」「東向き」「南向き」「西向き」ボタンでも向きを変更できます。
右回転は `north → east → south → west → north` の順に切り替わります。

### ドアブロックの置き方

`_door` のブロックは通常の 1×1×1 立方体ではなく、Minecraft のドアに近い薄い縦板として表示します。
配置時に上側の空間が空いていれば、`half: lower` と `half: upper` の 2 つの block entry を上下に並べて配置します。
JSON 互換性のため、ドアは lower と upper を別々の entry として保存します。
`half: lower` は取っ手のある下側、`half: upper` は窓表現のある上側として表示します。

### ドアの向き変更と開閉

配置済みのドアを選択すると、左側パネルで `facing`、`half`、`hinge`、`open` を編集できます。
「左回転」「右回転」または `R` / `Shift + R` で `facing` を変更できます。
`open` をオンにすると、`hinge` を基準に開いた状態の薄板表示になります。
`powered` は Ver.0.1 では JSON 保存用の値として `false` を基本に扱います。

### ランタンブロックの表示

`minecraft:lantern` と `minecraft:soul_lantern` は通常の 1×1×1 立方体ではなく、小型の装飾ブロックとして表示します。
`hanging: false` の場合はブロック空間の下側に置かれたランタン、`hanging: true` の場合は上側から吊り下がったランタンとして表示します。
通常ランタンは暖色系、魂のランタンは青緑系の発光表現を使います。
選択中ブロックの properties で `hanging` を切り替えられ、`waterlogged` は JSON 保存用に `false` を基本値として扱います。

### 3Dビューの操作方法

左ドラッグでカメラ回転、ホイールでズーム、右ドラッグで平行移動できます。
3D ビュー右上のボタンで、カメラリセット、上から視点、正面視点、斜め視点を切り替えられます。
3D ビューには軸ガイドを表示しています。X は横方向、Y は高さ、Z は奥行きです。
X 軸は赤、Y 軸は緑、Z 軸は青で表示され、建物の少し外側に出るためブロック配置後も方向を確認できます。
左パネルとビュー上部には、マウスが乗っている配置予定座標を `x / y / z` で表示します。
3D ビュー右上の座標パネルでは、配置予定座標と選択中ブロックの座標を確認できます。
選択中ブロックがある場合は、右上パネルの小さな移動ボタンからも東西南北・上下へ動かせます。
上視点では X/Z のラベルと座標番号を見ながら配置位置を確認できます。

### 範囲一括配置

左パネルの範囲タブで開始座標と終了座標を指定すると、現在選択しているブロックを範囲内へまとめて配置できます。
「空きだけ配置」は既にブロックが置かれている座標をスキップします。
「上書き配置」は範囲内を選択中ブロックで置き換えます。
「範囲削除」は範囲内のブロックをまとめて削除します。
一度に配置できる範囲は、操作が重くなりすぎないよう 8000 ブロック以内に制限しています。

### 原木ブロックの向き設定

`_log`、`_stem`、`_wood`、`_hyphae` のブロックは原木系として扱います。
「ブロックプロパティ」または配置済みブロックの「選択中ブロック」で `axis` を変更できます。

- `y`: 縦向き
- `x`: 横向きX
- `z`: 横向きZ

Minecraft jar / resource pack zip からテクスチャを読み込んでいる場合、原木の側面には `oak_log.png` のような側面テクスチャ、端面には `oak_log_top.png` のような端面テクスチャを使います。
テクスチャがない場合も、側面と端面を色分けし、端面には簡易的な年輪表示を出します。
原木の `axis` は JSON の `properties` に保存されます。

### キーボードショートカット

- `R`: 選択中ブロックを右回転
- `Shift + R`: 選択中ブロックを左回転
- `Delete` / `Backspace`: 選択中ブロックを削除
- 矢印キー: 選択中ブロックを X/Z 方向へ移動
- `PageUp` / `Q`: 選択中ブロックを上へ移動
- `PageDown` / `E`: 選択中ブロックを下へ移動

### JSONダウンロード方法

左側の JSON タブで「コピー」を押すと、現在の建物テンプレート JSON がテキスト欄とクリップボードに出力されます。
「JSONをダウンロード」を押すと、`building_id` をファイル名にした JSON ファイルを保存できます。
例: `general_store_lv1.json`

### JSON読み込み方法

「JSONを読み込み」から `.json` ファイルを選ぶか、テキスト欄に JSON を貼り付けて「テキストから読み込み」を押します。
読み込んだ JSON は再編集できます。

### テクスチャ方針

このエディタには Minecraft 公式テクスチャを同梱しません。
3D ビューではブロック種別を色分けで表示し、MOD 側で読み込める建物 JSON を正確に作成することを優先しています。
ローカルの Minecraft jar または resource pack zip をブラウザで選択すると、`assets/minecraft/blockstates/`、`assets/minecraft/models/block/`、`assets/minecraft/textures/block/` を一時的に読み込み、3D プレビューに使えます。
読み込んだ blockstates / models / textures は外部送信せず、GitHubにも保存しません。
JSONにも画像は含めず、`block id` と `properties` のみ保存します。

### 装飾系ブロックの表示

Minecraft jar / resource pack zip を読み込んでいる場合は、blockstates と block model の `elements` / `faces` / texture 変数を解決して表示します。
まずは代表的なブロックを優先対応しており、対応できないブロックやモデル解決できないブロックは、これまで通り `kind` に応じた簡易形状や色分け表示にフォールバックします。

## 起動方法

Node.js 22 以上を推奨します。

```bash
npm install
npm run dev
```

表示された URL をブラウザで開くとエディタを使用できます。

## バニラブロック一覧の生成

Minecraft 本体 jar から、日本語名付きのバニラブロック一覧を生成できます。
Minecraft 本体 jar や公式テクスチャはリポジトリに入れません。生成するのは `block id` と日本語名などを含む JSON データだけです。

```bash
node scripts/generateVanillaBlocks.mjs "/Users/kakitanitakuya/Library/Application Support/minecraft/versions/26.1.2/26.1.2.jar"
```

出力先:

```text
public/data/vanilla_blocks_ja.json
```

生成データには次の情報が入ります。

- `id`: `minecraft:oak_planks` のような block id
- `nameJa`: 日本語表示名
- `category`: 木材、石材、階段、ハーフブロックなどの推定カテゴリ
- `kind`: `normal`、`slab`、`stairs`、`door` などの推定種別
- `defaultProperties`: slab、stairs、door などで使う初期 properties

最近の Minecraft jar では `assets/minecraft/lang/ja_jp.json` が jar 内に含まれず、ローカルの assets index に分かれている場合があります。
その場合、このスクリプトは同じ Minecraft インストール内の assets index から `minecraft/lang/ja_jp.json` を探して生成します。

## Minecraft jar / resource pack zip の読み込み

左パネルの「テクスチャ読込」から、ローカルの `.jar` または `.zip` を選択できます。
ブラウザ内で zip として展開し、`assets/minecraft/textures/block/` 以下の PNG を読み込みます。

最小対応として、次のような単純な対応で3Dプレビューへ反映します。

- `minecraft:oak_planks` → `assets/minecraft/textures/block/oak_planks.png`
- `minecraft:stone_bricks` → `assets/minecraft/textures/block/stone_bricks.png`
- `minecraft:oak_stairs` → `oak_stairs.png`、見つからない場合は `oak_planks.png`
- `minecraft:oak_slab` → `oak_slab.png`、見つからない場合は `oak_planks.png`

読み込んだテクスチャはブラウザ内のメモリ上でのみ使います。
公式 jar、resource pack、抽出済みテクスチャはコミットしないでください。

## ビルド

```bash
npm run build
```

ビルド結果は `dist` に出力されます。

## GitHub Pages で公開する方法

このリポジトリには GitHub Actions による Pages 公開設定が含まれています。

1. GitHub のリポジトリ設定を開きます。
2. `Settings` → `Pages` に移動します。
3. `Build and deployment` の `Source` を `GitHub Actions` に設定します。
4. `main` ブランチへ push します。
5. `.github/workflows/deploy.yml` が実行され、ビルド結果が GitHub Pages に公開されます。

手元から `gh-pages` ブランチへ公開したい場合は、次のコマンドも使用できます。

```bash
npm run deploy
```

## JSON 形式

出力 JSON は次の項目を基本にしています。

- `building_id`
- `building_type`
- `level`
- `display_name`
- `size`
- `reserved_area`
- `default_direction`
- `markers`
- `blocks`
- `required_materials`
- `construction_time_ticks`
- `instant_complete_fron`

`required_materials` は配置済みブロックから自動集計されます。
初期状態では `blocks: []`、`markers: []` として出力されます。
ハーフブロックや階段ブロックは `properties` を含めて保存されます。
配置後に変更した `facing`、`half`、`shape`、`type` も JSON に反映されます。
装飾系ブロックの `facing`、`open`、`hanging`、接続方向などの `properties` も、編集した内容が JSON に保存されます。
ドアブロックは `facing`、`half`、`hinge`、`open`、`powered` を `properties` に保存します。
原木ブロックは `axis` を `properties` に保存します。

## ブロック一覧について

ブロック一覧は、`public/data/vanilla_blocks_ja.json` をメインデータとして読み込みます。
この JSON は Minecraft 本体 jar またはローカル assets index から生成します。
Flat Frontier 独自ブロックは `src/data/flatFrontierBlocks.ts` で別管理しています。
JSON には日本語表示名ではなく、`minecraft:oak_planks` や `flatfrontier:frontier_planks` のような英語の `block id` を保存します。
Minecraft 公式テクスチャは同梱せず、3D ビューでは色分けされた簡易表示を使います。
