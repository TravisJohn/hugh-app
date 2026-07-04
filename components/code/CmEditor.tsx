"use client";

import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

// Defined once at module scope so the editor isn't rebuilt on every render.
const extensions = [python()];

/**
 * Thin CodeMirror 6 wrapper shared by the learner editor and Hugh's ghost
 * panel. Python highlighting, one-dark theme, fills its flex parent.
 */
export default function CmEditor({ value, onChange, readOnly = false }: Props) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={oneDark}
      extensions={extensions}
      editable={!readOnly}
      readOnly={readOnly}
      height="100%"
      className="h-full text-[13px]"
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
