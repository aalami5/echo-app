/**
 * Echo Patient Sync Server + Push Notification Service
 * 
 * Simple Express server for patient data sync, search, and push notifications.
 * - POST /sync - receives full patient list, saves to JSON
 * - GET /search?q=<query> - searches patients by name, MRN, room, complaint
 * - GET /patients - returns all patients
 * - POST /notify - send push notification to all registered devices
 * - POST /notify/meeting - send meeting reminder
 * - POST /notify/message - send new message notification
 * - POST /notify/brief - send daily brief notification
 * 
 * Uses same auth token as OpenClaw gateway for security.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { Expo } = require('expo-server-sdk');
const { createClient } = require('@supabase/supabase-js');

// Initialize Expo SDK
const expo = new Expo();

// Initialize Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mshgthoogedzdoqgcgcj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zaGd0aG9vZ2VkemRvcWdjZ2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwODA5MTUsImV4cCI6MjA4NTY1NjkxNX0.BWkcIYjX4KsUDzUDbhrO2ieH-2bTXvMa7MOgc47-f6Y';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
const PORT = process.env.PORT || 18790;

// Auth token (same as OpenClaw gateway)
const AUTH_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.AUTH_TOKEN;

// Data file path
const DATA_DIR = process.env.DATA_DIR || path.join(process.env.HOME, '.openclaw/workspace/data');
const DATA_FILE = path.join(DATA_DIR, 'patients.json');
const DICTATIONS_FILE = path.join(DATA_DIR, 'dictations.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'pending-messages.json');
const DELIVERY_FILE = path.join(DATA_DIR, 'notification-deliveries.json');
const OPERATIVE_REPORT_RECIPIENTS = [
  'aalami@gmail.com',
  'Oliver.Aalami@sutterhealth.org',
  'Rajka.Campbell@sutterhealth.org',
];
const OPERATIVE_REPORT_ACCOUNT = process.env.OPERATIVE_REPORT_EMAIL_ACCOUNT || 'aalami@gmail.com';
const OPERATIVE_RVU_BACKEND_URL = process.env.OPERATIVE_RVU_BACKEND_URL || 'http://127.0.0.1:8765/v1/operative-reports';
const OPERATIVE_RVU_API_TOKEN = process.env.OPERATIVE_RVU_API_TOKEN;
const DICTATION_LEGACY_JSON_FALLBACK = process.env.DICTATION_LEGACY_JSON_FALLBACK !== 'off';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1';
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize empty data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ patients: {}, callDays: {}, callDayOrder: [], lastSync: null }, null, 2));
}

// Initialize empty dictations file if it doesn't exist
if (!fs.existsSync(DICTATIONS_FILE)) {
  fs.writeFileSync(DICTATIONS_FILE, JSON.stringify({ dictations: {}, lastSync: null }, null, 2));
}

// Initialize empty messages file if it doesn't exist
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ messages: [] }, null, 2));
}

// Initialize notification delivery ledger if it doesn't exist
if (!fs.existsSync(DELIVERY_FILE)) {
  fs.writeFileSync(DELIVERY_FILE, JSON.stringify({ deliveries: {}, updatedAt: null }, null, 2));
}

// ===============================================
// Message Queue Functions
// ===============================================

/**
 * Load pending messages from file
 */
const loadMessages = () => {
  try {
    const raw = fs.readFileSync(MESSAGES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Messages] Error loading:', e.message);
    return { messages: [] };
  }
};

/**
 * Save messages to file
 */
const saveMessages = (data) => {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));
};

/**
 * Add a message to the pending queue
 */
const queueMessage = (messageId, content, timestamp, meta = {}) => {
  const data = loadMessages();
  // Avoid duplicates
  if (!data.messages.find(m => m.id === messageId)) {
    data.messages.push({
      id: messageId,
      content,
      timestamp,
      createdAt: new Date().toISOString(),
      title: meta.title,
      body: meta.body,
      type: meta.type,
      data: meta.data,
      card: meta.card,
    });
    // Keep only last 50 messages
    if (data.messages.length > 50) {
      data.messages = data.messages.slice(-50);
    }
    saveMessages(data);
    console.log(`[Messages] Queued message ${messageId}`);
  }
};

/**
 * Get all pending messages (not yet acknowledged)
 */
const getPendingMessages = () => {
  const data = loadMessages();
  return data.messages;
};

/**
 * Acknowledge messages by IDs (remove from queue)
 */
const acknowledgeMessages = (messageIds) => {
  const data = loadMessages();
  const before = data.messages.length;
  data.messages = data.messages.filter(m => !messageIds.includes(m.id));
  saveMessages(data);
  for (const id of messageIds) {
    recordDeliveryEvent(id, 'acked', { source: 'app' });
  }
  console.log(`[Messages] Acknowledged ${before - data.messages.length} messages`);
  return before - data.messages.length;
};

// ===============================================
// Notification Delivery Ledger Functions
// ===============================================

const loadDeliveries = () => {
  try {
    const raw = fs.readFileSync(DELIVERY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.deliveries) parsed.deliveries = {};
    return parsed;
  } catch (e) {
    console.error('[Deliveries] Error loading:', e.message);
    return { deliveries: {}, updatedAt: null };
  }
};

const saveDeliveries = (data) => {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(DELIVERY_FILE, JSON.stringify(data, null, 2));
};

const recordDeliveryEvent = (messageId, event, details = {}) => {
  if (!messageId) return;
  const data = loadDeliveries();
  const now = new Date().toISOString();
  const existing = data.deliveries[messageId] || {
    messageId,
    createdAt: now,
    events: [],
    latestStatus: null,
  };
  existing.latestStatus = event;
  existing.updatedAt = now;
  existing.events.push({ event, at: now, ...details });
  if (existing.events.length > 50) {
    existing.events = existing.events.slice(-50);
  }
  data.deliveries[messageId] = existing;
  saveDeliveries(data);
};

const deliveryHasReceipt = (messageId, receiptEvents = ['displayed', 'synced', 'acked']) => {
  const data = loadDeliveries();
  const entry = data.deliveries[messageId];
  if (!entry || !Array.isArray(entry.events)) return false;
  return entry.events.some(e => receiptEvents.includes(e.event));
};

// ===============================================
// Meeting Reply Card Helpers
// ===============================================

const DEFAULT_MEETING_ACCOUNT = process.env.MEETING_REPLY_ACCOUNT || 'aalami@gmail.com';
const DEFAULT_TIME_ZONE = process.env.MEETING_REPLY_TIME_ZONE || 'America/Los_Angeles';
const DEFAULT_MEETING_REPLY_WINDOW_DAYS = Number(process.env.MEETING_REPLY_WINDOW_DAYS || 14);
const DEFAULT_MEETING_REPLY_WORKDAY_START_HOUR = Number(process.env.MEETING_REPLY_WORKDAY_START_HOUR || 8);
const DEFAULT_MEETING_REPLY_WORKDAY_END_HOUR = Number(process.env.MEETING_REPLY_WORKDAY_END_HOUR || 17);

const parseDateInput = (value, fieldName) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid or missing ${fieldName}`);
  }
  return date;
};

const getEventStart = (event) => event?.start?.dateTime || event?.start?.date;
const getEventEnd = (event) => event?.end?.dateTime || event?.end?.date;

const parseAllDayDate = (dateText, timeZone) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText || '');
  if (!match) return null;
  const [, year, month, day] = match;
  return makeDateInTimeZone({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: 0,
  }, timeZone);
};

const eventToBusyBlock = (event, windowStart, windowEnd, timeZone = DEFAULT_TIME_ZONE) => {
  if (!event || event.status === 'cancelled' || event.transparency === 'transparent') {
    return null;
  }

  const startRaw = getEventStart(event);
  const endRaw = getEventEnd(event);
  if (!startRaw || !endRaw) return null;

  const isAllDay = Boolean(event?.start?.date && event?.end?.date);
  const start = isAllDay ? parseAllDayDate(startRaw, timeZone) : new Date(startRaw);
  const end = isAllDay ? parseAllDayDate(endRaw, timeZone) : new Date(endRaw);
  if (!start || !end) return null;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= windowStart || start >= windowEnd) return null;

  return {
    id: event.id,
    title: event.summary || 'Busy',
    start: start.toISOString(),
    end: end.toISOString(),
    location: event.location,
    allDay: isAllDay,
  };
};

const coercePositiveInteger = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const formatDateForCommand = (date) => date.toISOString().slice(0, 10);

const formatTimeRange = (startIso, endIso, timeZone = DEFAULT_TIME_ZONE) => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toLocaleDateString('en-US', { timeZone }) === end.toLocaleDateString('en-US', { timeZone });
  const day = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  });
  const startTime = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
  const endTime = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
  return sameDay ? `${day}, ${startTime}-${endTime}` : `${day}, ${startTime} - ${endTime}`;
};

const formatWindowLabel = (startIso, endIso, timeZone = DEFAULT_TIME_ZONE) => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startDay = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  const endDay = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  if (startDay === endDay) {
    return `${startDay}, ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })}-${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })}`;
  }
  return `${startDay} - ${endDay}`;
};

const zonedDateParts = (date, timeZone = DEFAULT_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

const getTimeZoneOffsetMs = (date, timeZone = DEFAULT_TIME_ZONE) => {
  const parts = zonedDateParts(date, timeZone);
  const utcLike = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return utcLike - date.getTime();
};

const makeDateInTimeZone = ({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = DEFAULT_TIME_ZONE) => {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
};

const dayWindowFor = (date, { timeZone, workdayStartHour, workdayEndHour }) => {
  const parts = zonedDateParts(date, timeZone);
  const weekday = parts.weekday;
  if (weekday === 'Sat' || weekday === 'Sun') return null;

  const base = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
  return {
    start: makeDateInTimeZone({ ...base, hour: workdayStartHour }, timeZone),
    end: makeDateInTimeZone({ ...base, hour: workdayEndHour }, timeZone),
  };
};

const fetchCalendarEvents = ({ account, from, to }) => {
  const output = execFileSync('gog', [
    'calendar',
    'events',
    'primary',
    '--account',
    account,
    '--json',
    '--from',
    formatDateForCommand(from),
    '--to',
    formatDateForCommand(to),
  ], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, PATH: `${process.env.PATH || ''}:/opt/homebrew/bin` },
  });
  const parsed = JSON.parse(output);
  return parsed.events || parsed || [];
};

const findSuggestedSlots = ({
  windowStart,
  windowEnd,
  busyBlocks,
  durationMinutes,
  maxSuggestions,
  timeZone = DEFAULT_TIME_ZONE,
  workdayStartHour = DEFAULT_MEETING_REPLY_WORKDAY_START_HOUR,
  workdayEndHour = DEFAULT_MEETING_REPLY_WORKDAY_END_HOUR,
}) => {
  const durationMs = durationMinutes * 60 * 1000;
  const stepMs = 15 * 60 * 1000;
  const suggestions = [];
  let dayCursor = new Date(windowStart);

  while (dayCursor < windowEnd && suggestions.length < maxSuggestions) {
    const dayWindow = dayWindowFor(dayCursor, { timeZone, workdayStartHour, workdayEndHour });
    if (!dayWindow) {
      dayCursor = addDays(dayCursor, 1);
      continue;
    }

    const slotWindowStart = new Date(Math.max(dayWindow.start.getTime(), windowStart.getTime()));
    const slotWindowEnd = new Date(Math.min(dayWindow.end.getTime(), windowEnd.getTime()));
    let cursor = new Date(Math.ceil(slotWindowStart.getTime() / stepMs) * stepMs);

    while (cursor.getTime() + durationMs <= slotWindowEnd.getTime() && suggestions.length < maxSuggestions) {
      const slotEnd = new Date(cursor.getTime() + durationMs);
      const conflict = busyBlocks.find((block) => {
        const busyStart = new Date(block.start);
        const busyEnd = new Date(block.end);
        return cursor < busyEnd && slotEnd > busyStart;
      });

      if (!conflict) {
        suggestions.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          label: formatTimeRange(cursor.toISOString(), slotEnd.toISOString(), timeZone),
        });
        cursor = new Date(slotEnd.getTime());
      } else {
        cursor = new Date(Math.ceil(new Date(conflict.end).getTime() / stepMs) * stepMs);
      }
    }

    dayCursor = addDays(dayWindow.start, 1);
  }

  return suggestions;
};

const sanitizeText = (value, maxLength = 160) => {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
};

const buildMeetingReplyText = ({ requester, subject, suggestions, durationMinutes, location }) => {
  const greeting = requester ? `Hi ${requester},` : 'Hi,';
  const topic = subject ? ` about ${subject}` : '';
  const place = location ? ` at ${location}` : '';

  if (suggestions.length === 0) {
    return `${greeting}\n\nI checked my calendar and I do not see a clean ${durationMinutes}-minute opening in that window${topic}. Could you send a few alternate times?\n\nBest,\nOliver`;
  }

  const timeList = suggestions.map((slot) => `- ${slot.label}`).join('\n');
  return `${greeting}\n\nI checked my calendar and these times work for me${topic}${place}:\n\n${timeList}\n\nBest,\nOliver`;
};

const buildMeetingReplyCard = ({
  requester,
  subject,
  windowStart,
  windowEnd,
  durationMinutes,
  location,
  suggestions,
  conflicts,
  timeZone,
}) => {
  const replyText = buildMeetingReplyText({ requester, subject, suggestions, durationMinutes, location });
  const conflictSummary = conflicts
    .slice(0, 4)
    .map((block) => `${formatTimeRange(block.start, block.end, timeZone)}: ${block.title}`);
  return {
    type: 'meeting_reply',
    title: subject ? `Meeting reply: ${subject}` : 'Meeting reply options',
    subtitle: suggestions.length > 0
      ? `${suggestions.length} clean option${suggestions.length === 1 ? '' : 's'} found`
      : 'No clean openings found',
    body: replyText,
    actions: [
      { label: 'Copy reply', action: 'copy_reply', style: 'primary' },
    ],
    data: {
      requester,
      subject,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      windowLabel: formatWindowLabel(windowStart.toISOString(), windowEnd.toISOString(), timeZone),
      durationMinutes,
      location,
      suggestions,
      conflicts,
      conflictSummary,
      replyText,
      timeZone,
    },
  };
};

const buildCompactPushCard = (card) => {
  if (!card || card.type !== 'meeting_reply') return card;
  const data = card.data || {};
  return {
    ...card,
    data: {
      requester: data.requester,
      subject: data.subject,
      windowLabel: data.windowLabel,
      durationMinutes: data.durationMinutes,
      location: data.location,
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.slice(0, 6) : [],
      conflictSummary: Array.isArray(data.conflictSummary) ? data.conflictSummary.slice(0, 4) : [],
      replyText: data.replyText,
      timeZone: data.timeZone,
    },
  };
};

// Middleware
app.use(cors());
app.use(['/voice/realtime/session', '/patients/voice/realtime/session'], express.text({
  type: ['application/sdp', 'text/plain'],
  limit: '256kb',
}));
app.use(express.json({ limit: '10mb' }));

// Auth middleware
const authenticate = (req, res, next) => {
  // Skip auth for health checks (both root and /patients/ prefixed)
  if (req.path === '/ping' || req.path === '/health' || 
      req.path === '/patients/ping' || req.path === '/patients/health') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  if (AUTH_TOKEN && token !== AUTH_TOKEN) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  
  next();
};

app.use(authenticate);

// Load current data
const loadData = () => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Sync] Error loading data:', e.message);
    return { patients: {}, callDays: {}, callDayOrder: [], lastSync: null };
  }
};

// Save data
const saveData = (data) => {
  data.lastSync = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// Load dictations data
const loadDictations = () => {
  try {
    const raw = fs.readFileSync(DICTATIONS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Dictations] Error loading data:', e.message);
    return { dictations: {}, lastSync: null };
  }
};

// Save dictations data
const saveDictations = (data) => {
  data.lastSync = new Date().toISOString();
  fs.writeFileSync(DICTATIONS_FILE, JSON.stringify(data, null, 2));
};

const syncDictationsToRvuBackend = async (dictations, requestId) => {
  if (!OPERATIVE_RVU_API_TOKEN) {
    return null;
  }

  const response = await fetch(OPERATIVE_RVU_BACKEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPERATIVE_RVU_API_TOKEN}`,
      'X-Request-Id': requestId || `echo-server-${Date.now()}`,
    },
    body: JSON.stringify({ dictations }),
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`Operative RVU backend failed: ${response.status}`);
    error.statusCode = response.status;
    error.backendBody = body;
    throw error;
  }

  return body;
};

const handleDictationSync = async (req, res) => {
  try {
    const { dictations } = req.body;
    if (!dictations) {
      return res.status(400).json({ error: 'Missing required field: dictations' });
    }

    const requestId = req.get('X-Request-Id') || `echo-sync-${Date.now()}`;
    const dictationCount = Object.keys(dictations).length;
    const backendResult = await syncDictationsToRvuBackend(dictations, requestId);

    if (backendResult) {
      console.log(`[Dictations] Encrypted RVU backend accepted ${dictationCount} finalized dictations`);
      return res.json({
        success: true,
        encryptedBackend: true,
        dictationCount,
        accepted: backendResult.accepted,
        requestId,
        lastSync: new Date().toISOString(),
      });
    }

    if (!DICTATION_LEGACY_JSON_FALLBACK) {
      return res.status(503).json({
        error: 'Operative RVU backend is not configured and plaintext fallback is disabled',
      });
    }

    const data = { dictations, lastSync: new Date().toISOString() };
    saveDictations(data);
    console.warn('[Dictations] OPERATIVE_RVU_API_TOKEN not set; saved dictations to legacy JSON fallback');
    return res.json({
      success: true,
      encryptedBackend: false,
      dictationCount,
      requestId,
      lastSync: data.lastSync,
    });
  } catch (e) {
    console.error('[Dictations] Sync error:', e.message, e.backendBody || '');
    res.status(e.statusCode || 500).json({ error: e.message });
  }
};

const getOperativeReportEmailSubject = () => {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
  return `Operative Report - ${date}`;
};

const runCommandWithInput = (command, args, input, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    env: { ...process.env, PATH: `${process.env.PATH || ''}:/opt/homebrew/bin`, ...(options.env || {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let settled = false;
  const timeoutMs = options.timeout || 45000;
  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    const error = new Error(`${command} timed out after ${timeoutMs / 1000} seconds`);
    error.statusCode = 504;
    error.killed = true;
    if (!settled) {
      settled = true;
      reject(error);
    }
  }, timeoutMs);

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('error', (error) => {
    clearTimeout(timeout);
    if (!settled) {
      settled = true;
      reject(error);
    }
  });
  child.on('close', (code, signal) => {
    clearTimeout(timeout);
    if (settled) return;
    settled = true;
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    const message = stderr.trim() || stdout.trim() || `${command} exited with code ${code || signal}`;
    const error = new Error(message);
    error.code = code;
    error.signal = signal;
    reject(error);
  });

  child.stdin.end(input);
});

const sendOperativeReportEmail = async ({ report, subject }) => {
  const normalizedReport = typeof report === 'string' ? report.trim() : '';
  if (!normalizedReport) {
    const error = new Error('Missing operative report text');
    error.statusCode = 400;
    throw error;
  }

  if (normalizedReport.length > 200000) {
    const error = new Error('Operative report is too large to email');
    error.statusCode = 413;
    throw error;
  }

  const emailSubject = typeof subject === 'string' && subject.trim()
    ? subject.trim()
    : getOperativeReportEmailSubject();

  const args = [
    'gmail',
    'send',
    '--account',
    OPERATIVE_REPORT_ACCOUNT,
    '--to',
    OPERATIVE_REPORT_RECIPIENTS.join(','),
    '--subject',
    emailSubject,
    '--body-file',
    '-',
    '--no-input',
    '--json',
  ];

  const { stdout } = await runCommandWithInput('gog', args, normalizedReport, { timeout: 45000 });

  let messageId = null;
  try {
    const parsed = JSON.parse(stdout);
    messageId = parsed.id || parsed.message?.id || parsed.result?.id || null;
  } catch {
    messageId = stdout.trim() || null;
  }

  return {
    success: true,
    recipients: OPERATIVE_REPORT_RECIPIENTS,
    subject: emailSubject,
    messageId,
    sentAt: new Date().toISOString(),
  };
};

const buildRealtimeSessionConfig = (body = {}) => {
  const model = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : REALTIME_MODEL;
  const voice = typeof body.voice === 'string' && body.voice.trim()
    ? body.voice.trim()
    : REALTIME_VOICE;
  const instructions = typeof body.instructions === 'string' && body.instructions.trim()
    ? body.instructions.trim().slice(0, 8000)
    : 'You are Echo, Oliver Aalami\'s concise, practical voice assistant. Keep spoken replies brief, natural, and useful.';

  return {
    type: 'realtime',
    model,
    instructions,
    audio: {
      output: {
        voice,
      },
    },
    reasoning: {
      effort: 'low',
    },
  };
};

const buildRealtimeClientSecretConfig = (body = {}) => ({
  session: buildRealtimeSessionConfig(body),
});

const createRealtimeClientSecret = async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not configured on the Echo server' });
  }

  const sessionConfig = buildRealtimeClientSecretConfig({
    model: req.query.model || req.body?.model,
    voice: req.query.voice || req.body?.voice,
    instructions: req.query.instructions || req.body?.instructions,
  });

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': 'echo-app-oliver',
      },
      body: JSON.stringify(sessionConfig),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[RealtimeVoice] OpenAI client secret error:', response.status, data);
      return res.status(response.status).json({
        error: 'OpenAI realtime token failed',
        detail: data?.error?.message || JSON.stringify(data).slice(0, 1000),
      });
    }

    res.json(data);
  } catch (e) {
    console.error('[RealtimeVoice] Client secret error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

const createRealtimeSession = async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not configured on the Echo server' });
  }

  const sdp = typeof req.body === 'string' ? req.body.trim() : '';
  if (!sdp || !sdp.startsWith('v=')) {
    return res.status(400).json({ error: 'Missing SDP offer body' });
  }

  const sessionConfig = buildRealtimeSessionConfig({
    model: req.query.model,
    voice: req.query.voice,
    instructions: req.query.instructions,
  });

  const form = new FormData();
  form.set('sdp', sdp);
  form.set('session', JSON.stringify(sessionConfig));

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Safety-Identifier': 'echo-app-oliver',
      },
      body: form,
    });

    const answerSdp = await response.text();
    if (!response.ok) {
      console.error('[RealtimeVoice] OpenAI session error:', response.status, answerSdp);
      return res.status(response.status).json({
        error: 'OpenAI realtime session failed',
        detail: answerSdp.slice(0, 1000),
      });
    }

    res.type('application/sdp').send(answerSdp);
  } catch (e) {
    console.error('[RealtimeVoice] Session create error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

// Health check endpoints (root level for direct access)
app.get('/ping', (req, res) => {
  res.send('pong');
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'echo-patient-sync',
    uptime: process.uptime(),
    dataFile: DATA_FILE
  });
});

// Also serve under /patients/ prefix (for Cloudflare tunnel routing)
app.get('/patients/ping', (req, res) => {
  res.send('pong');
});

app.get('/patients/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'echo-patient-sync',
    uptime: process.uptime(),
    dataFile: DATA_FILE
  });
});

/**
 * POST /voice/realtime/session
 * POST /patients/voice/realtime/session
 * Proxies a client WebRTC SDP offer to OpenAI Realtime and returns the answer SDP.
 */
app.post('/voice/realtime/token', createRealtimeClientSecret);
app.post('/patients/voice/realtime/token', createRealtimeClientSecret);
app.post('/voice/realtime/session', createRealtimeSession);
app.post('/patients/voice/realtime/session', createRealtimeSession);

/**
 * POST /sync
 * Receives full patient state and saves to JSON
 */
app.post('/sync', (req, res) => {
  try {
    const { patients, callDays, callDayOrder } = req.body;
    
    if (!patients || !callDays || !callDayOrder) {
      return res.status(400).json({ error: 'Missing required fields: patients, callDays, callDayOrder' });
    }
    
    const data = {
      patients,
      callDays,
      callDayOrder,
      lastSync: new Date().toISOString()
    };
    
    saveData(data);
    
    const patientCount = Object.keys(patients).length;
    const callDayCount = Object.keys(callDays).length;
    
    console.log(`[Sync] Saved ${patientCount} patients, ${callDayCount} call days`);
    
    res.json({ 
      success: true, 
      patientCount,
      callDayCount,
      lastSync: data.lastSync
    });
  } catch (e) {
    console.error('[Sync] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /patients
 * Returns all patient data
 */
app.get('/patients', (req, res) => {
  try {
    const data = loadData();
    res.json(data);
  } catch (e) {
    console.error('[Patients] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /search?q=<query>
 * Searches patients by name, MRN, room, or chief complaint
 */
app.get('/search', (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase().trim();
    
    if (!query) {
      return res.json({ patients: [], query: '' });
    }
    
    const data = loadData();
    const patients = Object.values(data.patients);
    
    const matches = patients.filter(patient => {
      const name = (patient.name || '').toLowerCase();
      const mrn = (patient.mrn || '').toLowerCase();
      const room = (patient.room || '').toLowerCase();
      const complaint = (patient.chiefComplaint || '').toLowerCase();
      const hospital = (patient.hospital || '').toLowerCase();
      
      return name.includes(query) ||
             mrn.includes(query) ||
             room.includes(query) ||
             complaint.includes(query) ||
             hospital.includes(query);
    });
    
    // Sort by timeSeen (newest first)
    matches.sort((a, b) => new Date(b.timeSeen) - new Date(a.timeSeen));
    
    // Enrich with call day info
    const enrichedMatches = matches.map(patient => {
      const callDay = data.callDays[patient.callDayId];
      return {
        ...patient,
        callDayDate: callDay?.displayDate || 'Unknown',
        callDayDayOfWeek: callDay?.dayOfWeek || ''
      };
    });
    
    res.json({ 
      patients: enrichedMatches, 
      query,
      count: enrichedMatches.length
    });
  } catch (e) {
    console.error('[Search] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /patient/:id
 * Get a specific patient by ID
 */
app.get('/patient/:id', (req, res) => {
  try {
    const data = loadData();
    const patient = data.patients[req.params.id];
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    const callDay = data.callDays[patient.callDayId];
    res.json({
      ...patient,
      callDayDate: callDay?.displayDate || 'Unknown',
      callDayDayOfWeek: callDay?.dayOfWeek || ''
    });
  } catch (e) {
    console.error('[Patient] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===============================================
// Operative Report Dictation Sync (root)
// ===============================================

/**
 * POST /dictations/sync
 * Receives finalized dictations and forwards to encrypted RVU backend when configured.
 */
app.post('/dictations/sync', handleDictationSync);

/**
 * GET /dictations/list
 * Returns all finalized dictations
 */
app.get('/dictations/list', (req, res) => {
  try {
    const data = loadDictations();
    res.json(data);
  } catch (e) {
    console.error('[Dictations] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /dictations/:id
 * Get a specific dictation by ID
 */
app.get('/dictations/:id', (req, res) => {
  try {
    const data = loadDictations();
    const dictation = data.dictations[req.params.id];
    if (!dictation) {
      return res.status(404).json({ error: 'Dictation not found' });
    }
    res.json(dictation);
  } catch (e) {
    console.error('[Dictations] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/dictations/email', async (req, res) => {
  try {
    const result = await sendOperativeReportEmail(req.body || {});
    console.log(`[Dictations] Emailed operative report ${result.messageId || '(no message id)'} to ${result.recipients.join(', ')}`);
    res.json(result);
  } catch (e) {
    const status = e.statusCode || (e.killed || e.signal === 'SIGTERM' ? 504 : 500);
    console.error('[Dictations] Email error:', e.message);
    res.status(status).json({ error: e.message });
  }
});

// ===============================================
// Routes under /patients/ prefix (for Cloudflare tunnel)
// ===============================================

app.post('/patients/sync', (req, res) => {
  try {
    const { patients, callDays, callDayOrder } = req.body;
    if (!patients || !callDays || !callDayOrder) {
      return res.status(400).json({ error: 'Missing required fields: patients, callDays, callDayOrder' });
    }
    const data = { patients, callDays, callDayOrder, lastSync: new Date().toISOString() };
    saveData(data);
    const patientCount = Object.keys(patients).length;
    const callDayCount = Object.keys(callDays).length;
    console.log(`[Sync] Saved ${patientCount} patients, ${callDayCount} call days`);
    res.json({ success: true, patientCount, callDayCount, lastSync: data.lastSync });
  } catch (e) {
    console.error('[Sync] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /patients/dictations/sync
 * Receives finalized dictations and forwards to encrypted RVU backend when configured.
 */
app.post('/patients/dictations/sync', handleDictationSync);

app.get('/patients/dictations/list', (req, res) => {
  try {
    const data = loadDictations();
    res.json(data);
  } catch (e) {
    console.error('[Dictations] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/patients/dictations/:id', (req, res) => {
  try {
    const data = loadDictations();
    const dictation = data.dictations[req.params.id];
    if (!dictation) {
      return res.status(404).json({ error: 'Dictation not found' });
    }
    res.json(dictation);
  } catch (e) {
    console.error('[Dictations] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/patients/dictations/email', async (req, res) => {
  try {
    const result = await sendOperativeReportEmail(req.body || {});
    console.log(`[Dictations] Emailed operative report ${result.messageId || '(no message id)'} to ${result.recipients.join(', ')}`);
    res.json(result);
  } catch (e) {
    const status = e.statusCode || (e.killed || e.signal === 'SIGTERM' ? 504 : 500);
    console.error('[Dictations] Email error:', e.message);
    res.status(status).json({ error: e.message });
  }
});

app.get('/patients/list', (req, res) => {
  try {
    const data = loadData();
    res.json(data);
  } catch (e) {
    console.error('[Patients] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/patients/search', (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase().trim();
    if (!query) {
      return res.json({ patients: [], query: '' });
    }
    const data = loadData();
    const patients = Object.values(data.patients);
    const matches = patients.filter(patient => {
      const name = (patient.name || '').toLowerCase();
      const mrn = (patient.mrn || '').toLowerCase();
      const room = (patient.room || '').toLowerCase();
      const complaint = (patient.chiefComplaint || '').toLowerCase();
      const hospital = (patient.hospital || '').toLowerCase();
      return name.includes(query) || mrn.includes(query) || room.includes(query) || complaint.includes(query) || hospital.includes(query);
    });
    matches.sort((a, b) => new Date(b.timeSeen) - new Date(a.timeSeen));
    const enrichedMatches = matches.map(patient => {
      const callDay = data.callDays[patient.callDayId];
      return { ...patient, callDayDate: callDay?.displayDate || 'Unknown', callDayDayOfWeek: callDay?.dayOfWeek || '' };
    });
    res.json({ patients: enrichedMatches, query, count: enrichedMatches.length });
  } catch (e) {
    console.error('[Search] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Message sync routes under /patients/ prefix (accessible via Cloudflare tunnel)
app.get('/patients/messages/pending', (req, res) => {
  try {
    const messages = getPendingMessages();
    res.json({ messages, count: messages.length });
  } catch (e) {
    console.error('[Messages/Pending] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/patients/messages/ack', (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ error: 'Missing required field: messageIds (array)' });
    }
    const acknowledged = acknowledgeMessages(messageIds);
    res.json({ success: true, acknowledged });
  } catch (e) {
    console.error('[Messages/Ack] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/patients/:id', (req, res) => {
  // Skip if id is a reserved word (handled by other routes)
  if (['ping', 'health', 'sync', 'list', 'search', 'messages', 'dictations'].includes(req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const data = loadData();
    const patient = data.patients[req.params.id];
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    const callDay = data.callDays[patient.callDayId];
    res.json({ ...patient, callDayDate: callDay?.displayDate || 'Unknown', callDayDayOfWeek: callDay?.dayOfWeek || '' });
  } catch (e) {
    console.error('[Patient] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===============================================
// Push Notification Routes
// ===============================================

/**
 * Get all device tokens from Supabase
 */
async function getDeviceTokens() {
  const { data, error } = await supabase
    .from('device_tokens')
    .select('token');
  
  if (error) {
    console.error('[Notify] Error fetching tokens:', error);
    return [];
  }
  
  return data.map(row => row.token);
}

/**
 * Check if a notification has been acknowledged
 */
async function isNotificationAcked(eventId) {
  const { data, error } = await supabase
    .from('notification_acks')
    .select('id')
    .eq('event_id', eventId)
    .single();
  
  return !!data;
}

/**
 * Send push notifications to all registered devices
 */
async function sendPushNotifications(title, body, data = {}) {
  const tokens = await getDeviceTokens();
  
  if (tokens.length === 0) {
    console.log('[Notify] No device tokens registered');
    return { sent: 0, errors: [] };
  }
  
  // Filter valid Expo push tokens
  const validTokens = tokens.filter(token => Expo.isExpoPushToken(token));
  
  if (validTokens.length === 0) {
    console.log('[Notify] No valid Expo push tokens');
    return { sent: 0, errors: ['No valid Expo push tokens'] };
  }
  
  // Build messages
  const messages = validTokens.map(token => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
  }));
  
  // Send in chunks
  const chunks = expo.chunkPushNotifications(messages);
  const results = [];
  const errors = [];
  
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      results.push(...ticketChunk);
      
      // Check for errors in tickets
      ticketChunk.forEach((ticket, index) => {
        if (ticket.status === 'error') {
          errors.push({
            token: chunk[index].to,
            error: ticket.message,
            details: ticket.details,
          });
        }
      });
    } catch (error) {
      console.error('[Notify] Error sending chunk:', error);
      errors.push({ error: error.message });
    }
  }
  
  console.log(`[Notify] Sent ${results.length} notifications, ${errors.length} errors`);
  return { sent: results.length, errors };
}

/**
 * POST /notify
 * Send a generic push notification
 * If data.type === 'message' and data.messageContent exists, also queue for sync
 */
app.post('/notify', async (req, res) => {
  try {
    const { title, body, data } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ error: 'Missing required fields: title, body' });
    }
    
    // Queue ALL notifications as messages for reliable sync
    // The push notification is just a signal; server queue is the source of truth
    if (data) {
      const messageId = data.messageId || `notify-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const messageContent = data.messageContent || body || title;
      const timestamp = data.timestamp || new Date().toISOString();
      
      // Store the generated messageId back in data so the push payload includes it
      data.messageId = messageId;
      data.messageContent = messageContent;
      if (!data.type) data.type = 'message';
      
      queueMessage(messageId, messageContent, timestamp);
    } else {
      // Even with no data object, queue the notification body
      const messageId = `notify-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      queueMessage(messageId, body || title, new Date().toISOString());
      req.body.data = { type: 'message', messageId, messageContent: body || title, timestamp: new Date().toISOString() };
    }
    
    // Cap messageContent in push data to avoid APNs 4KB payload limit
    // Full message is preserved in the server queue for sync
    let pushData = data || {};
    if (pushData.messageContent && pushData.messageContent.length > 2000) {
      pushData = { ...pushData, messageContent: pushData.messageContent.substring(0, 2000) + '\n\n[Full message available in app]' };
    }
    
    const result = await sendPushNotifications(title, body, pushData);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[Notify] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /notify/meeting
 * Send a meeting reminder notification
 * Body: { eventId, title, startTime, location?, minutesBefore? }
 */
app.post('/notify/meeting', async (req, res) => {
  try {
    const { eventId, title, startTime, location, minutesBefore = 15 } = req.body;
    
    if (!eventId || !title) {
      return res.status(400).json({ error: 'Missing required fields: eventId, title' });
    }
    
    // Check if already acknowledged
    const acked = await isNotificationAcked(eventId);
    if (acked) {
      return res.json({ success: true, sent: 0, skipped: 'already_acknowledged' });
    }
    
    const notificationTitle = `📅 ${title}`;
    let notificationBody = `Starting in ${minutesBefore} minutes`;
    if (location) {
      notificationBody += ` • ${location}`;
    }
    
    const data = {
      type: 'meeting',
      eventId,
      title,
      startTime,
      location,
    };
    
    const result = await sendPushNotifications(notificationTitle, notificationBody, data);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[Notify/Meeting] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /notify/message
 * Send a new message notification + queue for sync
 * Body: { message, preview?, sender?, messageId? }
 */
app.post('/notify/message', async (req, res) => {
  try {
    const { message, preview, sender, messageId } = req.body;
    
    const notificationTitle = sender ? `💬 ${sender}` : '💬 New Message';
    // Use preview for notification body (truncated), but pass full message in data
    const notificationBody = preview || (message ? (message.length > 140 ? message.slice(0, 137) + '...' : message) : 'You have a new message from Echo');
    
    // Generate messageId if not provided
    const finalMessageId = messageId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    const data = {
      type: 'message',
      messageId: finalMessageId,
      messageContent: message || preview || '',
      timestamp,
      preview,
      sender,
    };
    
    // Queue message for sync (in case push notification isn't received)
    queueMessage(finalMessageId, message || preview || '', timestamp);
    
    const result = await sendPushNotifications(notificationTitle, notificationBody, data);
    res.json({ success: true, messageId: finalMessageId, ...result });
  } catch (e) {
    console.error('[Notify/Message] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /notify/meeting-reply
 * Build a meeting reply card with conflict-checked suggested times.
 * Body: {
 *   requester?, subject?, windowStart?, windowEnd?, durationMinutes?,
 *   location?, maxSuggestions?, account?, timeZone?, messageId?,
 *   workdayStartHour?, workdayEndHour?,
 *   sendPush? = true
 * }
 */
app.post('/notify/meeting-reply', async (req, res) => {
  try {
    const {
      requester: rawRequester,
      subject: rawSubject,
      windowStart,
      windowEnd,
      durationMinutes = 30,
      location: rawLocation,
      maxSuggestions = 3,
      account = DEFAULT_MEETING_ACCOUNT,
      timeZone = DEFAULT_TIME_ZONE,
      workdayStartHour = DEFAULT_MEETING_REPLY_WORKDAY_START_HOUR,
      workdayEndHour = DEFAULT_MEETING_REPLY_WORKDAY_END_HOUR,
      messageId,
      sendPush = true,
    } = req.body || {};

    const requester = sanitizeText(rawRequester, 80);
    const subject = sanitizeText(rawSubject, 160);
    const location = sanitizeText(rawLocation, 160);
    const now = new Date();
    const parsedWindowStart = windowStart ? parseDateInput(windowStart, 'windowStart') : now;
    const parsedWindowEnd = windowEnd
      ? parseDateInput(windowEnd, 'windowEnd')
      : addDays(parsedWindowStart, DEFAULT_MEETING_REPLY_WINDOW_DAYS);

    if (parsedWindowEnd <= parsedWindowStart) {
      return res.status(400).json({ error: 'windowEnd must be after windowStart' });
    }

    const safeDuration = coercePositiveInteger(durationMinutes, 30, 15, 240);
    const safeMaxSuggestions = coercePositiveInteger(maxSuggestions, 3, 1, 6);
    const safeWorkdayStartHour = coercePositiveInteger(workdayStartHour, DEFAULT_MEETING_REPLY_WORKDAY_START_HOUR, 0, 23);
    const safeWorkdayEndHour = coercePositiveInteger(workdayEndHour, DEFAULT_MEETING_REPLY_WORKDAY_END_HOUR, 1, 24);
    if (safeWorkdayEndHour <= safeWorkdayStartHour) {
      return res.status(400).json({ error: 'workdayEndHour must be after workdayStartHour' });
    }
    const events = fetchCalendarEvents({
      account,
      from: parsedWindowStart,
      to: parsedWindowEnd,
    });
    const busyBlocks = events
      .map((event) => eventToBusyBlock(event, parsedWindowStart, parsedWindowEnd, timeZone))
      .filter(Boolean)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const suggestions = findSuggestedSlots({
      windowStart: parsedWindowStart,
      windowEnd: parsedWindowEnd,
      busyBlocks,
      durationMinutes: safeDuration,
      maxSuggestions: safeMaxSuggestions,
      timeZone,
      workdayStartHour: safeWorkdayStartHour,
      workdayEndHour: safeWorkdayEndHour,
    }).map((slot) => ({
      ...slot,
      label: formatTimeRange(slot.start, slot.end, timeZone),
    }));
    const card = buildMeetingReplyCard({
      requester,
      subject,
      windowStart: parsedWindowStart,
      windowEnd: parsedWindowEnd,
      durationMinutes: safeDuration,
      location,
      suggestions,
      conflicts: busyBlocks,
      timeZone,
    });
    card.data.workdayStartHour = safeWorkdayStartHour;
    card.data.workdayEndHour = safeWorkdayEndHour;
    card.data.calendarAccount = account;

    const finalMessageId = messageId || `meeting-reply-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date().toISOString();
    const messageContent = card.body;
    const title = 'Meeting reply ready';
    const body = suggestions.length > 0
      ? `${suggestions.length} conflict-checked option${suggestions.length === 1 ? '' : 's'} ready`
      : 'No clean openings found in that window';
    const data = {
      type: 'message',
      messageId: finalMessageId,
      messageContent,
      timestamp,
      card: buildCompactPushCard(card),
    };

    queueMessage(finalMessageId, messageContent, timestamp, {
      title,
      body,
      type: 'meeting_reply',
      data,
      card,
    });

    let pushResult = { sent: 0, errors: [] };
    if (sendPush) {
      pushResult = await sendPushNotifications(title, body, data);
    }

    res.json({
      success: true,
      messageId: finalMessageId,
      card,
      suggestions,
      conflicts: busyBlocks,
      ...pushResult,
    });
  } catch (e) {
    console.error('[Notify/MeetingReply] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /notify/brief
 * Send daily brief notification
 * Body: { summary?, meetingCount?, firstMeeting? }
 */
app.post('/notify/brief', async (req, res) => {
  try {
    const { summary, meetingCount, firstMeeting } = req.body;
    
    const notificationTitle = '🌅 Good Morning';
    let notificationBody = summary || 'Your daily brief is ready';
    
    if (meetingCount && firstMeeting) {
      notificationBody = `${meetingCount} meeting${meetingCount > 1 ? 's' : ''} today. First: ${firstMeeting}`;
    }
    
    const data = {
      type: 'brief',
      summary,
      meetingCount,
      firstMeeting,
    };
    
    const result = await sendPushNotifications(notificationTitle, notificationBody, data);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[Notify/Brief] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /notify/tokens
 * Get count of registered device tokens (for debugging)
 */
app.get('/notify/tokens', async (req, res) => {
  try {
    const tokens = await getDeviceTokens();
    res.json({ count: tokens.length });
  } catch (e) {
    console.error('[Notify/Tokens] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===============================================
// Message Sync Routes (for app to fetch missed messages)
// ===============================================

/**
 * GET /messages/pending
 * Get all pending messages that haven't been acknowledged
 * App should call this on launch/foreground to sync missed messages
 */
app.get('/messages/pending', (req, res) => {
  try {
    const messages = getPendingMessages();
    res.json({ 
      messages,
      count: messages.length,
    });
  } catch (e) {
    console.error('[Messages/Pending] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /messages/ack
 * Acknowledge messages by IDs (removes them from pending queue)
 * Body: { messageIds: string[] }
 */
app.post('/messages/ack', (req, res) => {
  try {
    const { messageIds } = req.body;
    
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ error: 'Missing required field: messageIds (array)' });
    }
    
    const acknowledged = acknowledgeMessages(messageIds);
    res.json({ 
      success: true, 
      acknowledged,
    });
  } catch (e) {
    console.error('[Messages/Ack] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[Echo Server] Running on port ${PORT}`);
  console.log(`[Echo Server] Data file: ${DATA_FILE}`);
  console.log(`[Echo Server] Auth: ${AUTH_TOKEN ? 'enabled' : 'disabled (no token set)'}`);
  console.log(`[Echo Server] Supabase: ${SUPABASE_URL}`);
});
