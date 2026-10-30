/* eslint-disable @typescript-eslint/no-require-imports */
// Western Peak / Doug — database backup (read-only).
//
// Connects to Supabase Postgres, reads every table in the public schema, and
// writes each one to JSON and CSV in a timestamped folder on this computer.
// It runs SELECT only. It never writes to the database.
//
// Usage (PowerShell or cmd, from the Doug.v2 folder):
//   npm install pg
//   node scripts/backup.js "postgresql://postgres.xxxx:PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
//
// The connection string comes from Supabase → Project Settings → Database →
// Connection string → URI. Use the "Session" pooler (port 5432) or direct.
// Output: backups/YYYY-MM-DD_HHMM/<table>.json and <table>.csv plus _summary.txt

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const url = process.argv[2]
if (!url) { console.error('Pass the connection string as the only argument.'); process.exit(1) }

function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 0 })
  await client.connect()
  // Belt and braces: make this session incapable of writing even by accident.
  await client.query('SET default_transaction_read_only = on')

  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
  const outDir = path.join(__dirname, '..', 'backups', stamp)
  fs.mkdirSync(outDir, { recursive: true })

  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`)

  const summary = []
  for (const { table_name } of tables) {
    const { rows } = await client.query(`select * from public."${table_name}"`)
    fs.writeFileSync(path.join(outDir, table_name + '.json'), JSON.stringify(rows, null, 1))
    if (rows.length) {
      const cols = Object.keys(rows[0])
      const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => csvCell(r[c])).join(','))).join('\n')
      fs.writeFileSync(path.join(outDir, table_name + '.csv'), csv)
    }
    summary.push(`${table_name.padEnd(36)} ${String(rows.length).padStart(7)} rows`)
    console.log(summary[summary.length - 1])
  }

  // Schema too, so the structure can be rebuilt if it ever has to be.
  const { rows: cols } = await client.query(
    `select table_name, column_name, data_type, is_nullable, column_default
     from information_schema.columns where table_schema = 'public'
     order by table_name, ordinal_position`)
  fs.writeFileSync(path.join(outDir, '_schema.json'), JSON.stringify(cols, null, 1))

  fs.writeFileSync(path.join(outDir, '_summary.txt'),
    `Doug backup ${stamp}\n${tables.length} tables\n\n` + summary.join('\n') + '\n')
  await client.end()
  console.log(`\nDone. ${tables.length} tables written to ${outDir}`)
})().catch(e => { console.error('Backup failed:', e.message); process.exit(1) })
