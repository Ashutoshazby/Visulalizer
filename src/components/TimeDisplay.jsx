export default function TimeDisplay({ message }) {
  const now = new Date();
  return (
    <section className="time-display">
      <time>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      <p>{message}</p>
    </section>
  );
}
