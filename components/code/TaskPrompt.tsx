interface Props {
  title: string;
  prompt: string;
}

/** The current rung's instruction, centred above the two editors. */
export default function TaskPrompt({ title, prompt }: Props) {
  return (
    <div className="text-center">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-sky-400/80">
        {title}
      </p>
      <p className="text-lg font-medium text-slate-100">{prompt}</p>
    </div>
  );
}
