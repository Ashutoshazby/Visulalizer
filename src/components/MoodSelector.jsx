const moods = [
  ["auto", "AUTO"],
  ["romantic", "Romantic"],
  ["sad", "Sad"],
  ["late-night", "Late Night"],
  ["nostalgic", "90s"],
  ["highway", "Highway"],
  ["energetic", "Energetic"],
  ["chill", "Chill"]
];

export default function MoodSelector({ value, onChange }) {
  return (
    <div className="segmented" aria-label="Mood">
      {moods.map(([id, label]) => (
        <button key={id} className={value === id ? "active" : ""} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
