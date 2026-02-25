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
const MESSAGES_FILE = path.join(DATA_DIR, 'pending-messages.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize empty data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ patients: {}, callDays: {}, callDayOrder: [], lastSync: null }, null, 2));
}

// Initialize empty messages file if it doesn't exist
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ messages: [] }, null, 2));
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
const queueMessage = (messageId, content, timestamp) => {
  const data = loadMessages();
  // Avoid duplicates
  if (!data.messages.find(m => m.id === messageId)) {
    data.messages.push({
      id: messageId,
      content,
      timestamp,
      createdAt: new Date().toISOString(),
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
  console.log(`[Messages] Acknowledged ${before - data.messages.length} messages`);
  return before - data.messages.length;
};

// Middleware
app.use(cors());
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
  if (['ping', 'health', 'sync', 'list', 'search', 'messages'].includes(req.params.id)) {
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
