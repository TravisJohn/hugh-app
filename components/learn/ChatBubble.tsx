"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface Props {
  role:    "user" | "assistant";
  content: string;
}

const markdownComponents: Components = {
  p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em:     ({ children }) => <em className="italic text-slate-300">{children}</em>,
  ul:     ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
  ol:     ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
  li:     ({ children }) => <li className="text-slate-200">{children}</li>,
  h1:     ({ children }) => <h1 className="mb-2 text-base font-bold text-white">{children}</h1>,
  h2:     ({ children }) => <h2 className="mb-1.5 text-sm font-bold text-white">{children}</h2>,
  h3:     ({ children }) => <h3 className="mb-1 text-sm font-semibold text-slate-100">{children}</h3>,
  code:   ({ children, className }) => {
    const isBlock = className?.includes("language-");
    return isBlock ? (
      <code className="block">{children}</code>
    ) : (
      <code className="rounded bg-slate-700 px-1 py-0.5 font-mono text-xs text-sky-300">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-300">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-600">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-700">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr:    ({ children }) => <tr className="border-b border-slate-700 last:border-0">{children}</tr>,
  th:    ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-slate-200">{children}</th>
  ),
  td:    ({ children }) => (
    <td className="px-3 py-2 text-slate-300">{children}</td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-slate-600 pl-3 text-slate-400 italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-slate-700" />,
};

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
        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
          ${isUser
            ? "max-w-[78%] rounded-tr-sm bg-sky-600 text-white whitespace-pre-wrap"
            : "w-full max-w-[92%] rounded-tl-sm bg-slate-800 text-slate-200 border border-slate-700"
          }`}
      >
        {isUser ? (
          content
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
