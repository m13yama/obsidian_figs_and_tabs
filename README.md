# Figures and Tables

Obsidianのcalloutを使って、図・表にキャプションを付け、横並びやグリッドに配置するプラグインです。閲覧モードとLive Previewに対応します。元の画像リンクやMarkdown表をそのまま使います。

現在はbeta版です。[GitHub Releases](https://github.com/m13yama/obsidian_figs_and_tabs/releases) からダウンロードできます。

## インストール

1. [0.1.0（beta）のリリースページ](https://github.com/m13yama/obsidian_figs_and_tabs/releases/tag/0.1.0) のAssetsから `figures-and-tables-0.1.0.zip` をダウンロードして展開します。
2. 展開された `figures-and-tables` フォルダを、利用するVaultの `.obsidian/plugins/` にコピーします。
3. Obsidianの「設定 → コミュニティプラグイン」で **Figures and Tables** を有効にします。必要に応じてObsidianを再読み込みしてください。

インストールに必要なのは `main.js`・`manifest.json`・`styles.css` の3ファイルです。Assetsから個別にダウンロードし、`.obsidian/plugins/figures-and-tables/` に配置することもできます。ソースコードや `node_modules` は不要です。GitHubが自動生成する「Source code」のZIPはインストール用ではありません。

## 図と表

```markdown
> [!figure] 実験装置の全体像
> ![[apparatus.png]]

> [!table] 各手法の精度
> | 手法 | 精度 |
> | --- | ---: |
> | A | 92.1% |
> | B | 95.3% |
```

図のキャプションは下、表のキャプションは上に、どちらも中央揃えで表示します。キャプションにはObsidianがcalloutのタイトルで扱える太字、リンク、インライン数式を記述できます。画像は `![代替テキスト](images/apparatus.png)` でも記述できます。代替テキストとキャプションは別々に指定できます。

位置を個別に変える場合は `[!figure|caption=top]` または `[!table|caption=bottom]` と書きます。設定画面では図と表それぞれの既定位置を変更できます。

## グリッド

```markdown
> [!grid|cols=2 gap=16]
> > [!figure] 実験装置
> > ![[apparatus.png]]
>
> > [!table] 測定条件
> > | 項目 | 値 |
> > | --- | --- |
> > | 温度 | 25℃ |
>
> > [!figure|span=2] 時間と測定値の関係
> > ![[results.png]]

ここからはグリッドの外の本文です。
```

上段に図と表、下段に2列分の図を配置します。`span` を指定せず図表を4つ入れると2×2になります。順序はMarkdownの記述順です。グリッドの直接の子に当たる図・表を配置し、それ以外の本文は1行全体を使って表示します。

| オプション | 対象 | 値 | 省略時 |
| --- | --- | --- | --- |
| `cols=2` | grid | 1〜6の整数 | 設定画面の列数（初期値2） |
| `gap=16` | grid | 0〜96の整数、単位はpx | 設定画面の間隔（初期値16） |
| `span=2` | figure / table | 1〜6の整数 | 1列。親の列数を超えた分は切り詰める |
| `caption=bottom` | figure / table | `top` / `bottom` | 設定画面の位置 |

オプションは半角空白で区切ります。不明なオプションや不正な値は無視し、本文の表示は継続します。同じ有効なオプションが複数ある場合は最後の指定を使います。

狭い画面でも指定した列数と列またぎを維持します。各列の最小幅は240pxで、ペインに収まらない場合はグリッド全体を横スクロールできます。画像の縦横比を維持し、各項目より幅の広い表はその項目内でも横スクロールできます。

### グリッドの終わり

- `>` だけの行は、外側のgridを継続し、内側の図表を区切ります。
- `>` もない完全な空行を挟み、次の本文やcalloutを書けばグリッドの外になります。
- 本文へ戻る際に `>` を省略するだけでは、Markdownの段落継続として引用内に残る場合があります。空行を入れてください。

プラグインはObsidianが解釈したcalloutの範囲を使います。独自の終了タグはありません。プラグインを無効にすると、図・表・説明は通常のcalloutとして残ります。

## 編集コマンド

コマンドパレットで `Figures and Tables` を検索してください。必要ならObsidianのホットキー設定から割り当てられます。

| コマンド | 操作 |
| --- | --- |
| 選択範囲を図にする / 図を挿入 | 選択した行、またはカーソル行をfigureで囲む。空行では画像のひな形を挿入 |
| 選択範囲を表にする / 表を挿入 | ヘッダー・区切り行を含め表全体を選択して実行。空行では表のひな形を挿入 |
| 選択した図表をグリッドにする / グリッドを挿入 | figure / tableのcallout全体を選択して実行。空行では図2つのひな形を挿入 |
| グリッドの列数を変更（先頭行） | `[!grid]` の行にカーソルを置き、1〜6列から選択 |

図・表の作成後は「キャプション」が選択されるので、そのまま入力して置き換えられます。変換は行単位で行い、1回のUndoで戻せます。複数の図表をグリッドにする場合、各callout内の行には `>` を記述してください。

Live PreviewではObsidian標準のcalloutの表示と編集操作を使います。内容を編集する際はcalloutの編集ボタンからMarkdownを表示できます。プラグイン独自の表セルエディターは提供しません。

## サンプル

`examples/` のMarkdownノートと2つのSVGをVaultにコピーしてください。単独の図表、混在グリッド、列またぎ、2×2、キャプション位置、不正な値のフォールバックを試せます。

## 開発と検証

Node.js 22.13以降を推奨します。ソースからビルドする場合は次を実行し、生成された `dist/figures-and-tables` フォルダをVaultの `.obsidian/plugins/` にコピーしてください。

```sh
npm ci
npm test
npm run build
```

`npm run dev` は `main.js` を監視ビルドします。配布用の `dist/` は `npm run build` で更新されます。

実際のObsidianを使う検証も用意しています。

```sh
npm run build
npm run test:obsidian
```

Linuxでは `/opt/Obsidian/obsidian` を起動します。別のインストール先では `OBSIDIAN_BIN` に実行ファイルを指定してください。画面を表示できるデスクトップ環境が必要です。テストは一時ディレクトリに専用プロファイルとVaultを作成し、終了時に起動したObsidianを閉じます。既存のVaultは使いません。スクリーンショットは `test-results/` に出力します。

### 実装

- `src/options.ts`: 設定とcalloutオプションの検証。
- `src/render.ts`: 既存DOMへの装飾、キャプションのアクセシビリティ上の関連付け、変更監視と解除。
- `src/editor.ts`: CodeMirror 6拡張。Live Previewの標準calloutを監視し、表示を更新。
- `src/commands.ts`: 行単位のMarkdown変換。引用の深さと前後の区切りを保持。
- `src/main.ts`: プラグイン登録、閲覧モードのpost processor、コマンド、設定画面。
- `styles.css`: CSS Grid、キャプション配置、狭いペイン・印刷向けのスタイル。

表示処理では元のノートを書き換えません。画像・表・リンクのDOMやイベントハンドラーを維持し、属性とスタイルを追加します。監視は各描画セクションとエディター内に限定し、プラグイン自身が追加する属性を再監視しないことで更新ループを防ぎます。無効化時には追加した装飾を解除します。

### 現時点の範囲

Obsidian 1.12.7 / Linux / 標準テーマで、閲覧モード・Live Preview、グリッドの終了境界、キャプション位置、列またぎ、狭いペインでの横スクロール、幅の広い表、表の内容変更、作成コマンドとUndo、無効化・再有効化を検証済みです。構文・編集変換・表示ライフサイクルの自動テスト21件も通過しています。

図・表のキャプション、グリッド、列またぎ、配置の設定、編集コマンドを実装しています。自動採番、相互参照、サブ図の(a)(b)、Vault全体の図表一覧は未実装です。PDF出力用CSSはありますが、PDF書き出し、モバイル実機、各種コミュニティテーマでの表示は別途確認が必要です。

構文の土台は [Obsidianのcallout](https://obsidian.md/help/callouts)、表示の拡張は [Obsidianの公開API](https://github.com/obsidianmd/obsidian-api) を使用しています。
