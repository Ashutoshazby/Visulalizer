import { getKolkataClock } from "../mood/KolkataTime.js";

export default function TimeDisplay({ message }) {
  const clock = getKolkataClock();
  return (
    <section className="time-display">
      <time>{clock.label}</time>
      <p>{message}</p>
    </section>
  );
}
