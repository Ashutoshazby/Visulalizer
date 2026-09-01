const languages = [
  ["auto", "Auto"],
  ["hindi", "Hindi"],
  ["english", "English"],
  ["punjabi", "Punjabi"],
  ["haryanvi", "Haryanvi"],
  ["surprise", "Surprise Me"]
];

export default function LanguageSelector({ value, onChange }) {
  return (
    <div className="segmented compact" aria-label="Language">
      {languages.map(([id, label]) => (
        <button key={id} className={value === id ? "active" : ""} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
