export const runtime = "nodejs";
import fs from "fs";
import path from "path";

export async function GET() {
  const base = path.join(process.cwd(), "public", "fonts");
  const exts = new Set([".woff2", ".woff", ".ttf", ".otf"]); // ← .woff も許可しておくと吉
  try {
    // ★ 拡張子ありのファイル名をそのまま返す
    const fonts = fs
      .readdirSync(base)
      .filter(f => exts.has(path.extname(f).toLowerCase()));
    return Response.json({ fonts }); // 例: ["PopRumCute.woff2", "mushin.woff2", ...]
  } catch {
    return Response.json({ fonts: [] });
  }
}
