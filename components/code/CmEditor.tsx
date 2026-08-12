"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { DrillLang } from "@/types/code";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** When provided, Shift+Enter runs this (used by the notebook-drill cells). */
  onSubmit?: () => void;
  /** Editor font size in px (accessibility). Defaults to 13. */
  fontSize?: number;
  /** Which language grammar to highlight. Defaults to Python. */
  lang?: DrillLang;
}

// The language grammar extension, memoised per language at module scope.
const langExtension = (lang: DrillLang) => (lang === "sql" ? sql() : python());

/**
 * Thin CodeMirror 6 wrapper shared by the learner editor and Hugh's ghost
 * panel. Python highlighting, one-dark theme, fills its flex parent.
 *
 * Memoized: a notebook drill mounts one editor per cell (a dozen+), and every
 * keystroke / timer tick re-renders the parent. Without memo, all editors would
 * reconcile CodeMirror on each of those — the source of the typing lag. With
 * stable handler props from the parent, only the edited cell's editor re-renders.
 */
function CmEditor({ value, onChange, readOnly = false, onSubmit, fontSize = 13, lang = "python" }: Props) {
  // Call the latest onSubmit via a ref so the keymap extension stays stable.
  const submitRef = useRef(onSubmit);
  useEffect(() => { submitRef.current = onSubmit; }, [onSubmit]);

  const hasSubmit = !!onSubmit;
  const extensions = useMemo(() => {
    if (!hasSubmit) return [langExtension(lang)];
    return [
      langExtension(lang),
      Prec.highest(
        // The ref is only ever read inside the CodeMirror keymap's `run`
        // callback (a keypress handler), never during this render — that's
        // the whole point of routing it through a ref instead of a closure
        // over `onSubmit` directly, so `extensions` (and CodeMirror's
        // instance) doesn't need to be rebuilt on every keystroke.
        // eslint-disable-next-line react-hooks/refs
        keymap.of([
          { key: "Shift-Enter", run: () => { submitRef.current?.(); return true; } },
        ]),
      ),
    ];
  }, [hasSubmit, lang]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={oneDark}
      extensions={extensions}
      editable={!readOnly}
      readOnly={readOnly}
      height="100%"
      style={{ fontSize: `${fontSize}px` }}
      className="h-full"
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        autocompletion: false,
        highlightActiveLineGutter: !readOnly,
      }}
    />
  );
}

export default memo(CmEditor);
