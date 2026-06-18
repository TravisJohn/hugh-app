import type { ReactNode } from "react";

interface Props {
  role:    "user" | "assistant";
  content: string;
}

function renderBold(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-white">{part}</strong>
      : part
  );
}

export default function ChatBubble({ role, content }: Props) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mr-2.5 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-900/60 text-xs font-bold text-violet-400">
          H
        </div>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? "rounded-tr-sm bg-sky-600 text-white"
            : "rounded-tl-sm bg-slate-800 text-slate-200 border border-slate-700"
          }`}
      >
        {renderBold(content)}
      </div>
    </div>
  );
}
