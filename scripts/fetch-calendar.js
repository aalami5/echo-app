#!/usr/bin/env node
/**
 * Fetches calendar events from Google Calendar via gog CLI
 * and transforms them to the CalendarEvent format for Echo App.
 * 
 * Usage: node scripts/fetch-calendar.js [--today|--tomorrow|--week]
 */

const { execSync } = require('child_process');

function detectVideoProvider(url) {
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
  if (url.includes('meet.google.com')) return 'meet';
  if (url.includes('webex.com')) return 'webex';
  return 'other';
}

function extractVideoFromDescription(description) {
  const result = {};
  
  // Look for Zoom links
  const zoomMatch = description.match(/https:\/\/[^\s]*zoom\.us\/j\/(\d+)[^\s]*/i);
  if (zoomMatch) {
    result.videoLink = zoomMatch[0];
    result.dialInCode = zoomMatch[1];
  }
  
  // Look for Teams links
  const teamsMatch = description.match(/https:\/\/teams\.microsoft\.com\/[^\s\\]+/i);
  if (teamsMatch) {
    result.videoLink = teamsMatch[0];
  }
  
  // Look for Meet links
  const meetMatch = description.match(/https:\/\/meet\.google\.com\/[^\s]+/i);
  if (meetMatch) {
    result.videoLink = meetMatch[0];
  }
  
  // Look for phone dial-in
  const phoneMatch = description.match(/(?:Dial-in|Phone|Tel)[:\s]*([+\d\s\-()]+)/i);
  if (phoneMatch) {
    result.dialIn = phoneMatch[1].trim();
  }
  
  // Look for meeting ID/code
  const codeMatch = description.match(/(?:Meeting ID|Code|Passcode)[:\s]*(\d[\d\s\-]+\d)/i);
  if (codeMatch && !result.dialInCode) {
    result.dialInCode = codeMatch[1].replace(/[\s\-]/g, '');
  }
  
  return result;
}

function generateMapsUrl(location) {
  const query = encodeURIComponent(location);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function transformEvent(event) {
  // Skip events without a start time
  if (!event.start) return null;
  
  // Skip all-day events for now (they have date but not dateTime)
  if (event.start.date && !event.start.dateTime) return null;
  
  const startTime = event.start.dateTime || event.start.date;
  if (!startTime) return null;
  
  const transformed = {
    id: event.id,
    title: event.summary || 'Untitled Event',
    startTime: startTime,
  };
  
  // End time
  if (event.end?.dateTime) {
    transformed.endTime = event.end.dateTime;
  }
  
  // Location
  if (event.location) {
    transformed.location = event.location;
    transformed.locationUrl = generateMapsUrl(event.location);
  }
  
  // Conference data (video/phone)
  if (event.conferenceData?.entryPoints) {
    for (const entry of event.conferenceData.entryPoints) {
      if (entry.entryPointType === 'video' && entry.uri) {
        transformed.videoLink = entry.uri;
        transformed.videoProvider = detectVideoProvider(entry.uri);
        if (entry.passcode) {
          transformed.dialInCode = entry.passcode;
        }
      }
      if (entry.entryPointType === 'phone' && entry.uri) {
        // Extract phone number from tel: URI
        transformed.dialIn = entry.label || entry.uri.replace('tel:', '').split(',')[0];
        if (entry.passcode) {
          transformed.dialInCode = entry.passcode;
        }
      }
    }
  }
  
  // Parse description for video links if not found in conferenceData
  if (event.description) {
    transformed.description = event.description;
    
    if (!transformed.videoLink) {
      const extracted = extractVideoFromDescription(event.description);
      if (extracted.videoLink) {
        transformed.videoLink = extracted.videoLink;
        transformed.videoProvider = detectVideoProvider(extracted.videoLink);
      }
      if (extracted.dialIn && !transformed.dialIn) {
        transformed.dialIn = extracted.dialIn;
      }
      if (extracted.dialInCode && !transformed.dialInCode) {
        transformed.dialInCode = extracted.dialInCode;
      }
    }
  }
  
  // Attendees
  if (event.attendees && event.attendees.length > 0) {
    transformed.attendees = event.attendees
      .filter(a => !a.self) // Exclude self
      .map(a => a.displayName || a.email.split('@')[0])
      .slice(0, 20); // Limit to 20 attendees
  }
  
  // Organizer
  if (event.organizer) {
    transformed.organizer = event.organizer.displayName || event.organizer.email;
  }
  
  return transformed;
}

function fetchCalendar(options = { today: true }) {
  let flags = '--today';
  if (options.tomorrow) flags = '--tomorrow';
  if (options.week) flags = '--from=today --to=+7d';
  
  try {
    const output = execSync(`gog calendar list ${flags} --json 2>/dev/null`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    
    const data = JSON.parse(output);
    const events = [];
    
    for (const event of data.events || []) {
      const transformed = transformEvent(event);
      if (transformed) {
        events.push(transformed);
      }
    }
    
    // Sort by start time
    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    
    return events;
  } catch (error) {
    console.error('Failed to fetch calendar:', error.message);
    return [];
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    today: args.includes('--today') || args.length === 0,
    tomorrow: args.includes('--tomorrow'),
    week: args.includes('--week'),
  };
  
  const events = fetchCalendar(options);
  console.log(JSON.stringify({ events }, null, 2));
}

module.exports = { fetchCalendar, transformEvent };
