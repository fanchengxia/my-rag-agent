"use client";
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

type RetrieverResource = {
  position?: number;
  dataset_name?: string;
  document_name?: string;
  content?: string;
  score?: number;
};

type MessageItem = {
  role: "user" | "ai";
  content: string;
  sources?: RetrieverResource[];
};

export default function RagAgentPage() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [conversationId, setConversationId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return;
    setErrorMsg("");

    const userMsg: MessageItem = { role: "user", content: inputText.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setLoading(true);

    // 追加空 AI 消息，逐步填充流内容
    setMessages((prev) => [...prev, { role: "ai", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMsg.content,
          conversationId,
        }),
      });

      if (!res.ok || !res.body) throw new Error("请求异常");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aiContent = "";
      let sources: RetrieverResource[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // stream: true 处理多字节 UTF-8（中文）跨 chunk 被截断导致的乱码
        buffer += decoder.decode(value, { stream: true });

        // 按换行拆行；最后一段可能是不完整的行，留到下一轮继续拼接
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.answer) {
              aiContent += json.answer;
            }
            // Dify 在 message_end 事件里返回知识库检索到的片段（metadata.retriever_resources）
            if (json.event === "message_end") {
              sources = json.metadata?.retriever_resources ?? [];
            }
            // 保存会话 id，用于多轮对话上下文记忆
            if (json.conversation_id && !conversationId) {
              setConversationId(json.conversation_id);
            }
            setMessages((prev) => {
              const arr = [...prev];
              arr[arr.length - 1] = { role: "ai", content: aiContent, sources };
              return arr;
            });
          } catch {
            // 忽略无法解析的片段
          }
        }
      }
    } catch {
      setErrorMsg("网络异常，请求失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 h-screen flex flex-col">
      <h1 className="text-xl font-bold mb-4 text-center">Web知识库RAG-Agent Demo</h1>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardContent className="flex-1 overflow-auto p-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="text-gray-400 text-center mt-20">请输入问题，基于知识库进行问答</div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`mb-3 ${msg.role === "user" ? "text-right" : "text-left"}`}>
              <div
                className={`inline-block px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-wrap
                ${msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100 text-black"}`}
              >
                {msg.content || (loading && idx === messages.length - 1 ? "思考中……" : "")}
              </div>
              {msg.role === "ai" && msg.sources && msg.sources.length > 0 && (
                <details className="mt-2 max-w-[85%]">
                  <summary className="text-xs text-gray-500 cursor-pointer select-none">
                    📚 检索到 {msg.sources.length} 个知识库片段
                  </summary>
                  <div className="mt-2 space-y-2">
                    {msg.sources.map((s, i) => (
                      <div key={i} className="text-xs bg-gray-50 border border-gray-200 rounded-md p-2">
                        <div className="font-medium text-gray-700 mb-1">
                          {s.document_name || "未知文档"}
                          {typeof s.score === "number" && (
                            <span className="text-gray-400 font-normal ml-1">
                              ({(s.score * 100).toFixed(0)}%)
                            </span>
                          )}
                        </div>
                        {s.content && (
                          <div className="text-gray-500 whitespace-pre-wrap">{s.content}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
          {errorMsg && (
            <Alert variant="destructive" className="my-2">
              {errorMsg}
            </Alert>
          )}
          {messages.some((m) => m.role === "ai") && (
            <div className="text-xs text-orange-500 mt-2">⚠️ AI生成内容存在幻觉风险，请人工核实信息</div>
          )}
        </CardContent>

        <div className="p-3 border-t flex gap-2">
          <Textarea
            placeholder="输入你的问题..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 resize-none"
          />
          <Button onClick={sendMessage} disabled={loading}>
            {loading ? "发送中" : "发送"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
