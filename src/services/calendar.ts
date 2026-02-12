/**
 * Calendar Service
 * 
 * Fetches calendar events using the fastest available method:
 * 1. Direct Calendar API (local network) - ~800ms
 * 2. Gateway chat completions (remote) - fallback, slower
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
  fetchedAt?: string;
  elapsed?: number;
}

// Calendar API port (runs alongside Gateway)
const CALENDAR_API_PORT = 18791;

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
 * Try to fetch from the fast Calendar API
 * Tries public URL first (always works), then local network fallbacks
 */
async function fetchFromCalendarApi(
  gatewayToken: string,
  options: { today?: boolean; week?: boolean }
): Promise<CalendarEvent[] | null> {
  // Public URL via Cloudflare tunnel (works from anywhere)
  const PUBLIC_URL = 'https://calendar.oppersmedical.com';
  // Mac Mini's local IP address (home network - slightly faster when available)
  const MAC_MINI_IP = '10.0.0.244';
  
  // Try public URL first (always works), then local network fallbacks
  const endpoints = options.week 
    ? [
        `${PUBLIC_URL}/api/calendar/week`,
        `http://${MAC_MINI_IP}:${CALENDAR_API_PORT}/api/calendar/week`,
        `http://localhost:${CALENDAR_API_PORT}/api/calendar/week`,
      ]
    : [
        `${PUBLIC_URL}/api/calendar?today=true`,
        `http://${MAC_MINI_IP}:${CALENDAR_API_PORT}/api/calendar?today=true`,
        `http://localhost:${CALENDAR_API_PORT}/api/calendar?today=true`,
      ];

  for (const endpoint of endpoints) {
    try {
      console.log('[Calendar] Trying Calendar API at:', endpoint);
      const startTime = Date.now();
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout per endpoint
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${gatewayToken}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        console.log('[Calendar] Calendar API returned', response.status);
        continue; // Try next endpoint
      }

      const data: CalendarResponse = await response.json();
      const elapsed = Date.now() - startTime;
      
      if (data.error) {
        console.log('[Calendar] Calendar API error:', data.error);
        continue; // Try next endpoint
      }

      const events = (data.events || []).map(parseEvent);
      events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      
      console.log(`[Calendar] Fast API: ${events.length} events in ${elapsed}ms`);
      return events;
    } catch (err) {
      console.log('[Calendar] Endpoint failed, trying next...', endpoint);
      continue; // Try next endpoint
    }
  }
  
  // All endpoints failed
  console.log('[Calendar] All Calendar API endpoints failed, will use fallback');
  return null;
}

/**
 * Fallback: fetch via Gateway chat completions (works remotely)
 */
async function fetchFromGateway(
  gatewayUrl: string,
  gatewayToken: string,
  options: { today?: boolean }
): Promise<CalendarEvent[]> {
  const baseUrl = gatewayUrl.trim().replace(/\/+$/, '');
  
  let prompt = '[CALENDAR_SYNC_REQUEST] ';
  if (options.today) {
    prompt += 'Fetch today\'s calendar events. ';
  }
  prompt += 'Return ONLY the raw JSON from gog, no markdown.';

  console.log('[Calendar] Using Gateway fallback...');
  const startTime = Date.now();
  
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
          content: 'When you see [CALENDAR_SYNC_REQUEST], run `gog calendar events primary --from today --to tomorrow --json --account aalami@gmail.com` and return ONLY the raw JSON output. No markdown, no explanation, no code blocks - just the JSON object starting with {.' 
        },
        { role: 'user', content: prompt }
      ],
      stream: false,
      user: 'echo-app-oliver',
    }),
  });

  const elapsed = Date.now() - startTime;
  console.log(`[Calendar] Gateway response in ${elapsed}ms`);

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

  // Parse the JSON response
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
    events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    console.log(`[Calendar] Gateway: ${events.length} events`);
    return events;
  } catch (parseError) {
    console.error('[Calendar] Failed to parse response:', parseError);
    throw new Error('Failed to parse calendar data');
  }
}

/**
 * Fetch calendar events using the fastest available method
 */
export async function fetchCalendarEvents(
  gatewayUrl: string,
  gatewayToken: string,
  options: { from?: string; to?: string; today?: boolean; week?: boolean } = { today: true }
): Promise<CalendarEvent[]> {
  // Try fast Calendar API first (local network)
  const fastResult = await fetchFromCalendarApi(gatewayToken, options);
  if (fastResult !== null) {
    return fastResult;
  }
  
  // Fallback to Gateway (remote access)
  return fetchFromGateway(gatewayUrl, gatewayToken, { today: options.today });
}
