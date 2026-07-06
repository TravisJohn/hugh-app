"use client";

import { useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** When provided, Shift+Enter runs this (used by the notebook-drill cells). */
  onSubmit?: () => void;
  /** Editor font size in px (accessibility). Defaults to 13. */
  fontSize?: number;
}

// Defined once at module scope so the editor isn't rebuilt on every render.
const baseExtensions = [python()];

/**
 * Thin CodeMirror 6 wrapper shared by the learner editor and Hugh's ghost
 * panel. Python highlighting, one-dark theme, fills its flex parent.
 */
export default function CmEditor({ value, onChange, readOnly = false, onSubmit, fontSize = 13 }: Props) {
  // Call the latest onSubmit via a ref so the keymap extension stays stable.
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const extensions = useMemo(() => {
    if (!onSubmit) return baseExtensions;
    return [
      python(),
      Prec.highest(
        keymap.of([
          { key: "Shift-Enter", run: () => { submitRef.current?.(); return true; } },
        ]),
      ),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!onSubmit]);

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
