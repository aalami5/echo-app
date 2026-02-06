/**
 * Calendar Service
 * 
 * Fetches calendar events from the Gateway.
 * The Gateway (Echo) uses gog to fetch from Google Calendar
 * and returns structured JSON.
 */

import { CalendarEvent } from '../stores/calendarStore';

interface GatewayCalendarEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  description?: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  organizer?: { email: string; displayName?: string };
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string;
      uri?: string;
      label?: string;
      pin?: string;
      passcode?: string;
    }>;
  };
  htmlLink?: string;
}

interface CalendarResponse {
  events: GatewayCalendarEvent[];
  error?: string;
}

/**
 * Parse a gateway calendar event into our app's format
 */
function parseEvent(event: GatewayCalendarEvent): CalendarEvent {
  // Parse start time
  const startTime = event.start.dateTime 
    ? new Date(event.start.dateTime)
    : new Date(event.start.date + 'T00:00:00');
  
  // Parse end time
  let endTime: Date | undefined;
  if (event.end) {
    endTime = event.end.dateTime
      ? new Date(event.end.dateTime)
      : new Date(event.end.date + 'T23:59:59');
  }

  // Extract video link from description or conferenceData
  let videoLink: string | undefined;
  let videoProvider: 'zoom' | 'teams' | 'meet' | 'webex' | 'other' | undefined;
  let dialIn: string | undefined;
  let dialInCode: string | undefined;

  // Check conferenceData first
  if (event.conferenceData?.entryPoints) {
    for (const entry of event.conferenceData.entryPoints) {
      if (entry.entryPointType === 'video' && entry.uri) {
        videoLink = entry.uri;
        if (entry.uri.includes('zoom.us')) videoProvider = 'zoom';
        else if (entry.uri.includes('teams.microsoft')) videoProvider = 'teams';
        else if (entry.uri.includes('meet.google')) videoProvider = 'meet';
        else if (entry.uri.includes('webex')) videoProvider = 'webex';
        else videoProvider = 'other';
      }
      if (entry.entryPointType === 'phone') {
        dialIn = entry.uri?.replace('tel:', '');
        dialInCode = entry.pin || entry.passcode;
      }
    }
  }

  // Fallback: extract from description
  if (!videoLink && event.description) {
    const desc = event.description;
    
    // Zoom
    const zoomMatch = desc.match(/https:\/\/[a-z]*\.?zoom\.us\/j\/[^\s<"]+/i);
    if (zoomMatch) {
      videoLink = zoomMatch[0];
      videoProvider = 'zoom';
    }
    
    // Teams
    const teamsMatch = desc.match(/https:\/\/teams\.microsoft\.com\/[^\s<"]+/i);
    if (teamsMatch) {
      videoLink = teamsMatch[0];
      videoProvider = 'teams';
    }
    
    // Google Meet
    const meetMatch = desc.match(/https:\/\/meet\.google\.com\/[^\s<"]+/i);
    if (meetMatch) {
      videoLink = meetMatch[0];
      videoProvider = 'meet';
    }
  }

  // Extract attendee names
  const attendees = event.attendees
    ?.filter(a => a.responseStatus !== 'declined')
    .map(a => a.displayName || a.email.split('@')[0])
    .slice(0, 10); // Limit to 10

  return {
    id: event.id,
    title: event.summary || 'Untitled Event',
    startTime,
    endTime,
    location: event.location,
    videoLink,
    videoProvider,
    dialIn,
    dialInCode,
    description: event.description,
    attendees,
    organizer: event.organizer?.displayName || event.organizer?.email,
  };
}

/**
 * Fetch calendar events from the Gateway
 */
export async function fetchCalendarEvents(
  gatewayUrl: string,
  gatewayToken: string,
  options: { from?: string; to?: string; today?: boolean } = { today: true }
): Promise<CalendarEvent[]> {
  const baseUrl = gatewayUrl.trim().replace(/\/+$/, '');
  
  // Build the request - ask Echo for calendar data in JSON format
  let prompt = '[CALENDAR_SYNC_REQUEST] ';
  if (options.today) {
    prompt += 'Fetch today\'s calendar events. ';
  } else {
    if (options.from) prompt += `From ${options.from}. `;
    if (options.to) prompt += `To ${options.to}. `;
  }
  prompt += 'Return ONLY the raw JSON from gog, no markdown.';

  console.log('[Calendar] Fetching events from Gateway...');
  
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({
      model: 'openclaw:main',
      messages: [
        { 
          role: 'system', 
          content: 'When you see [CALENDAR_SYNC_REQUEST], run `gog calendar list --today --json` and return ONLY the raw JSON output. No markdown, no explanation, no code blocks - just the JSON object starting with {.' 
        },
        { role: 'user', content: prompt }
      ],
      stream: false,
      user: 'echo-app-oliver',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Calendar] Gateway error:', response.status, error);
    throw new Error(`Failed to fetch calendar: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('No calendar data received');
  }

  console.log('[Calendar] Raw response:', content.slice(0, 200));

  // Parse the JSON response
  // Handle potential markdown code blocks
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const data: CalendarResponse = JSON.parse(jsonStr);
    
    if (data.error) {
      throw new Error(data.error);
    }

    const events = (data.events || []).map(parseEvent);
    
    // Sort by start time
    events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    console.log('[Calendar] Parsed', events.length, 'events');
    return events;
  } catch (parseError) {
    console.error('[Calendar] Failed to parse response:', parseError);
    console.error('[Calendar] Content was:', jsonStr.slice(0, 500));
    throw new Error('Failed to parse calendar data');
  }
}
