"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// ----------------------------- 型と定数 -----------------------------

type Gender = "male" | "female" | null;
type ExtraMetricKey = "ACS" | "K/D" | "WINS" | "AGE" | null;

const EXTRA_METRIC_OPTIONS: (ExtraMetricKey | "")[] = ["", "ACS", "K/D", "WINS", "AGE"]; // ""=未選択

// 0..30（24超は翌時刻）
const HOUR_CHOICES = Array.from({ length: 31 }, (_, i) => i);

// ランク（/public/ranks/{rank}.png に一致）
const RANKS = [
  "unranked", "iron1", "iron2", "iron3",
  "bronze1", "bronze2", "bronze3",
  "silver1", "silver2", "silver3",
  "gold1", "gold2", "gold3",
  "platinum1", "platinum2", "platinum3",
  "diamond1", "diamond2", "diamond3",
  "ascendant1", "ascendant2", "ascendant3",
  "immortal1", "immortal2", "immortal3",
  "radiant"
] as const;
type RankKey = typeof RANKS[number];

const FOOTER_SELECT_ITEMS = [
  { key: "platform", label: "Platform:", needsAnswer: true },
  { key: "server", label: "Server:", needsAnswer: true },
  { key: "best_friend", label: "Friend:", needsAnswer: true },
  { key: "riot_id", label: "Riot ID:", needsAnswer: true },
  { key: "ng", label: "NG行動:", needsAnswer: true },
  { key: "fav_weapon", label: "Weapon:", needsAnswer: true },
  { key: "invite_anytime", label: "いつでも誘われ待ちです！", needsAnswer: false },
  { key: "like_fullparty", label: "フルパが好きです！", needsAnswer: false },
  { key: "like_custom", label: "カスタムが好きです！", needsAnswer: false },
  { key: "welcome_likes", label: "いいねでお迎えします！", needsAnswer: false },
] as const;

// 文字数上限（暫定・必要に応じ調整）
const LIMIT = {
  nameLine: 22,
  typeExtraValue: 8,
  footerAnswer: 28,
  freeAll: 140, // 自由入力の最大文字数（描画は折返し）
};

const BASE_W = 1024;
const BASE_H = 1024;

// ---- ラベル固定フォント（TSX内で強制使用。UIで変更不可） ----
const FIXED_LABEL_FONT_FAMILY = "PublicSansFixed";
const FIXED_LABEL_FONT_URL = "/fonts/PublicSans-VariableFont.woff2"; // /opt/.../public 配下は公開URLでこうなる

// 座標
const LAYOUT = {
  name: { x: 540, y: 245 },

  typeMaleCircle: { x: 634, y: 318, r: 20 },
  typeFemaleCircle: { x: 696, y: 318, r: 20 },
  typeExtraLabel: { x: 770, y: 319 },
  typeExtraValue: { x: 850, y: 319 },

  rankText: { x: 540, y: 425 },
  rankBadge: { x: 860, y: 380, size: 75 },

  mainAgent: { x: 540, y: 540 },

  playWeekday: { x: 535, y: 650 },

  // 自由表記（1入力を折返し）
  freeStart: { x: 520, y: 735 },
  freeMaxWidth: 400,
  freeLineHeight: 34,
  freeMaxLines: 2,

  footer1Label: { x: 515, y: 880 },
  footer1Value: { x: 620, y: 880 },
  footer2Label: { x: 515, y: 915 },
  footer2Value: { x: 620, y: 915 },
};

// 色/サイズ（フォントfamilyは描画時に指定）
const STYLE = {
  nameValue: { size: 60, color: "#decfba" },
  typeExtraLabel: { size: 26, color: "#e6383f" },
  typeExtraValue: { size: 26, color: "#decfba" },
  rankText: { size: 45, color: "#decfba" },
  agentValue: { size: 36, color: "#decfba" },
  playWeekday: { size: 32, color: "#decfba" },
  free: { size: 30, color: "#decfba" },
  footerLabel: { size: 24, color: "#decfba" },
  footerValue: { size: 24, color: "#decfba" },
} as const;

// ----------------------------- ユーティリティ -----------------------------

function clampText(s: string, n: number) { return s.length <= n ? s : s.slice(0, n); }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lw: number) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const chars = Array.from(text); // 日本語安全
  let line = "";
  let lineCount = 0;
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && line !== "") {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = chars[i];
      lineCount++;
      if (lineCount >= maxLines - 1) {
        ctx.fillText(chars.slice(i).join(""), x, y + lineCount * lineHeight);
        return;
      }
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y + lineCount * lineHeight);
}

// ---- FontFace ローダ（Canvas 反映のため、必ずロードを待つ） ----
const fontCache = new Map<string, Promise<void>>();

function familyFromFilename(file: string) {
  const base = file.replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** 指定 family/name と URL をロードして document.fonts に追加し、ready まで待つ */
async function ensureFontLoaded(family: string, url: string) {
  const key = `${family}@@${url}`;
  if (fontCache.has(key)) {
    await fontCache.get(key)!;
    return;
  }

  const p = (async () => {
    // 常に指定URLからロード（checkで早期returnしない）
    const ff = new FontFace(family, `url("${url}")`, {
      style: "normal",
      weight: "100 900",
      stretch: "normal",
    });
    const loaded = await ff.load();
    (document as any).fonts.add(loaded);

    // フォントが実使用可能になるまで待機
    await (document as any).fonts.load(`16px "${family}"`, "漢"); // 日本語も含めてロード
    await (document as any).fonts.ready;

    // 代表文字でグリフ有無をチェック（日本語）
    const hasJP = (document as any).fonts.check(`16px "${family}"`, "漢");
    // ここで日本語グリフが無い場合はそのまま（後段のfallbackで吸収）
    // 必要なら UI に警告を出すフラグを立ててもOK
  })();

  fontCache.set(key, p);
  await p;
}

// ----------------------------- メイン -----------------------------

export default function Page() {
  // 動的データ
  const [cardImages, setCardImages] = useState<string[]>([]);
  const [rankBadgeBase, setRankBadgeBase] = useState<string>("/ranks");
  const [fontFiles, setFontFiles] = useState<string[]>([]); // 例: ["NotoSansJP-Regular.woff2", ...]
  const [agents, setAgents] = useState<string[]>([]);

  // 値側フォント（ユーザー選択）：ファイル名と family 名
  const [valueFontFile, setValueFontFile] = useState<string>("");
  const valueFontFamily = useMemo(
    () => (valueFontFile ? familyFromFilename(valueFontFile) : "system-ui"),
    [valueFontFile]
  );

  // 入力フォーム
  const [selectedCard, setSelectedCard] = useState<string>("");
  const [name, setName] = useState<string>(""); // NAME 下段
  const [gender, setGender] = useState<Gender>(null);
  const [typeExtraKey, setTypeExtraKey] = useState<ExtraMetricKey | null>(null);
  const [typeExtraVal, setTypeExtraVal] = useState<string>("");
  const [rank, setRank] = useState<RankKey>("iron1");
  const [main1, setMain1] = useState<string>("Astra"); // 必須相当（空選択不可想定）
  const [main2, setMain2] = useState<string>("");      // 任意
  const [weekdayFrom, setWeekdayFrom] = useState<number>(18);
  const [weekdayTo, setWeekdayTo] = useState<number>(24);
  const [holidayFrom, setHolidayFrom] = useState<number>(12);
  const [holidayTo, setHolidayTo] = useState<number>(26);
  const [freeText, setFreeText] = useState<string>(""); // 自由表記：1入力→折返し

  type FooterLine = { key: string | null; value: string };
  const [footer1, setFooter1] = useState<FooterLine>({ key: null, value: "" });
  const [footer2, setFooter2] = useState<FooterLine>({ key: null, value: "" });

  // プレビュー
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(1);

  // 初期取得＋固定ラベルフォントを先読み
  useEffect(() => {
    (async () => {
      const [cardsRes, fontsRes, ranksRes, agentsRes] = await Promise.all([
        fetch("/api/list-cards").then(r => r.json()),
        fetch("/api/list-fonts").then(r => r.json()),
        fetch("/api/list-ranks").then(r => r.json()),
        fetch("/api/list-agents").then(r => r.json()),
      ]);

      setCardImages(cardsRes.files || []);
      if (!selectedCard && cardsRes.files?.length) setSelectedCard(cardsRes.files[0]);

      const files: string[] = fontsRes.fonts || [];
      setFontFiles(files);
      // 値側フォントの初期選択：PublicSans 以外の先頭 / それが無ければ先頭
      const initial = files.find(f => !/PublicSans-VariableFont/i.test(f)) || files[0];
      if (initial) setValueFontFile(initial);

      setRankBadgeBase(ranksRes.base || "/ranks");
      setAgents(agentsRes.agents || ["Astra", "Jett"]);
      if (!agentsRes.agents?.length) setMain1("Astra");

      // 固定ラベルフォントをロード（以後は常に使える）
      await ensureFontLoaded(FIXED_LABEL_FONT_FAMILY, FIXED_LABEL_FONT_URL);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 表示用エージェント
  const agentDisplay = useMemo(() => {
    const a1 = main1?.trim()?.toUpperCase();
    const a2 = main2?.trim()?.toUpperCase();

    if (a1 && a2) {
      return [
        { text: a1 },
        { text: " / ", color: "#e6383f" }, // ← スラッシュだけ赤に
        { text: a2 },
      ];
    }

    if (a1) return [{ text: a1 }];
    return [{ text: "astra" }];
  }, [main1, main2]);

  // プレビューのスケール（横・縦の min fit）
  useEffect(() => {
    const calc = () => {
      const parentW = previewContainerRef.current?.clientWidth || BASE_W;
      const availableH = Math.max(320, (typeof window !== "undefined" ? window.innerHeight - 24 - 24 : BASE_H));
      setScale(Math.min(parentW / BASE_W, availableH / BASE_H, 1));
    };
    calc();
    window.addEventListener("resize", calc);
    const id = setInterval(calc, 300);
    return () => { window.removeEventListener("resize", calc); clearInterval(id); };
  }, []);

  // ====== 描画（フォント変更時は再ロード→再描画） ======
  useEffect(() => {
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas || !selectedCard) return;

      // 1) ラベル固定フォントを保証
      await ensureFontLoaded(FIXED_LABEL_FONT_FAMILY, FIXED_LABEL_FONT_URL);

      // 2) 値側フォントを選択ファイルからロード
      if (valueFontFile) {
        const url = valueFontFile.startsWith("/") ? valueFontFile : `/fonts/${valueFontFile}`;
        await ensureFontLoaded(valueFontFamily, url);
      }

      // 3) 描画開始
      canvas.width = BASE_W;
      canvas.height = BASE_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 背景
      const bg = await loadImage(selectedCard);
      ctx.drawImage(bg, 0, 0, BASE_W, BASE_H);

      const draw = (
        textOrParts: string | { text: string; color?: string }[],
        x: number, y: number,
        opts: { size: number; color: string; font: string; align?: CanvasTextAlign }
      ) => {
        ctx.font = `${opts.size}px "${opts.font}"`;
        ctx.textAlign = opts.align || "left";
        ctx.textBaseline = "middle";

        // ---- ここから追加：配列でも文字列でも対応 ----
        if (typeof textOrParts === "string") {
          // 普通の一色テキスト
          ctx.fillStyle = opts.color;
          ctx.fillText(textOrParts, x, y);
          return;
        }

        // 部分色付きテキスト（配列）
        let cursorX = x;
        for (const part of textOrParts) {
          ctx.fillStyle = part.color ?? opts.color;
          ctx.fillText(part.text, cursorX, y);
          cursorX += ctx.measureText(part.text).width;
        }
        // ---- ここまで ----
      };


      // NAME（値＝選択フォント）
      if (name) {
        draw(clampText(name, LIMIT.nameLine), LAYOUT.name.x, LAYOUT.name.y, {
          size: STYLE.nameValue.size, color: STYLE.nameValue.color, font: valueFontFamily
        });
      }

      // TYPE：性別丸
      if (gender === "male") {
        drawCircle(ctx, LAYOUT.typeMaleCircle.x, LAYOUT.typeMaleCircle.y, LAYOUT.typeMaleCircle.r, "#e6383f", 3);
      } else if (gender === "female") {
        drawCircle(ctx, LAYOUT.typeFemaleCircle.x, LAYOUT.typeFemaleCircle.y, LAYOUT.typeFemaleCircle.r, "#e6383f", 3);
      }

      // TYPE 右：追加メトリクス（ラベル=固定 / 値=選択）
      if (typeExtraKey) {
        draw(`${typeExtraKey}`, LAYOUT.typeExtraLabel.x, LAYOUT.typeExtraLabel.y, {
          size: STYLE.typeExtraLabel.size, color: STYLE.typeExtraLabel.color, font: FIXED_LABEL_FONT_FAMILY
        });
        if (["ACS", "K/D", "WINS", "AGE"].includes(typeExtraKey)) {
          draw(clampText(typeExtraVal, LIMIT.typeExtraValue), LAYOUT.typeExtraValue.x, LAYOUT.typeExtraValue.y, {
            size: STYLE.typeExtraValue.size, color: STYLE.typeExtraValue.color, font: valueFontFamily
          });
        }
      }

      // RANK（テキスト=ラベル扱い→固定フォント）
      draw(rank.toUpperCase(), LAYOUT.rankText.x, LAYOUT.rankText.y, {
        size: STYLE.rankText.size, color: STYLE.rankText.color, font: valueFontFamily
      });

      // ランクバッジ
      try {
        const badge = await loadImage(`${rankBadgeBase}/${rank}.png`);
        ctx.drawImage(badge, LAYOUT.rankBadge.x, LAYOUT.rankBadge.y, LAYOUT.rankBadge.size, LAYOUT.rankBadge.size);
      } catch {/* 画像なしは無視 */ }

      // MAIN AGENT（値＝選択フォント）
      draw(agentDisplay, LAYOUT.mainAgent.x, LAYOUT.mainAgent.y, {
        size: STYLE.agentValue.size, color: STYLE.agentValue.color, font: valueFontFamily
      });

      // PLAY STYLE（値＝選択フォント）
      draw(`平日 ${weekdayFrom} - ${weekdayTo}　休日 ${holidayFrom} - ${holidayTo}`, LAYOUT.playWeekday.x, LAYOUT.playWeekday.y, {
        size: STYLE.playWeekday.size, color: STYLE.playWeekday.color, font: valueFontFamily
      });

      // 自由表記（値＝選択フォント、wrap）
      if (freeText) {
        ctx.font = `${STYLE.free.size}px "${valueFontFamily}"`;
        ctx.fillStyle = STYLE.free.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        drawWrappedText(
          ctx,
          freeText,
          LAYOUT.freeStart.x,
          LAYOUT.freeStart.y,
          LAYOUT.freeMaxWidth,
          LAYOUT.freeLineHeight,
          LAYOUT.freeMaxLines
        );
      }

      // フッター 2 行（ラベル=固定 / 値=選択）
      const drawFooter = (line: FooterLine, lyLabel: { x: number, y: number }, lyValue: { x: number, y: number }) => {
        if (!line.key) return;
        const item = FOOTER_SELECT_ITEMS.find(i => i.key === line.key);
        if (!item) return;
        draw(item.label, lyLabel.x, lyLabel.y, {
          size: STYLE.footerLabel.size, color: STYLE.footerLabel.color, font: valueFontFamily
        });
        if (item.needsAnswer) {
          draw(clampText(line.value, LIMIT.footerAnswer), lyValue.x, lyValue.y, {
            size: STYLE.footerValue.size, color: STYLE.footerValue.color, font: valueFontFamily
          });
        }
      };
      drawFooter(footer1, LAYOUT.footer1Label, LAYOUT.footer1Value);
      drawFooter(footer2, LAYOUT.footer2Label, LAYOUT.footer2Value);
    })();
  }, [
    // フォント変更時に必ず再描画（※ valueFontFile / family）
    valueFontFile, valueFontFamily,

    // 画像・入力値変更時も再描画
    selectedCard, name, gender, typeExtraKey, typeExtraVal,
    rank, main1, main2, weekdayFrom, weekdayTo, holidayFrom, holidayTo,
    freeText, footer1, footer2, rankBadgeBase
  ]);

  // ダウンロード / 共有
  const onDownload = () => {
    const c = canvasRef.current; if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "valorant-profile.png";
    a.click();
  };

  const onShare = async () => {
    const c = canvasRef.current; if (!c) return;
    const blob: Blob = await new Promise(res => c.toBlob(b => res(b as Blob), "image/png"));
    const file = new File([blob], "valorant-profile.png", { type: "image/png" });
    const shareText = `${name ? name + " " : ""}#VALORANT`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: shareText }); return; } catch { }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "valorant-profile.png";
    a.click();
    const intent = new URL("https://x.com/intent/tweet");
    intent.searchParams.set("text", shareText);
    window.open(intent.toString(), "_blank");
  };

  // レイアウトスケール
  useEffect(() => {
    const calc = () => {
      const parentW = previewContainerRef.current?.clientWidth || BASE_W;
      const availableH = Math.max(320, (typeof window !== "undefined" ? window.innerHeight - 24 - 24 : BASE_H));
      setScale(Math.min(parentW / BASE_W, availableH / BASE_H, 1));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // ----------------------------- UI -----------------------------
  return (
    <div className="mx-auto max-w-[1800px] px-4 md:px-6 py-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左：入力（PC） / 下：入力（SP） */}
        <div className="space-y-6">
          {/* 1) 背景選択 */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">カード背景を選択</h2>
            <select
              className="w-full bg-neutral-800 rounded-md p-2"
              value={selectedCard}
              onChange={(e) => setSelectedCard(e.target.value)}
            >
              {cardImages.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <p className="text-sm text-neutral-400 mt-2">/api/list-cards に設定したフォルダへ追加で即反映（ビルド不要）</p>
          </section>

          {/* 2) 回答フォント（ユーザー選択） */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">回答フォント（ユーザー入力値に適用）</h2>
            <select
              className="w-full bg-neutral-800 rounded-md p-2"
              value={valueFontFile}
              onChange={(e) => setValueFontFile(e.target.value)}
            >
              {[valueFontFile, ...fontFiles.filter(f => f !== valueFontFile)].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <p className="text-xs text-neutral-500 mt-2">
              ※ ラベル系は固定フォント：<code>{FIXED_LABEL_FONT_URL}</code>（family: <code>{FIXED_LABEL_FONT_FAMILY}</code>）
            </p>
          </section>

          {/* 3) 名前 */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">名前（NAME の下段に表示）</h2>
            <input
              className="w-full bg-neutral-800 rounded-md p-2"
              placeholder="例：nekke2_nakano"
              value={name}
              maxLength={LIMIT.nameLine}
              onChange={(e) => setName(e.target.value)}
            />
          </section>

          {/* 4) TYPE（性別 & 追加メトリクス） */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">TYPE</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1"><input type="radio" name="gender" onChange={() => setGender("male")} checked={gender === "male"} /> ♂</label>
              <label className="flex items-center gap-1"><input type="radio" name="gender" onChange={() => setGender("female")} checked={gender === "female"} /> ♀</label>
              <label className="flex items-center gap-1"><input type="radio" name="gender" onChange={() => setGender(null)} checked={gender === null} /> 未選択</label>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <select
                className="bg-neutral-800 rounded-md p-2 col-span-1"
                value={typeExtraKey || ""}
                onChange={(e) => setTypeExtraKey((e.target.value || "") as ExtraMetricKey || null)}
              >
                {EXTRA_METRIC_OPTIONS.map((v) => (
                  <option key={v || "none"} value={v}>{v || "（入力しない）"}</option>
                ))}
              </select>
              <input
                className="bg-neutral-800 rounded-md p-2 col-span-2"
                placeholder="値（ACS, K/D, WINS, AGE）"
                value={typeExtraVal}
                maxLength={LIMIT.typeExtraValue}
                onChange={(e) => setTypeExtraVal(e.target.value)}
                disabled={!typeExtraKey}
              />
            </div>
          </section>

          {/* 5) Rank */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">RANK</h2>
            <div className="grid grid-cols-2 gap-2 items-center">
              <select
                className="bg-neutral-800 rounded-md p-2"
                value={rank}
                onChange={(e) => setRank(e.target.value as RankKey)}
              >
                {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="text-sm text-neutral-400">バッジ画像：<code>{rankBadgeBase}/{rank}.png</code></div>
            </div>
          </section>

          {/* 6) Main Agent */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">MAIN AGENT</h2>
            <div className="grid grid-cols-2 gap-2">
              <select className="bg-neutral-800 rounded-md p-2" value={main1} onChange={(e) => setMain1(e.target.value)}>
                {agents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="bg-neutral-800 rounded-md p-2" value={main2} onChange={(e) => setMain2(e.target.value)}>
                <option value="">（任意）</option>
                {agents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <p className="text-sm text-neutral-400 mt-2">※ /data/agents.json を編集すると即反映（再ビルド不要）</p>
          </section>

          {/* 7) Play Style */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">PLAY STYLE（2行：平日/休日）</h2>
            <div className="grid grid-cols-2 gap-2 items-center">
              <div>
                <div className="text-sm mb-1">平日</div>
                <div className="flex gap-2">
                  <HourSelect value={weekdayFrom} onChange={setWeekdayFrom} />
                  <span className="self-center">～</span>
                  <HourSelect value={weekdayTo} onChange={setWeekdayTo} />
                </div>
              </div>
              <div>
                <div className="text-sm mb-1">休日</div>
                <div className="flex gap-2">
                  <HourSelect value={holidayFrom} onChange={setHolidayFrom} />
                  <span className="self-center">～</span>
                  <HourSelect value={holidayTo} onChange={setHolidayTo} />
                </div>
              </div>
            </div>
          </section>

          {/* 8) 自由表記（1入力→Canvasで自動折返し） */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">自由表記（1入力／自動折返し）</h2>
            <input
              className="w-full bg-neutral-800 rounded-md p-2"
              placeholder="自己紹介や一言など"
              value={freeText}
              maxLength={LIMIT.freeAll}
              onChange={(e) => setFreeText(e.target.value)}
            />
            <p className="text-xs text-neutral-500 mt-2">※ キャンバスでは最大{LAYOUT.freeMaxLines}行まで自然改行して描画</p>
          </section>

          {/* 9) フッター2行（NULL可） */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">三角マーク右側（2行 / NULL可）</h2>
            <FooterLineEditor value={footer1} onChange={setFooter1} />
            <div className="h-3" />
            <FooterLineEditor value={footer2} onChange={setFooter2} />
          </section>

          {/* 10) アクション */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 flex gap-3">
            <button className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500" onClick={onDownload}>PNGをダウンロード</button>
            <button className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500" onClick={onShare}>共有（Xなど）</button>
          </section>
        </div>

        {/* 右：プレビュー（SPでは上・sticky追尾） */}
        <div className="md:sticky md:top-6" ref={previewContainerRef}>
          <div className="w-full border border-neutral-800 rounded-2xl overflow-hidden bg-black/60">
            <div className="p-2 text-sm text-neutral-400">プレビュー</div>
            <div className="p-2 flex justify-center">
              <div style={{ width: Math.round(BASE_W * scale), maxWidth: "100%" }}>
                <canvas ref={canvasRef} className="w-full h-auto block" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------- 補助コンポーネント -----------------------------

function HourSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="bg-neutral-800 rounded-md p-2" value={value} onChange={(e) => onChange(parseInt(e.target.value))}>
      {HOUR_CHOICES.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

function FooterLineEditor({ value, onChange }: { value: { key: string | null; value: string }; onChange: (v: { key: string | null; value: string }) => void }) {
  const current = FOOTER_SELECT_ITEMS.find(i => i.key === value.key);
  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      <select
        className="bg-neutral-800 rounded-md p-2 col-span-1"
        value={value.key ?? ""}
        onChange={(e) => onChange({ ...value, key: e.target.value || null })}
      >
        <option value="">（選択なし/NULL）</option>
        {FOOTER_SELECT_ITEMS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
      </select>
      <input
        className="bg-neutral-800 rounded-md p-2 col-span-2"
        placeholder={current?.needsAnswer ? "自由入力" : "（解答欄不要）"}
        disabled={!current?.needsAnswer}
        maxLength={LIMIT.footerAnswer}
        value={value.value}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
      />
    </div>
  );
}
