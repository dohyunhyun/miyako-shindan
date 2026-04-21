// Cloudflare Pages Functions (serverless)
// Deploy path: /api/diagnose
// Access at: https://YOUR-DOMAIN.pages.dev/api/diagnose

const PROMPT = `あなたは「みやこ磨き」という墓石クリーニングブランドの専門AIです。みやこ磨きは手作業による丁寧な清掃を信条としており、機械的・化学的な強い処置は行いません。送られた墓石の写真を分析し、以下のJSON形式のみで回答してください。説明文やコードブロック記号は不要です。純粋なJSONだけ返してください。

【重要ルール - recommended_service には以下の禁止ワードを絶対に使わない】
禁止: 高圧洗浄 / バイオ洗浄 / ケミカル洗浄 / 薬品洗浄 / サンドブラスト / 特殊研磨 / 再生研磨

【推奨される表現（recommended_service はこれらの組み合わせで記述）】
- 手作業による丁寧な清掃
- 専用洗剤での拭き取り
- ブラシでの細部清掃
- 水洗い・拭き上げ
- 撥水コーティング施工

【推奨プラン(recommended_plan)の判定ルール】
- 梅: 墓石が綺麗で合掌・お参り・写真報告のみで十分な場合（overall_grade がAの場合など）
- 竹: 洗剤での洗浄、コケ除去、水垢除去、ブラシ清掃、拭き取りなどが必要な場合（B〜C評価の標準的ケース）
- 松: 撥水コーティング施工が推奨される場合（D評価、または長期美観維持を推奨する場合）

出力JSON:
{
  "stone_type": "石種の推定（例：黒御影石（インド産）、大島石、庵治石など）",
  "stone_type_confidence": "高/中/低",
  "estimated_age": "建墓推定年数（例：15〜20年）",
  "estimated_age_confidence": "高/中/低",
  "estimated_size": {
    "width_cm": 120,
    "depth_cm": 150,
    "height_cm": 90,
    "confidence": "高/中/低"
  },
  "deterioration": [
    {
      "type": "劣化種別（コケ/水垢/サビ/シミ/ひび割れ/風化/文字かすれ/落ち葉汚れ）",
      "severity": "程度（軽度/中度/重度）",
      "location": "箇所（例：台座前面、竿石側面）",
      "description": "具体的な状態の説明"
    }
  ],
  "overall_grade": "A〜Dの1文字（A:良好/B:軽微/C:要メンテ/D:早急対応）",
  "recommended_service": "推奨施工内容の概要（上記の禁止ワードを使わず、推奨表現で記述）",
  "recommended_timing": "推奨施工時期",
  "recommended_plan": "梅/竹/松のいずれか1文字",
  "next_inspection_months": 6,
  "notes": "その他の所見や注意事項"
}

判断に十分な情報がない場合は confidence を「低」としてください。`;

function findJSON(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) {}
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  const idx = cleaned.indexOf("{");
  if (idx === -1) return null;
  let depth = 0;
  for (let i = idx; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.substring(idx, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

// 禁止ワードを推奨表現に置換
const BANNED_PATTERNS = [
  { re: /高圧洗浄/g, rep: "手作業による丁寧な清掃" },
  { re: /バイオ洗浄/g, rep: "専用洗剤での拭き取り" },
  { re: /ケミカル洗浄/g, rep: "専用洗剤での拭き取り" },
  { re: /薬品洗浄/g, rep: "専用洗剤での拭き取り" },
  { re: /サンドブラスト/g, rep: "ブラシでの細部清掃" },
  { re: /特殊研磨/g, rep: "手作業による丁寧な清掃" },
  { re: /再生研磨/g, rep: "手作業による丁寧な清掃" },
];

function sanitizeService(svc) {
  let s = String(svc || "");
  for (const { re, rep } of BANNED_PATTERNS) s = s.replace(re, rep);
  return s;
}

// 施工内容と評価からプランを最終決定（AIの recommended_plan を検査し整合性がなければ上書き）
function decidePlan(result) {
  const svc = String(result.recommended_service || "");
  const grade = String(result.overall_grade || "C").charAt(0);
  const aiPlan = String(result.recommended_plan || "").trim();

  // 撥水コーティングを含む → 強制的に松
  if (/撥水コーティング|コーティング施工/.test(svc)) return "松";

  // 洗剤/コケ除去/水垢除去/ブラシ/拭き取りを含む → 竹以上（AIが松と言っていない限り竹）
  if (/洗剤|コケ除去|水垢除去|ブラシ|拭き取り|清掃/.test(svc)) {
    if (aiPlan === "松") return "松";
    return "竹";
  }

  // 合掌/お参り/参拝/写真報告のみ → 梅
  if (/合掌|お参り|参拝|写真報告/.test(svc) && !/洗剤|除去|清掃/.test(svc)) return "梅";

  // フォールバック: 評価ベース
  if (grade === "A") return "梅";
  if (grade === "D") return "松";
  return "竹";
}

function fixResult(r) {
  if (!r) return null;
  const g = String(r.overall_grade || "C").trim().toUpperCase().charAt(0);
  r.overall_grade = "ABCD".includes(g) ? g : "C";
  if (!Array.isArray(r.deterioration)) r.deterioration = [];
  if (!r.estimated_size) r.estimated_size = { width_cm: 80, depth_cm: 80, height_cm: 100, confidence: "低" };
  r.next_inspection_months = parseInt(r.next_inspection_months) || 6;
  // 禁止ワード除去
  r.recommended_service = sanitizeService(r.recommended_service);
  // プラン最終決定
  r.recommended_plan = decidePlan(r);
  return r;
}

export async function onRequestPost(context) {
  try {
    const apiKey = context.env.ANTHROPIC_API_KEY;
    const modelName = context.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await context.request.json();
    const { images } = body;

    if (!images || images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build image blocks (max 2 images)
    const imageBlocks = images.slice(0, 2).map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType || "image/jpeg",
        data: img.base64,
      },
    }));

    // Call Claude API with retry on overload/rate-limit (529/503/429)
    const RETRY_DELAYS_MS = [1500, 3500, 7000];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const requestBody = JSON.stringify({
      model: modelName,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text", text: PROMPT }],
        },
      ],
    });

    let apiResp = null;
    let lastErrText = "";
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      apiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: requestBody,
      });
      if (apiResp.ok) break;
      // 混雑系エラーはリトライ
      if ((apiResp.status === 529 || apiResp.status === 503 || apiResp.status === 429) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      // それ以外はリトライしない
      break;
    }

    if (!apiResp.ok) {
      const errText = await apiResp.text();
      let userMsg = `Claude API Error ${apiResp.status}: ${errText}`;
      if (apiResp.status === 529 || apiResp.status === 503) {
        userMsg = "ただいまAIサービスが混雑しています。少し時間をおいて再度お試しください。";
      } else if (apiResp.status === 429) {
        userMsg = "短時間にアクセスが集中しています。1〜2分おいて再度お試しください。";
      } else if (apiResp.status === 401 || apiResp.status === 403) {
        userMsg = "API認証エラーです。管理者にお問い合わせください。";
      } else if (apiResp.status === 404) {
        userMsg = "AIモデル設定エラーです。管理者にお問い合わせください。";
      }
      return new Response(JSON.stringify({ error: userMsg, detail: errText.substring(0, 300) }), {
        status: apiResp.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await apiResp.json();

    // Extract text from response
    let aiText = "";
    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === "text" && block.text) aiText += block.text;
      }
    }

    if (!aiText) {
      return new Response(JSON.stringify({ error: "No text in AI response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsed = findJSON(aiText);
    if (!parsed) {
      return new Response(JSON.stringify({ error: "Failed to parse JSON", raw: aiText.substring(0, 500) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = fixResult(parsed);

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
