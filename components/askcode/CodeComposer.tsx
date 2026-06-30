"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { Send, X, Code2 } from "lucide-react";
import { languageExtension, isHighlighted } from "@/lib/askcode/language";

interface Props {
  language:  string;
  value:     string;
  disabled:  boolean;
  onChange:  (value: string) => void;
  onSend:    () => void;
  onExit:    () => void;
}

/**
 * The Code-Mode incarnation of the chat composer. Swaps the plain textarea for a
 * lightweight CodeMirror editor so the learner can mirror-type Hugh's reference
 * snippet — Tab indents (instead of moving focus), the snippet's language is
 * highlighted where supported, and ⌘/Ctrl+Enter sends. It is deliberately
 * non-blocking: no linting, no errors, no execution. On send the parent wraps the
 * buffer in a fenced block and posts it as an ordinary chat message.
 */
export default function CodeComposer({ language, value, disabled, onChange, onSend, onExit }: Props) {
  // Tab indents instead of moving focus. Static binding (no captured props), so
  // the extension set only changes when the language changes.
  const extensions = useMemo(
    () => [...languageExtension(language), keymap.of([indentWithTab])],
    [language],
  );

  // ⌘/Ctrl+Enter sends. Handled on a wrapper rather than a CodeMirror keymap so
  // the editor's extensions stay free of render-time closures over `onSend`.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  }

  const langLabel = language ? language.toUpperCase() : "TEXT";

  return (
    <div className="shrink-0 border-t border-slate-800 px-4 py-4" onKeyDown={handleKeyDown}>
      <div className="rounded-xl border border-violet-500/40 bg-slate-800 focus-within:border-violet-500 transition-colors overflow-hidden">

        {/* Header strip — signals the mode and offers a way out */}
        <div className="flex items-center justify-between border-b border-slate-700/70 bg-violet-500/5 px-3 py-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
            <Code2 size={13} />
            Code mode
            <span className="rounded bg-violet-900/50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-violet-300">
              {langLabel}
            </span>
            {!isHighlighted(language) && (
              <span className="text-[10px] font-normal text-slate-500">plain editor</span>
            )}
          </div>
          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={11} />
            Exit
          </button>
        </div>

        {/* Editor — drag the bottom edge to resize. Bounded so it can't collapse
            the chat above or overflow the viewport (no-scroll budget). */}
        <div className="h-52 min-h-[6rem] max-h-[60vh] resize-y overflow-auto">
          <CodeMirror
            value={value}
            onChange={onChange}
            theme={oneDark}
            extensions={extensions}
            editable={!disabled}
            placeholder={"Retype the snippet here, adding a comment in your own words on each line…"}
            height="100%"
            className="h-full text-[13px]"
            basicSetup={{
              lineNumbers:               true,
              foldGutter:                false,
              autocompletion:            false,
              highlightActiveLine:       true,
              highlightActiveLineGutter: true,
            }}
          />
        </div>

        {/* Footer — send */}
        <div className="flex items-center justify-between border-t border-slate-700/70 px-3 py-2">
          <span className="text-xs text-slate-600">⌘/Ctrl+Enter to send · Tab to indent · drag edge to resize</span>
          <button
            type="button"
            onClick={onSend}
            disabled={!value.trim() || disabled}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={13} />
            Send code
          </button>
        </div>
      </div>
    </div>
  );
}
