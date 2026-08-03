const API_URL = 'http://localhost:3000';
const PASSWORD = 'Password123!';

async function run() {
  try {
    console.log('--- Logging in as tenant1@example.com ---');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailOrUsername: 'tenant1@example.com',
        password: PASSWORD,
      })
    });
    
    const loginDataObj = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginDataObj)}`);
    const loginData = loginDataObj.data;
    const token = loginData.access_token;
    console.log('Login successful.');

    console.log('\n--- Creating extra warehouse ---');
    const whRes = await fetch(`${API_URL}/warehouses`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Tenant 1 Secondary Warehouse',
        location: 'Downtown Facility'
      })
    });
    
    const whDataObj = await whRes.json();
    if (!whRes.ok) throw new Error(`Warehouse creation failed: ${JSON.stringify(whDataObj)}`);
    const newWarehouseId = whDataObj.data.id;
    console.log('Warehouse created. ID:', newWarehouseId);

    console.log('\n--- Creating extra manager ---');
    const mgrRes = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Manager Three',
        email: 'manager3@example.com',
        username: 'manager3',
        password: PASSWORD,
        role: 'warehouse_manager',
        warehouseId: newWarehouseId
      })
    });
    
    const mgrDataObj = await mgrRes.json();
    if (!mgrRes.ok) throw new Error(`Manager creation failed: ${JSON.stringify(mgrDataObj)}`);
    console.log('Manager created:', mgrDataObj.data.email);

    console.log('\n--- Success ---');
    console.log('Extra Manager: manager3@example.com / Password123!');
    console.log('Assigned to Warehouse:', whDataObj.data.name);

  } catch (err) {
    console.error(err);
  }
}

run();
