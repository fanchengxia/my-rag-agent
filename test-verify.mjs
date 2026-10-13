// 本地调试脚本：验证 Dify 知识库检索是否生效。
// 密钥从 .env.local 读取（不再硬编码），运行方式：node test-verify.mjs
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const vars = { ...process.env };
  try {
    const content = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      vars[key] = value;
    }
  } catch {
    // .env.local 不存在时忽略，回退到 process.env
  }
  return vars;
}

const k = loadEnv().DIFY_API_KEY;
if (!k) {
  console.error("未找到 DIFY_API_KEY：请在 .env.local 中配置，或通过环境变量 DIFY_API_KEY 传入");
  process.exit(1);
}

const r = await fetch("https://api.dify.ai/v1/chat-messages", {
  method: "POST",
  headers: { Authorization: "Bearer " + k, "Content-Type": "application/json" },
  body: JSON.stringify({ inputs: {}, query: "什么是harness", response_mode: "blocking", conversation_id: "", user: "test" }),
});
const j = await r.json();
console.log("HTTP", r.status);
console.log("=== AI 回答 ===");
console.log(j.answer);
const rr = j.metadata?.retriever_resources || [];
console.log("\n=== 检索到的片段数量:", rr.length, "===");
for (const item of rr.slice(0, 4)) {
  console.log("- 来源:", item.segment?.document?.name || item.document_name || "?");
  console.log("  内容:", (item.content || "").slice(0, 120));
}
