# みやこ磨き AI 墓石診断アプリ

**公開URL:** https://shindan.miyakomigaki.com/
**ホスティング:** Cloudflare Pages (Functions 利用)
**自動デプロイ:** GitHub `main` ブランチを監視

お墓の写真から、石種・劣化状態・推奨施工プランを AI (Claude) が 30 秒で診断するウェブアプリです。

---

## 構成

```
.
├── index.html                # フロントエンド (単一ファイルSPA)
├── functions/
│   └── api/
│       └── diagnose.js       # Cloudflare Pages Function (Claude API呼び出し)
├── .gitignore
└── README.md
```

- **フロントエンド**: `index.html` 単体で動作。ブラウザで画像を選択 → Base64 圧縮 → `/api/diagnose` に POST。
- **バックエンド**: `functions/api/diagnose.js` が Cloudflare Pages Functions として `/api/diagnose` にデプロイされ、環境変数 `ANTHROPIC_API_KEY` を使って Claude API を呼び出します。

---

## ローカル確認 (任意)

Cloudflare Wrangler で確認できます。

```bash
npm install -g wrangler
wrangler pages dev . --compatibility-date=2024-01-01
# ブラウザで http://127.0.0.1:8788 を開く
```

`ANTHROPIC_API_KEY` は環境変数で渡してください。

```bash
export ANTHROPIC_API_KEY=sk-ant-...
wrangler pages dev . --compatibility-date=2024-01-01
```

---

## デプロイ

本リポジトリは Cloudflare Pages プロジェクトと GitHub 連携されています。`main` ブランチに push されると自動的に本番反映されます。

**必須環境変数 (Cloudflare Pages ダッシュボードで設定):**

| 変数名 | 値 | スコープ |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Console で発行した API キー | Production / Preview 両方 |

---

## セキュリティメモ

- `ANTHROPIC_API_KEY` は絶対に Git にコミットしない (Cloudflare 側の環境変数で設定)
- `diagnose.js` はサーバーサイド (Functions) で動作するため、ブラウザ側に API キーが露出することはありません
- 画像は最大 2 枚まで送信される仕様
