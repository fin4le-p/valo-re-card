export const runtime = "nodejs";  // fs/pathを使うのでNodeで
import fs from "fs";
import path from "path";

export async function GET(){
// data/agents.json を動的に読む。例： ["Astra","Jett", ...]
try {
const p = path.join(process.cwd(),"public", "data", "agents.json");
const txt = fs.readFileSync(p, "utf8");
const agents = JSON.parse(txt);
return Response.json({ agents });
} catch {
return Response.json({ agents: ["Astra", "Jett", "Sage", "Sova", "Viper"] });
}
}