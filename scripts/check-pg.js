import { Client } from 'pg';

async function run() {
  const client = new Client({
    user: 'usef',
    host: 'localhost',
    database: 'stocksavvy',
    password: 'usef',
    port: 5432,
  });

  await client.connect();
  const res = await client.query("SELECT email, password_hash FROM users WHERE email = 'tenant1@example.com'");
  console.log('Result:', res.rows);
  await client.end();
}

run();
