const { Client } = require('pg');
const c = new Client({
  host: 'localhost',
  port: 5432,
  user: 'usef',
  password: 'usef',
  database: 'stocksavvy',
});
(async () => {
  await c.connect();
  const r = await c.query(
    'INSERT INTO vendor_catalog_entries ("vendorId", "skuId", price, "leadTimeDays") VALUES ($1, $2, $3, $4) RETURNING *',
    ['b22a9fd4-819c-476f-b5f3-e95c9799d6ad', '9cc04551-ade4-4073-a04e-b5c0ae20f993', 12.50, 7]
  );
  console.log('Created:', r.rows[0]);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
