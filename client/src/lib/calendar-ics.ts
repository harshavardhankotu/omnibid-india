export interface CalendarSyncEvent {
  id: string;
  requirementId: string;
  kind: "start" | "deadline";
  title: string;
  description: string;
  location: string;
  startDate: Date;
  endDate: Date;
  url: string;
}

function formatIcsUtcDate(date: Date): string {
  const iso = date.toISOString();
  // YYYY-MM-DDTHH:mm:ss.sssZ -> YYYYMMDDTHHMMSSZ
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function generateIcsContent(events: CalendarSyncEvent[]): string {
  const nowStamp = formatIcsUtcDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OmniBid India//Auction Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:OmniBid Auction Calendar",
  ];

  for (const event of events) {
    const uid = `omnibid-${event.kind}-${event.requirementId}@omnibid.in`;
    const prefix = event.kind === "deadline" ? "[Deadline] " : "[Auction Start] ";

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${formatIcsUtcDate(event.startDate)}`,
      `DTEND:${formatIcsUtcDate(event.endDate)}`,
      `SUMMARY:${escapeIcsText(`${prefix}${event.title}`)}`,
      `DESCRIPTION:${escapeIcsText(`${event.description}\n\nView Auction: ${event.url}`)}`,
      `LOCATION:${escapeIcsText(event.location)}`,
      `URL:${event.url}`,
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`Reminder: ${prefix}${event.title}`)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR", "");
  return lines.join("\r\n");
}

export function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildGoogleCalendarUrl(event: CalendarSyncEvent): string {
  const prefix = event.kind === "deadline" ? "[Deadline] " : "[Auction Start] ";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${prefix}${event.title}`,
    dates: `${formatIcsUtcDate(event.startDate)}/${formatIcsUtcDate(event.endDate)}`,
    details: `${event.description}\n\nAuction Link: ${event.url}`,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
