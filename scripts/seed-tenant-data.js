import fetch from 'node-fetch'; // if we can't use global fetch, we'll use http module or native fetch if Node 18+

const API_URL = 'http://localhost:3000';
const PASSWORD = 'Password123!';

async function seed() {
  try {
    console.log('--- Seeding Tenant 1 ---');
    // 1. Register Tenant 1
    const t1Res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tenant One',
        email: 'tenant1@example.com',
        username: 'tenant1',
        password: PASSWORD,
        role: 'tenant_owner',
        warehouseName: 'Tenant 1 HQ'
      })
    });
    const t1DataObj = await t1Res.json();
    if (!t1Res.ok) throw new Error(`T1 Register Error: ${JSON.stringify(t1DataObj)}`);
    const t1Data = t1DataObj.data;
    console.log('Tenant 1 Registered:', t1Data.user.email);
    const t1Token = t1Data.access_token;
    const t1WarehouseId = t1Data.user.warehouseId;

    // 2. Create Warehouse Manager for Tenant 1
    const t1MgrRes = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t1Token}`
      },
      body: JSON.stringify({
        name: 'Manager One',
        email: 'manager1@example.com',
        username: 'manager1',
        password: PASSWORD,
        role: 'warehouse_manager',
        warehouseId: t1WarehouseId
      })
    });
    const t1MgrData = await t1MgrRes.json();
    if (!t1MgrRes.ok) throw new Error(`T1 Manager Error: ${JSON.stringify(t1MgrData)}`);
    console.log('Tenant 1 Manager created:', t1MgrData.data?.email || t1MgrData.email);

    // 3. Create Category & SKU for Tenant 1
    const t1CatRes = await fetch(`${API_URL}/categories`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t1Token}`
      },
      body: JSON.stringify({ name: 'Electronics', description: 'Gadgets' })
    });
    const t1CatData = await t1CatRes.json();
    if (!t1CatRes.ok) throw new Error(`T1 Category Error: ${JSON.stringify(t1CatData)}`);
    
    const t1SkuRes = await fetch(`${API_URL}/sku`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t1Token}`
      },
      body: JSON.stringify({ sku: 'T1-SKU-001', name: 'Smartphone', categoryId: t1CatData.data.id, cost: 300, price: 600 })
    });
    const t1SkuData = await t1SkuRes.json();
    if (!t1SkuRes.ok) throw new Error(`T1 SKU Error: ${JSON.stringify(t1SkuData)}`);
    console.log('Tenant 1 SKU created:', t1SkuData.data?.sku);


    console.log('\n--- Seeding Tenant 2 ---');
    // 1. Register Tenant 2
    const t2Res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tenant Two',
        email: 'tenant2@example.com',
        username: 'tenant2',
        password: PASSWORD,
        role: 'tenant_owner',
        warehouseName: 'Tenant 2 Branch'
      })
    });
    const t2DataObj = await t2Res.json();
    if (!t2Res.ok) throw new Error(`T2 Register Error: ${JSON.stringify(t2DataObj)}`);
    const t2Data = t2DataObj.data;
    console.log('Tenant 2 Registered:', t2Data.user.email);
    const t2Token = t2Data.access_token;
    const t2WarehouseId = t2Data.user.warehouseId;

    // 2. Create Warehouse Manager for Tenant 2
    const t2MgrRes = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t2Token}`
      },
      body: JSON.stringify({
        name: 'Manager Two',
        email: 'manager2@example.com',
        username: 'manager2',
        password: PASSWORD,
        role: 'warehouse_manager',
        warehouseId: t2WarehouseId
      })
    });
    const t2MgrData = await t2MgrRes.json();
    if (!t2MgrRes.ok) throw new Error(`T2 Manager Error: ${JSON.stringify(t2MgrData)}`);
    console.log('Tenant 2 Manager created:', t2MgrData.data?.email || t2MgrData.email);

    // 3. Create Category & SKU for Tenant 2
    const t2CatRes = await fetch(`${API_URL}/categories`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t2Token}`
      },
      body: JSON.stringify({ name: 'Furniture', description: 'Office Desks' })
    });
    const t2CatData = await t2CatRes.json();
    if (!t2CatRes.ok) throw new Error(`T2 Category Error: ${JSON.stringify(t2CatData)}`);
    
    const t2SkuRes = await fetch(`${API_URL}/sku`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t2Token}`
      },
      body: JSON.stringify({ sku: 'T2-SKU-100', name: 'Office Chair', categoryId: t2CatData.data.id, cost: 50, price: 150 })
    });
    const t2SkuData = await t2SkuRes.json();
    if (!t2SkuRes.ok) throw new Error(`T2 SKU Error: ${JSON.stringify(t2SkuData)}`);
    console.log('Tenant 2 SKU created:', t2SkuData.data?.sku);

    console.log('\n--- Seeding Complete ---');
    console.log('Tenant 1 Owner: tenant1@example.com / Password123!');
    console.log('Tenant 1 Mgr: manager1@example.com / Password123!');
    console.log('Tenant 2 Owner: tenant2@example.com / Password123!');
    console.log('Tenant 2 Mgr: manager2@example.com / Password123!');

  } catch (e) {
    console.error('Seeding failed:', e.message);
  }
}

seed();
