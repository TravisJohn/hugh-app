"use client";

import { useState, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { Copy, Check } from "lucide-react";

interface Props {
  role:    "user" | "assistant";
  content: string;
}

// Flatten a rendered markdown node back to its plain text (for copy-to-clipboard).
function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

// Code block with a copy button — used for Hugh's deep-dive prompts (and any snippet).
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(nodeText(children).replace(/\n$/, "")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="relative mb-2">
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 pr-10 font-mono text-xs text-slate-300">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Copied" : "Copy"}
        className="absolute right-2 top-2 rounded-md border border-slate-700 bg-slate-800/80 p-1.5 text-slate-400 opacity-70 transition-all hover:text-white hover:opacity-100"
      >
        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      </button>
    </div>
  );
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
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
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
        className={`min-w-0 break-words rounded-2xl px-4 py-3 text-sm leading-relaxed
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
