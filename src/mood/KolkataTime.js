const KOLKATA_TIME_ZONE = "Asia/Kolkata";

const kolkataPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: KOLKATA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const kolkataDisplayFormatter = new Intl.DateTimeFormat([], {
  timeZone: KOLKATA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit"
});

export function getKolkataClock(date = new Date()) {
  const parts = Object.fromEntries(
    kolkataPartsFormatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  const hour = parts.hour === 24 ? 0 : parts.hour;
  return {
    day: parts.day,
    hour,
    minute: parts.minute,
    timeValue: hour + parts.minute / 60,
    label: kolkataDisplayFormatter.format(date),
    timeZone: KOLKATA_TIME_ZONE
  };
}
