import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { readFileSync } from 'node:fs';
const port = process.env.PORT || 3001;

let databaseConfig;

if (process.env.DB_PASSWORD_FILE) {
  databaseConfig = {
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'evaluation',
    user: process.env.DB_USER || 'postgres',
    password: readFileSync(process.env.DB_PASSWORD_FILE, 'utf8').trim(),
  };
} else if (process.env.DATABASE_URL) {
  databaseConfig = {
    connectionString: process.env.DATABASE_URL,
  };
} else {
  console.error('Configure DB_PASSWORD_FILE ou DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool(databaseConfig);

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch (error) {
    console.error('Healthcheck failed:', error.message);
    res.status(503).json({ status: 'error', database: 'down' });
  }
});

app.get('/api/instruction', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instructions ORDER BY id ASC LIMIT 1');

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No instruction found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

const server = app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});

// Arrêt propre : `docker stop` envoie SIGTERM, Ctrl+C envoie SIGINT
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
