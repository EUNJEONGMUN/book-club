const meetingDateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getKoreanMeetingDateTime(value: string | Date) {
  const parts = Object.fromEntries(
    meetingDateTimeFormatter.formatToParts(new Date(value)).map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
  };
}

export function getKoreanMeetingDayDifference(scheduledAt: string, now = new Date()): number {
  const meetingDate = getKoreanMeetingDateTime(scheduledAt).date;
  const currentDate = getKoreanMeetingDateTime(now).date;
  // Treat the Seoul date labels as UTC midnights to subtract calendar days.
  return (Date.parse(`${meetingDate}T00:00:00Z`) - Date.parse(`${currentDate}T00:00:00Z`)) / 86_400_000;
}

export function hasMeetingStarted(scheduledAt: string, now = Date.now()): boolean {
  return Date.parse(scheduledAt) <= now;
}
