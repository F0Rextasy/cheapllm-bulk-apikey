# cheapllm-bulk-apikey

**cheapllm.shop のアカウントと API キーを一括作成 — 完全自動・キャプチャなし — し、そのキーを OpenAI 互換エンドポイント（`sk-cheap-…`、DeepSeek V4.1 Flash 1017）またはローカル 9Router で使います。**

- コマンド1つ、質問1つ：**キーを何本作るか**
- 各キーは保存前に**実際の chat 200** で検証
- **プロキシは任意**：直接実行でも動きます。`proxies.txt` があればキーごとに専用出口

## 🚀 クイックスタート

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

次に:

```
1) Mint keys       — ask how many, then run to the end
```

数字を入れて Enter。これが全フローです：アカウントごとに新しいメールボックスを作り、登録し、確認リンクをメールから読み、開き、API を1回呼び、それから初めてキーが `keys.txt` に追記されます。

メニューなし:

```bash
node src/cli.js --count 10            # 10 キー、直接
node src/cli.js --count 100 --pool proxies.txt   # 100 キー、1キー1出口
node src/cli.js verify                # 保存済み全キーの実測
```

## 🎁 アカウントで得られるもの

| 項目 | 値 |
| --- | --- |
| パネル | [cheapllm.shop](https://cheapllm.shop) |
| モデル | `deepseek-v4.1-flash-1017`（コンテキスト 131 072） |
| ベータ期間中 | 無料、レート制限なし |
| ベータ後 | **1アカウントあたり毎時 5 000 入力 + 1 000 出力トークン**、カード不要 |
| それを超える場合 | $0.05 / M 入力 · $0.009 / M キャッシュ入力 · $0.42 / M 出力 |
| 並列性 | 1アカウントにつき実行中リクエストは1本 |
| アカウントあたりのキー | パネルは25本。本ツールは**1アカウント1キー**のみ取得（枠とクォータはアカウント単位のため） |
| スケールの単位 | **1アカウント = 1キー** — `--count N` は N アカウント作成 |

最新の数値: `curl https://cheapllm.shop/api/config`。

## 🧭 仕組み

```
新しいメールボックス (temp.tf)   登録                 確認                 ゲート
──────────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
plus エイリアス・実ドメイン      201 + キー + cookie   302 verified        200 + テキスト
```

1. temp.tf で新しい plus エイリアスを作成（outlook/hotmail 系）。`--rail mailtm` で mail.tm も可。
2. `POST /api/signup {email,password,website:"",consent:true}` が **201** を返し、同じ本文にキーが入っています。
3. パネルが確認リンクをメールします。ツールは受信箱をポーリングし、`https://cheapllm.shop/verify?token=…` を取り出して開きます（**302** でダッシュボードへ）。
4. そのキーで `/v1/chat/completions` を1回呼び、アシスタント本文付きの 200 が出たら合格。その後でキーを書き込みます。

この一連の流れにキャプチャはありません。解くものも、貼るトークンもありません。

## ✅ 品質ゲート

- **キーは実際の `chat 200`（本文あり）の後にしか書かれません。** 失敗したゲートは `keys.txt` に入りません。
- `node src/cli.js verify` は保存済みの全キーを再検証し、キーごとに LIVE/DEAD を報告します。
- 確認リンクのタイムアウト、パネルのアドレス制限、死んだ出口は明示的なエラーになります。ツールが合格を「推測」することはありません。

## 🛰️ プロキシ — 任意

| モード | 方法 | 適用されるパネル規則 |
| --- | --- | --- |
| 直接（既定） | `proxies.txt` なし | **1アドレスあたり毎時5アカウント** — 以降は `429 Too many new accounts from this address` |
| プール | `proxies.txt` に1行1プロキシ | キーごとに**専用出口**を1つ。出口は再利用しない |

`--pool` では **fail-closed**：出口が途中で死ねばキーも失敗し、自分のアドレスへ黙ってフォールバックしません。`outputs/exits-used.txt` が「どの出口がどのアカウントを運んだか」を記録します。

## 🔌 9Router への接続

メニュー `4`、または:

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

`cheapllm.shop` を OpenAI 互換プロバイダ（`prefix cheapllm`）として登録し、キーごとに接続を追加してクライアントキーを出力します。OpenAI 互換ルーターならどれでも `base_url: https://cheapllm.shop/v1` で同様に使えます。

## ⚙️ CLI リファレンス

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| フラグ | 意味 |
| --- | --- |
| `--count N` | 作成するアカウント/キー数 |
| `--pool FILE` | 1キー1出口・専用・fail-closed |
| `--rail temptf\|mailtm` | メールバックエンド（既定 `temptf`） |
| `--delay MS` | アカウント間の待機（既定 5000） |
| `--attempts N` | 1キーが消費してよい出口数（既定 3） |
| `--auto` | 質問なし（もともと自動） |
| `--dry` | 計画を表示。リクエストも書き込みもしない |
| `--allow-overlimit` | 直接モードのみ：ローカルの毎時5件ガードを無視（パネルは拒否します） |

## 📦 出力

| ファイル | 内容 |
| --- | --- |
| `keys.txt` | 有効キーを1行ずつ。chat 200 の後だけ追記 |
| `outputs/accounts.jsonl` | メール、パスワード、キー、出口、レール、時刻（ローカル・gitignore） |
| `outputs/ledger-YYYY-MM-DD.jsonl` | 各試行の状態と所要時間 |
| `outputs/exits-used.txt` | 消費済み出口（プール実行） |

`keys.txt`、`accounts.jsonl`、`proxies.txt`、`outputs/` は gitignore 済み — キー・アカウント・プロキシ端点は絶対にコミットしないでください。

## 📁 プロジェクト構成

```
src/cli.js               mint / verify / dry run
src/launcher.js          ワンクリックメニュー（npm start）
src/connect-9router.js   9Router コネクタ
src/lib/panel.js         signup / verify / chat、アカウント単位の識別
src/lib/temptf.js        temp.tf メールボックス + リンク監視
src/lib/mailtm.js        mail.tm メールボックス + リンク監視
src/lib/proxy.js         プロキシ解析とトンネル（依存ゼロ）
docs/PROTOCOL.md         実測した一連の流れ、エンドポイントごと
examples/mint-and-chat.js
```

## ⚠️ 免責

無料枠、アドレス制限、確認メールの挙動は cheapllm.shop が定めるもので、予告なく変わります。1つのアドレスから多数のアカウントを作ることは運営者に見えており、規約はアカウントの制限・停止を許しています。プロキシプールと控えめなバッチを使ってください。本プロジェクトは cheapllm.shop と無関係です。自己責任で、提供者の規約を守って使用してください。

## 📄 ライセンス

MIT
