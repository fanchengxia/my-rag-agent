import { EventSourceParserStream } from "eventsource-parser/stream";

export async function POST(req: Request) {
  const { query, conversationId } = await req.json();

  const DIFY_API_KEY = process.env.DIFY_API_KEY;

  if (!DIFY_API_KEY) {
    return Response.json({ error: "环境变量未配置，请设置 DIFY_API_KEY" }, { status: 500 });
  }

  const difyBody = {
    inputs: {},
    query: query,
    response_mode: "streaming",
    conversation_id: conversationId ?? "",
    user: "demo-user-001",
  };

  let difyRes: Response;
  try {
    difyRes = await fetch("https://api.dify.ai/v1/chat-messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(difyBody),
    });
  } catch {
    // 网络层异常（DNS 失败、断网等）也统一兜底
    return Response.json({ error: "Dify接口请求失败" }, { status: 500 });
  }

  if (!difyRes.ok || !difyRes.body) {
    return Response.json({ error: "Dify接口请求失败" }, { status: 500 });
  }

  // SSE 流处理：解析 Dify 返回的 SSE 事件流。
  // 每个事件的 data 本身就是一段 JSON 字符串，直接逐行透传给前端，
  // 前端再 JSON.parse 拿到 { answer, conversation_id, ... } 对象。
  const transformStream = difyRes.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(
      new TransformStream({
        transform(event, controller) {
          controller.enqueue(event.data + "\n");
        },
      }),
    );

  return new Response(transformStream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}
