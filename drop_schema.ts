import { Client } from 'pg';

async function dropSchema() {
  const client = new Client({
    user: 'usef',
    password: 'usef',
    host: 'localhost',
    port: 5432,
    database: 'stocksavvy'
  });

  await client.connect();
  console.log('Connected to pg.');

  await client.query('DROP SCHEMA public CASCADE;');
  await client.query('CREATE SCHEMA public;');
  await client.query('GRANT ALL ON SCHEMA public TO postgres;');
  await client.query('GRANT ALL ON SCHEMA public TO public;');

  console.log('Schema dropped and recreated.');
  await client.end();
}

dropSchema().catch(console.error);
