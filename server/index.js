/**
 * Echo Patient Sync Server
 * 
 * Simple Express server for patient data sync and search.
 * - POST /sync - receives full patient list, saves to JSON
 * - GET /search?q=<query> - searches patients by name, MRN, room, complaint
 * - GET /patients - returns all patients
 * 
 * Uses same auth token as OpenClaw gateway for security.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 18790;

// Auth token (same as OpenClaw gateway)
const AUTH_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.AUTH_TOKEN;

// Data file path
const DATA_DIR = process.env.DATA_DIR || path.join(process.env.HOME, '.openclaw/workspace/data');
const DATA_FILE = path.join(DATA_DIR, 'patients.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize empty data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ patients: {}, callDays: {}, callDayOrder: [], lastSync: null }, null, 2));
}

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

app.get('/patients/:id', (req, res) => {
  // Skip if id is a reserved word (handled by other routes)
  if (['ping', 'health', 'sync', 'list', 'search'].includes(req.params.id)) {
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

// Start server
app.listen(PORT, () => {
  console.log(`[Echo Patient Sync] Server running on port ${PORT}`);
  console.log(`[Echo Patient Sync] Data file: ${DATA_FILE}`);
  console.log(`[Echo Patient Sync] Auth: ${AUTH_TOKEN ? 'enabled' : 'disabled (no token set)'}`);
});
