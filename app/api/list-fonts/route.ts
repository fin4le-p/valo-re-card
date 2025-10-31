export const runtime = "nodejs";  // fs/pathを使うのでNodeで
import fs from "fs";
import path from "path";

export async function GET(){
const base = path.join(process.cwd(), "public", "fonts");
const exts = new Set([".woff2", ".ttf", ".otf"]);
try {
const files = fs.readdirSync(base).filter(f=>exts.has(path.extname(f).toLowerCase()))
// 拡張子を除いたフォントファミリー名風の候補にする（そのまま family 指定で使える前提）
const fonts = files.map(f => path.parse(f).name);
return Response.json({ fonts });
} catch {
return Response.json({ fonts: ["Rajdhani", "Noto Sans JP", "Inter"] });
}
}