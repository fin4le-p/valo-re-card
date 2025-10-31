export async function GET(){
// public/ranks を前提。別フォルダにしたい場合は base を .env で差し替え
const base = process.env.RANK_DIR || "/ranks";
return Response.json({ base });
}