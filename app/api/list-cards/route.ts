export const dynamic = "force-dynamic"; // 追加/削除を即時反映


import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";


export async function GET(req: NextRequest){
// CARD_DIR を指定すればそこ（例：/var/data/cards）、無ければ /public/cards
const base = process.env.CARD_DIR || path.join(process.cwd(), "public", "cards");
const exts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
try {
const files = fs.readdirSync(base)
.filter(f => exts.has(path.extname(f).toLowerCase()))
.map(f => `/cards/${f}`); // public 以下はそのままパス解決
return Response.json({ files });
} catch (e:any) {
return Response.json({ files: [], error: e?.message }, { status: 200 });
}
}