import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envFilePath = path.resolve(process.cwd(), '.env.local');

if (!fs.existsSync(envFilePath)) {
  console.error('[Error] File .env.local tidak ditemukan.');
  process.exit(1);
}

const envFile = fs.readFileSync(envFilePath, 'utf8');
const envMap = {};

envFile.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^\s*([^=:]+?)\s*=\s*(.*?)\s*$/);
  if (!match) return;
  const key = match[1];
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  envMap[key] = value;
});

const supabaseUrl = envMap.VITE_SUPABASE_URL || envMap.SUPABASE_URL;
const supabaseAnonKey = envMap.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Error] VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY wajib tersedia di .env.local.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const tableName = process.argv[2] || 'nodes';
const outputFile = process.argv[3] || path.join('scratch', `${tableName}-backup.csv`);
const pageSize = 1000;

const normalizeValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const escapeCsv = (value) => {
  const stringValue = normalizeValue(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const fetchAllRows = async (table) => {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select('*').range(from, from + pageSize - 1);

    if (table === 'nodes') {
      query = query.order('id', { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
};

const buildColumns = (rows) => {
  const columns = new Set();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => columns.add(key));
  });

  const ordered = Array.from(columns);
  ordered.sort((a, b) => {
    if (a === 'id') return -1;
    if (b === 'id') return 1;
    return a.localeCompare(b);
  });
  return ordered;
};

const writeCsv = (rows, columns, filePath) => {
  const outputDir = path.dirname(filePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lines = [columns.join(',')];
  rows.forEach((row) => {
    lines.push(columns.map((column) => escapeCsv(row[column])).join(','));
  });

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
};

const run = async () => {
  try {
    console.log(`Mengunduh data dari tabel "${tableName}"...`);
    const rows = await fetchAllRows(tableName);
    const columns = buildColumns(rows);
    writeCsv(rows, columns, outputFile);
    console.log(`Selesai. ${rows.length} baris disimpan ke ${outputFile}`);
  } catch (error) {
    console.error('[Gagal] Export CSV gagal:', error.message || error);
    process.exit(1);
  }
};

run();
