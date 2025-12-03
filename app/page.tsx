"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================
 * 型と定数
 * =======================================================*/
type Gender = "male" | "female" | null;
type ExtraMetricKey = "ACS" | "K/D" | "WINS" | "AGE";

const EXTRA_METRIC_OPTIONS: (ExtraMetricKey | "")[] = ["", "ACS", "K/D", "WINS", "AGE"];

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

// フォント表示名/ファミリー名マップ
const FONT_META: Record<string, { family: string; label?: string }> = {
  "1_PublicSans-VariableFont.woff2": { family: "PublicSans", label: "Public Sans (既定)" },
  "2_mushin.woff2": { family: "Mushin", label: "無心" },
  "3_PopRumCute.woff2": { family: "PopRumCute", label: "ポプらむ☆キュート" },
  "4_ShinRetroMaruGothic-Bold.woff2": { family: "ShinRetroMaruGothic", label: "新！レトロ丸ゴシック" },
  "5_zeninshugo-pop.woff2": { family: "ZeninShugoPop", label: "全員集合！ポップ体" },
};
// label未設定時のフォールバック
const getFontLabel = (file: string) => FONT_META[file]?.label ?? file;
const getFontFamily = (file: string) => FONT_META[file]?.family ?? familyFromFilename(file);

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
const FIXED_LABEL_FONT_URL = "/fonts/1_PublicSans-VariableFont.woff2"; // /opt/.../public 配下は公開URLでこうなる

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
  freeMaxWidth: 410,
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

/* =========================================================
 * ユーティリティ
 * =======================================================*/
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
    const ff = new FontFace(family, `url("${url}")`, {
      style: "normal",
      weight: "100 900",
      stretch: "normal",
    });
    const loaded = await ff.load();
    (document as any).fonts.add(loaded);
    await (document as any).fonts.load(`16px "${family}"`, "漢"); // CJKもロード
    await (document as any).fonts.ready;
  })();
  fontCache.set(key, p);
  await p;
}

/* =========================================================
 * フォント正規化（高さ＋横幅）
 *  - 高さ: 基準フォント(1_PublicSans)に合わせる
 *  - 横幅: 同じテキストを基準フォント幅に収まるようにだけ縮小（拡大しない）
 * =======================================================*/
const fontHeightScaleCache = new Map<string, number>();

function measureHeight(ctx: CanvasRenderingContext2D, fontStack: string, px: number, sample = "H漢Aあ") {
  ctx.font = `400 ${px}px ${fontStack}`;
  const m = ctx.measureText(sample);
  const h = (m.actualBoundingBoxAscent ?? 0) + (m.actualBoundingBoxDescent ?? 0);
  return h || m.width * 0.7;
}

async function getFontHeightScale(targetFontStack: string, baseFamily = FIXED_LABEL_FONT_FAMILY) {
  const key = `${targetFontStack}=>${baseFamily}`;
  if (fontHeightScaleCache.has(key)) return fontHeightScaleCache.get(key)!;

  const testPx = 100;
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d")!;
  const hBase = measureHeight(ctx, `"${baseFamily}"`, testPx);
  const hTarget = measureHeight(ctx, targetFontStack, testPx);
  const scale = hBase && hTarget ? hBase / hTarget : 1;
  fontHeightScaleCache.set(key, scale);
  return scale;
}

function measureWidth(ctx: CanvasRenderingContext2D, fontStack: string, px: number, text: string) {
  ctx.font = `400 ${px}px ${fontStack}`;
  return ctx.measureText(text).width;
}

/** 高さ合わせ後、横幅が基準より広いときだけ縮小する最終pxを返す */
function finalScaledPxByText(
  ctx: CanvasRenderingContext2D,
  baseFamily: string,
  targetStack: string,
  designPx: number,
  heightScale: number,
  text: string
) {
  // まず高さ合わせだけを適用
  const pxAfterHeight = Math.max(1, Math.round(designPx * heightScale));

  // 同じテキストで、基準フォント＝デザインpx、対象フォント＝高さ補正後px で幅を比較
  const baseW = measureWidth(ctx, `"${baseFamily}"`, designPx, text);
  const targetW = measureWidth(ctx, targetStack, pxAfterHeight, text);

  if (targetW <= 0 || baseW <= 0) return pxAfterHeight;

  // 対象のほうが広いなら、基準に収まるよう縮小率を掛ける（拡大はしない）
  const widthLimitScale = targetW > baseW ? (baseW / targetW) : 1;
  const finalPx = Math.max(1, Math.floor(pxAfterHeight * widthLimitScale));
  return finalPx;
}

/* =========================================================
 * メイン
 * =======================================================*/
export default function Page() {
  // 動的データ
  const [cardImages, setCardImages] = useState<string[]>([]);
  const [rankBadgeBase, setRankBadgeBase] = useState<string>("/ranks");
  const [fontFiles, setFontFiles] = useState<string[]>([]); // 例: ["NotoSansJP-Regular.woff2", ...]
  const [agents, setAgents] = useState<string[]>([]);

  // 値側フォント（ユーザー選択）：ファイル名と family 名
  const [valueFontFile, setValueFontFile] = useState<string>("");
  const valueFontFamily = useMemo(
    () => (valueFontFile ? getFontFamily(valueFontFile) : "system-ui"),
    [valueFontFile]
  );
  // 値側はスタック（英字専用フォント選択時のCJKフォールバック安定化）
  const valueFontStack = useMemo(
    () =>
      `"${valueFontFamily}", "Noto Sans JP", "Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif`,
    [valueFontFamily]
  );

  // 入力フォーム
  const [selectedCard, setSelectedCard] = useState<string>("");
  const [name, setName] = useState<string>("ねっけつ太郎"); // NAME 下段
  const [gender, setGender] = useState<Gender>(null);
  const [typeExtraKey, setTypeExtraKey] = useState<ExtraMetricKey | null>(null);
  const [typeExtraVal, setTypeExtraVal] = useState<string>("");
  const [rank, setRank] = useState<RankKey>("ascendant3");
  const [main1, setMain1] = useState<string>("Astra"); // 必須相当（空選択不可想定）
  const [main2, setMain2] = useState<string>("");      // 任意
  const [weekdayFrom, setWeekdayFrom] = useState<number>(20);
  const [weekdayTo, setWeekdayTo] = useState<number>(24);
  const [holidayFrom, setHolidayFrom] = useState<number>(18);
  const [holidayTo, setHolidayTo] = useState<number>(26);
  const [freeText, setFreeText] = useState<string>("「勝ちに行く、それだけだ」"); // 自由表記：1入力→折返し

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
      // 値側フォントの初期選択：先頭
      setValueFontFile(files[0]);

      setRankBadgeBase(ranksRes.base || "/ranks");
      setAgents(agentsRes.agents || ["Astra", "Jett"]);
      if (!agentsRes.agents?.length) setMain1("Astra");

      // 基準（ラベル）フォントをロード
      await ensureFontLoaded(FIXED_LABEL_FONT_FAMILY, FIXED_LABEL_FONT_URL);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 表示用エージェント（スラッシュだけ赤）
  const agentDisplay = useMemo(() => {
    const a1 = main1?.trim()?.toUpperCase();
    const a2 = main2?.trim()?.toUpperCase();

    if (a1 && a2) {
      return [
        { text: a1 },
        { text: " / ", color: "#e6383f" },
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

      // 1) ラベル（基準）フォントを保証
      await ensureFontLoaded(FIXED_LABEL_FONT_FAMILY, FIXED_LABEL_FONT_URL);

      // 2) 値側フォントを選択ファイルからロード
      if (valueFontFile) {
        const url = valueFontFile.startsWith("/") ? valueFontFile : `/fonts/${valueFontFile}`;
        await ensureFontLoaded(valueFontFamily, url);
      }

      // 3) 値側フォントの高さスケール（基準に合わせる）
      const heightScale = await getFontHeightScale(valueFontStack);

      // 4) 描画開始
      canvas.width = BASE_W;
      canvas.height = BASE_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 背景
      const bg = await loadImage(selectedCard);
      ctx.drawImage(bg, 0, 0, BASE_W, BASE_H);

      // 統一描画ヘルパ（単色 or 部分色）
      const draw = (
        textOrParts: string | { text: string; color?: string }[],
        x: number, y: number,
        opts: { size: number; color: string; font: string; align?: CanvasTextAlign; weight?: number | string; widthFit?: boolean }
      ) => {
        const weight = opts.weight ?? 400;
        ctx.textAlign = opts.align || "left";
        ctx.textBaseline = "middle";

        // 幅フィットの判定用に全文字列化
        const fullText = typeof textOrParts === "string"
          ? textOrParts
          : textOrParts.map(p => p.text).join("");

        const finalPx = opts.widthFit
          ? finalScaledPxByText(ctx, FIXED_LABEL_FONT_FAMILY, opts.font, opts.size, heightScale, fullText)
          : Math.max(1, Math.round(opts.size * heightScale));

        // 実描画
        ctx.font = `${weight} ${finalPx}px ${opts.font}`;
        if (typeof textOrParts === "string") {
          ctx.fillStyle = opts.color;
          ctx.fillText(textOrParts, x, y);
        } else {
          let cursorX = x;
          for (const part of textOrParts) {
            ctx.fillStyle = part.color ?? opts.color;
            ctx.fillText(part.text, cursorX, y);
            cursorX += ctx.measureText(part.text).width;
          }
        }
      };

      // NAME（値＝選択フォント） → 幅フィット有効
      if (name) {
        draw(clampText(name, LIMIT.nameLine), LAYOUT.name.x, LAYOUT.name.y, {
          size: STYLE.nameValue.size, color: STYLE.nameValue.color, font: valueFontStack, widthFit: true
        });
      }

      // TYPE：性別丸
      if (gender === "male") {
        drawCircle(ctx, LAYOUT.typeMaleCircle.x, LAYOUT.typeMaleCircle.y, LAYOUT.typeMaleCircle.r, "#e6383f", 3);
      } else if (gender === "female") {
        drawCircle(ctx, LAYOUT.typeFemaleCircle.x, LAYOUT.typeFemaleCircle.y, LAYOUT.typeFemaleCircle.r, "#e6383f", 3);
      }

      // TYPE右：追加メトリクス（ラベル=固定 / 値=選択）
      if (typeExtraKey) {
        // ラベル（固定フォント）
        ctx.font = `400 ${STYLE.typeExtraLabel.size}px "${FIXED_LABEL_FONT_FAMILY}"`;
        ctx.fillStyle = STYLE.typeExtraLabel.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${typeExtraKey}`, LAYOUT.typeExtraLabel.x, LAYOUT.typeExtraLabel.y);

        if (["ACS", "K/D", "WINS", "AGE"].includes(typeExtraKey)) {
          draw(clampText(typeExtraVal, LIMIT.typeExtraValue), LAYOUT.typeExtraValue.x, LAYOUT.typeExtraValue.y, {
            size: STYLE.typeExtraValue.size, color: STYLE.typeExtraValue.color, font: valueFontStack, widthFit: true
          });
        }
      }

      // RANK（値側フォントで表示、幅フィット有効）
      draw(rank.toUpperCase(), LAYOUT.rankText.x, LAYOUT.rankText.y, {
        size: STYLE.rankText.size, color: STYLE.rankText.color, font: valueFontStack, widthFit: true
      });

      // ランクバッジ
      try {
        const badge = await loadImage(`${rankBadgeBase}/${rank}.png`);
        ctx.drawImage(badge, LAYOUT.rankBadge.x, LAYOUT.rankBadge.y, LAYOUT.rankBadge.size, LAYOUT.rankBadge.size);
      } catch { /* 画像なしは無視 */ }

      // MAIN AGENT（値＝選択フォント、スラッシュ赤）→ 幅フィット有効（全体の幅で判定）
      draw(agentDisplay, LAYOUT.mainAgent.x, LAYOUT.mainAgent.y, {
        size: STYLE.agentValue.size, color: STYLE.agentValue.color, font: valueFontStack, widthFit: true
      });

      // PLAY STYLE（値＝選択フォント）→ 幅フィット有効
      const playStr = `平日 ${weekdayFrom} - ${weekdayTo}　休日 ${holidayFrom} - ${holidayTo}`;
      draw(playStr, LAYOUT.playWeekday.x, LAYOUT.playWeekday.y, {
        size: STYLE.playWeekday.size, color: STYLE.playWeekday.color, font: valueFontStack, widthFit: true
      });

      // 自由表記（wrap）→ 横幅は折返しで制御するので高さだけ補正
      if (freeText) {
        const px = Math.max(1, Math.round(STYLE.free.size * heightScale));
        ctx.font = `400 ${px}px ${valueFontStack}`;
        ctx.fillStyle = STYLE.free.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        drawWrappedText(
          ctx,
          freeText,
          LAYOUT.freeStart.x,
          LAYOUT.freeStart.y,
          LAYOUT.freeMaxWidth,
          LAYOUT.freeLineHeight, // 行間はデザイン値のまま（必要なら heightScale を掛ける）
          LAYOUT.freeMaxLines
        );
      }

      // フッター 2 行
      const drawFooter = (line: FooterLine, lyLabel: { x: number, y: number }, lyValue: { x: number, y: number }) => {
        if (!line.key) return;
        const item = FOOTER_SELECT_ITEMS.find(i => i.key === line.key);
        if (!item) return;

        // ラベル（固定フォント）
        const labelText = item.label;
        const px = finalScaledPxByText(
          ctx,
          FIXED_LABEL_FONT_FAMILY,   // 基準フォント
          valueFontStack,            // 対象フォント
          STYLE.footerLabel.size,    // デザイン上のサイズ(px)
          heightScale,               // 高さ補正スケール
          labelText                  // 判定テキスト
        );
        ctx.font = `400 ${px}px ${valueFontStack}`;
        ctx.fillStyle = STYLE.footerLabel.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, lyLabel.x, lyLabel.y);

        // 値（選択フォント）→ 幅フィット有効
        if (item.needsAnswer) {
          draw(clampText(line.value, LIMIT.footerAnswer), lyValue.x, lyValue.y, {
            size: STYLE.footerValue.size, color: STYLE.footerValue.color, font: valueFontStack, widthFit: true
          });
        }
      };
      drawFooter(footer1, LAYOUT.footer1Label, LAYOUT.footer1Value);
      drawFooter(footer2, LAYOUT.footer2Label, LAYOUT.footer2Value);
    })();
  }, [
    valueFontFile, valueFontFamily, valueFontStack,
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
    const shareText = `\n#VALORANT自己紹介カード\n#VALORANT-RE-CARD\n#VALORANT募集`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: shareText }); return; } catch { /* fallthrough */ }
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

  /* =========================================================
   * UI
   * =======================================================*/
  return (
    <div className="mx-auto max-w-[1800px] px-4 md:px-6 py-6">
      {/* ★ SP=flex-col-reverse / MD+=grid */}
      <div className="flex flex-col-reverse md:grid md:grid-cols-2 gap-6">
        {/* 左：入力（SPでは下、MD+で左） */}
        <div className="space-y-6">
          {/* 1) 背景選択 */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">カード背景を選択</h2>
            <select
              className="w-full bg-neutral-800 rounded-md p-2"
              value={selectedCard}
              onChange={(e) => setSelectedCard(e.target.value)}
            >
              {cardImages.map((p) => {
                const filename = p.split("/").pop() || p;        // 末尾のファイル名を抽出
                const display = filename.replace(/\.[^.]+$/, ""); // 拡張子削除
                return <option key={p} value={p}>{display}</option>;
              })}
            </select>
          </section>

          {/* 2) 回答フォント（ユーザー選択） */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">フォントを選択</h2>
            <select
              className="w-full bg-neutral-800 rounded-md p-2"
              value={valueFontFile}
              onChange={(e) => setValueFontFile(e.target.value)}
            >
              {[valueFontFile, ...fontFiles.filter(f => f !== valueFontFile)].map(f => (
                <option key={f} value={f}>{getFontLabel(f)}</option>
              ))}
            </select>
          </section>

          {/* 3) 名前 */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">名前</h2>
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
            <h2 className="text-lg font-semibold mb-3">性別</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1"><input type="radio" name="gender" onChange={() => setGender("male")} checked={gender === "male"} /> ♂</label>
              <label className="flex items-center gap-1"><input type="radio" name="gender" onChange={() => setGender("female")} checked={gender === "female"} /> ♀</label>
              <label className="flex items-center gap-1"><input type="radio" name="gender" onChange={() => setGender(null)} checked={gender === null} /> 未選択</label>
            </div>

            <h2 className="text-lg font-semibold mb-3 mt-4">アピール（選択式）</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <select
                className="bg-neutral-800 rounded-md p-2 col-span-1"
                value={typeExtraKey || ""}
                onChange={(e) => setTypeExtraKey((e.target.value || "") as ExtraMetricKey || null)}
              >
                {EXTRA_METRIC_OPTIONS.map((v) => (
                  <option key={v || "none"} value={v}>{v || "入力しない"}</option>
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
            <p className="text-sm text-neutral-400 mt-2">※ ACEは平均バトルスコア、K/Dはキルデス比、WINSは勝率、AGEは年齢（20↑ など）を記載</p>
          </section>

          {/* 5) Rank */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">ランク</h2>
            <div className="grid grid-cols-2 gap-2 items-center">
              <select
                className="bg-neutral-800 rounded-md p-2"
                value={rank}
                onChange={(e) => setRank(e.target.value as RankKey)}
              >
                {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </section>

          {/* 6) Main Agent */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">メインエージェント</h2>
            <div className="grid grid-cols-2 gap-2">
              <select className="bg-neutral-800 rounded-md p-2" value={main1} onChange={(e) => setMain1(e.target.value)}>
                {agents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="bg-neutral-800 rounded-md p-2" value={main2} onChange={(e) => setMain2(e.target.value)}>
                <option value="">（任意）</option>
                {agents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <p className="text-sm text-neutral-400 mt-2">※ 一人目は必須入力、二人まで得意エージェントを選択できます</p>
          </section>

          {/* 7) Play Style */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">活動時間</h2>
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
            <h2 className="text-lg font-semibold mb-3">自由表記</h2>
            <input
              className="w-full bg-neutral-800 rounded-md p-2"
              placeholder="自己紹介や一言など"
              value={freeText}
              maxLength={LIMIT.freeAll}
              onChange={(e) => setFreeText(e.target.value)}
            />
            <p className="text-sm text-neutral-400 mt-2">※ ２行まで</p>
          </section>

          {/* 9) フッター2行（NULL可） */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40">
            <h2 className="text-lg font-semibold mb-3">フッター（選択自由）</h2>
            <FooterLineEditor value={footer1} onChange={setFooter1} />
            <div className="h-3" />
            <FooterLineEditor value={footer2} onChange={setFooter2} />
          </section>

          {/* 10) アクション */}
          <section className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 flex gap-3">
            <button className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500" onClick={onDownload}>画像をダウンロード</button>
            <button className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500" onClick={onShare}>共有（Xなど）</button>
          </section>
        </div>

        {/* 右：プレビュー（SPでは上・sticky追尾） */}
        <div className="sticky top-6" ref={previewContainerRef}>
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

      <section className="mt-16 mb-16 mx-auto space-y-10 text-sm md:text-base text-neutral-200">
        {/* 概要 */}
        <article className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-6 py-7 shadow-sm shadow-black/40">
          <header className="mb-4">
            <p className="inline-flex items-center gap-2 rounded-full bg-rose-900/40 text-[11px] font-medium px-3 py-1 tracking-wide text-rose-200">
              VALORANT FAN MADE TOOL
            </p>
            <h2 className="mt-3 text-2xl md:text-3xl font-bold">
              VALORANT 自己紹介カードメーカー「Re:Card」とは？
            </h2>
          </header>
          <p className="leading-relaxed text-neutral-300">
            Re:Card（リカード）は、タクティカルFPS「VALORANT（ヴァロラント）」向けの
            自己紹介カード画像をブラウザ上で簡単に作成できる非公式ファンツールです。
            ランクやメインエージェント、活動時間、NG行動、募集スタイルなどを入力するだけで、
            フレンド募集やクラン募集、固定メンバー探しに使える一枚を自動生成します。
          </p>
          <p className="mt-3 leading-relaxed text-neutral-300">
            作成したカードは PNG 形式でダウンロードでき、そのまま
            X（旧Twitter）の固定ツイートや募集ツイート、Discord サーバーの自己紹介チャンネル、
            募集掲示板などで自由にお使いいただけます。
          </p>
        </article>

        {/* 特徴 */}
        <article className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-6 py-7 shadow-sm shadow-black/40">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-1.5 rounded-full bg-gradient-to-b from-rose-500 to-orange-400" />
            <h3 className="text-xl md:text-2xl font-semibold">
              Re:Card でできること・主な特徴
            </h3>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-neutral-300">
            <li>ブラウザだけで完結する VALORANT 自己紹介カードの自動生成</li>
            <li>ランクバッジ・メインエージェント・活動時間・NG行動などを細かく設定可能</li>
            <li>カード背景とフォントを切り替えて、自分の雰囲気に合わせたデザインを選べる</li>
            <li>フッター欄に「Platform / Server / NG行動」などの情報を載せて、ミスマッチを減らせる</li>
            <li>一度作っておけば、フレンド募集や大会募集のたびに使い回せる</li>
          </ul>
        </article>

        {/* 使い方 */}
        <article className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-6 py-7 shadow-sm shadow-black/40">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-1.5 rounded-full bg-gradient-to-b from-sky-500 to-cyan-400" />
            <h3 className="text-xl md:text-2xl font-semibold">
              具体的な使い方（かんたん 3 ステップ）
            </h3>
          </div>
          <ol className="list-decimal pl-5 space-y-3 text-neutral-300">
            <li>
              画面左側のフォームで、
              <strong>名前・ランク・メインエージェント・活動時間</strong>などを入力します。
              フッター欄に「NG行動」や「いつでも誘われ待ち」などを設定することもできます。
            </li>
            <li>
              プレビューを確認しながら、背景デザインやフォントを変更して、
              自分のプレイスタイルやイメージに合うカードになるよう調整します。
            </li>
            <li>
              「画像をダウンロード」ボタンで PNG ファイルを書き出し、
              X の募集ツイートや固定ツイート、Discord 等に画像を貼り付けて使用します。
            </li>
          </ol>
        </article>

        {/* 利用シーン */}
        <article className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-6 py-7 shadow-sm shadow-black/40">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-1.5 rounded-full bg-gradient-to-b from-emerald-500 to-lime-400" />
            <h3 className="text-xl md:text-2xl font-semibold">
              おすすめの使い方・想定シーン
            </h3>
          </div>
          <p className="leading-relaxed text-neutral-300">
            Re:Card は、ランク別のフルパ募集やカスタム大会、固定メンバー募集、
            ランク上げ固定の募集など、「自分がどんなプレイヤーなのかを一目で伝えたい」
            場面に向いています。事前に活動時間やNG行動・得意エージェントを書いておくことで、
            マッチング後のすれ違いやトラブルを減らし、相性の良いプレイヤーと出会いやすくなります。
          </p>
          <p className="mt-3 leading-relaxed text-neutral-300">
            X で募集する場合は、
            <span className="font-mono"> #VALORANT自己紹介カード </span>
            <span className="font-mono"> #VALORANT募集 </span>
            などのハッシュタグと一緒に投稿すると、
            同じくフレンドや固定メンバーを探しているプレイヤーに見つけてもらいやすくなります。
          </p>
        </article>

        {/* 注意事項 */}
        <article className="rounded-xl bg-neutral-950 border border-neutral-800 px-6 py-7">
          <h3 className="text-lg md:text-xl font-semibold mb-3">
            注意事項・免責について
          </h3>
          <p className="leading-relaxed text-neutral-400">
            Re:Card は Riot Games および VALORANT の非公式ファンメイドツールです。
            本ツールの利用により発生したいかなるトラブルや損害についても、
            開発者は一切の責任を負いません。各種プラットフォームの利用規約や
            Riot Games のガイドラインを確認した上で、マナーを守ってご利用ください。
          </p>
        </article>
      </section>

      <div className="text-sm opacity-70 leading-relaxed">
        <a
          href="https://nakano6.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline hover:text-blue-300"
        >プライバシーポリシー</a>
        <p>re-card v1.0.3</p>
      </div>
    </div>
  );
}

/* =========================================================
 * 補助コンポーネント
 * =======================================================*/
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
        <option value="">選択なし</option>
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
