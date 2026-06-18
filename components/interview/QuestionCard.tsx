interface Props {
  questionText: string;
  size:         'large' | 'small';
}

export default function QuestionCard({ questionText, size }: Props) {
  return (
    <div
      className={`w-full transition-all duration-500 ${
        size === 'large' ? 'max-w-2xl' : 'max-w-xl'
      }`}
    >
      <p
        className={`font-serif italic leading-relaxed transition-all duration-500 ${
          size === 'large'
            ? 'text-2xl text-white'
            : 'text-lg text-slate-300'
        }`}
      >
        &ldquo;{questionText}&rdquo;
      </p>
    </div>
  );
}
