import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../src/users/entities/user.entity';
import { Tenant } from '../src/tenants/entities/tenant.entity';
import { Warehouse, WarehouseStatus } from '../src/warehouses/entities/warehouse.entity';
import { Category } from '../src/categories/entities/category.entity';
import { Sku } from '../src/sku/entities/sku.entity';
import { StockLevel } from '../src/inventory/stock-levels/entities/stock-level.entity';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  // Create Tenant
  const tenantRepo = dataSource.getRepository(Tenant);
  let tenant = await tenantRepo.findOne({ where: { name: 'Test Tenant' } });
  if (!tenant) {
    tenant = tenantRepo.create({ name: 'Test Tenant' });
    await tenantRepo.save(tenant);
  }

  // Create Tenant Owner
  const userRepo = dataSource.getRepository(User);
  let owner = await userRepo.findOne({ where: { email: 'tenant@example.com' } });
  if (!owner) {
    owner = userRepo.create({
      name: 'Test Tenant',
      email: 'tenant@example.com',
      username: 'tenant',
      passwordHash: 'Password@123',
      role: UserRole.TENANT_OWNER,
      tenantId: tenant.id,
    });
    await userRepo.save(owner);
  } else {
    owner.passwordHash = 'Password@123';
    owner.tenantId = tenant.id;
    await userRepo.save(owner);
  }

  // Create Warehouse
  const warehouseRepo = dataSource.getRepository(Warehouse);
  let warehouse = await warehouseRepo.findOne({ where: { name: 'Test Warehouse' } });
  if (!warehouse) {
    warehouse = warehouseRepo.create({
      name: 'Test Warehouse',
      location: '123 Test St',
      status: WarehouseStatus.ACTIVE,
      tenantId: tenant.id,
      isMain: true,
    });
    await warehouseRepo.save(warehouse);
  }

  // Create Warehouse Manager
  let manager = await userRepo.findOne({ where: { email: 'manager@example.com' } });
  if (!manager) {
    manager = userRepo.create({
      name: 'Test Manager',
      email: 'manager@example.com',
      username: 'manager',
      passwordHash: 'Password@123',
      role: UserRole.WAREHOUSE_MANAGER,
      warehouseId: warehouse.id,
      tenantId: tenant.id,
    });
    await userRepo.save(manager);
  } else {
    manager.warehouseId = warehouse.id;
    manager.tenantId = tenant.id;
    manager.passwordHash = 'Password@123';
    await userRepo.save(manager);
  }

  // Create Category
  const categoryRepo = dataSource.getRepository(Category);
  let category = await categoryRepo.findOne({ where: { name: 'Test Category' } });
  if (!category) {
    category = categoryRepo.create({ name: 'Test Category', tenantId: tenant.id });
    await categoryRepo.save(category);
  }

  // Create SKU
  const skuRepo = dataSource.getRepository(Sku);
  let sku = await skuRepo.findOne({ where: { sku: 'TEST-SKU-1' } });
  if (!sku) {
    sku = skuRepo.create({
      name: 'Test Low Stock Product',
      sku: 'TEST-SKU-1',
      categoryId: category.id,
      price: 15,
      cost: 10,
      tenantId: tenant.id,
    });
    await skuRepo.save(sku);
  }

  // Create Stock Level
  const stockLevelRepo = dataSource.getRepository(StockLevel);
  let stockLevel = await stockLevelRepo.findOne({ where: { skuId: sku.id, warehouseId: warehouse.id } });
  if (!stockLevel) {
    stockLevel = stockLevelRepo.create({
      skuId: sku.id,
      warehouseId: warehouse.id,
      quantity: 5,
      reorderThreshold: 10,
      safetyStock: 2,
      tenantId: tenant.id,
    });
    await stockLevelRepo.save(stockLevel);
  } else {
      stockLevel.quantity = 5;
      stockLevel.reorderThreshold = 10;
      await stockLevelRepo.save(stockLevel);
  }

  console.log('Seed completed successfully');
  console.log(`Tenant Owner: ${owner.email} (password: Password@123)`);
  console.log(`Manager: ${manager.email} (password: Password@123)`);
  console.log(`Warehouse: ${warehouse.name}`);
  console.log(`Low stock product: ${sku.name} (Qty: 5, Threshold: 10)`);

  await app.close();
}
bootstrap();
