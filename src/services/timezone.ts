/**
 * Timezone Detection Service
 *
 * Detects device timezone and provides dual-time formatting
 * for when the user is traveling outside their home timezone.
 */

export interface TimezoneState {
  deviceTimezone: string;
  homeTimezone: string;
  isTraveling: boolean;
  offsetDiffHours: number;
}

export interface DualTime {
  local: string;
  home: string;
}

const HOME_TIMEZONE = 'America/Los_Angeles';

export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? HOME_TIMEZONE;
  } catch {
    return HOME_TIMEZONE;
  }
}

export function getTimezoneState(deviceTimezone?: string): TimezoneState {
  const tz = deviceTimezone ?? getDeviceTimezone();
  const now = new Date();

  const deviceOffset = getUtcOffsetMinutes(tz, now);
  const homeOffset = getUtcOffsetMinutes(HOME_TIMEZONE, now);
  const diffMinutes = deviceOffset - homeOffset;

  return {
    deviceTimezone: tz,
    homeTimezone: HOME_TIMEZONE,
    isTraveling: tz !== HOME_TIMEZONE,
    offsetDiffHours: diffMinutes / 60,
  };
}

function getUtcOffsetMinutes(timezone: string, date: Date): number {
  // Compare local representation to UTC to derive offset
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
}

export function getTimezoneAbbreviation(timezone: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: timezone,
    }).formatToParts(date);
    return parts.find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export function formatTimeInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(date);
}

export function formatLocalTime(date: Date, deviceTimezone: string): string {
  return formatTimeInZone(date, deviceTimezone);
}

export function formatHomeTime(date: Date): string {
  return formatTimeInZone(date, HOME_TIMEZONE);
}

export function formatDualTime(date: Date, deviceTimezone: string): DualTime {
  const localAbbr = getTimezoneAbbreviation(deviceTimezone, date);
  const homeAbbr = getTimezoneAbbreviation(HOME_TIMEZONE, date);

  return {
    local: `${formatLocalTime(date, deviceTimezone)} ${localAbbr}`,
    home: `${formatHomeTime(date)} ${homeAbbr}`,
  };
}

export function formatDateInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(date);
}

export function formatCurrentTimeInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(date);
}

export { HOME_TIMEZONE };
