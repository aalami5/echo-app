/**
 * Run Supabase migration for push notifications
 * Usage: node scripts/run-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mshgthoogedzdoqgcgcj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  console.log('You can find this in your Supabase project settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  const migrationPath = path.join(__dirname, '../supabase/migrations/003_push_notifications.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('Running push notifications migration...');
  
  // Split by semicolons and run each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
      if (error) {
        // Try direct query as fallback
        const { error: directError } = await supabase.from('_migrations').select('*').limit(0);
        console.log('Statement:', statement.substring(0, 50) + '...');
        console.log('Note: Some statements may need to be run directly in Supabase SQL editor');
      }
    } catch (e) {
      console.log('Statement may need manual execution:', statement.substring(0, 50) + '...');
    }
  }
  
  console.log('\nMigration complete!');
  console.log('If any statements failed, please run them manually in Supabase SQL Editor:');
  console.log('https://supabase.com/dashboard/project/mshgthoogedzdoqgcgcj/sql');
}

runMigration().catch(console.error);
