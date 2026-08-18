import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { Tenant } from '../tenants/entities/tenant.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Sku } from '../sku/entities/sku.entity';
import { Warehouse, WarehouseStatus } from '../warehouses/entities/warehouse.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { StockLevel } from '../inventory/stock-levels/entities/stock-level.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrderLineItem } from '../purchase-orders/entities/purchase-order-line-item.entity';
import { StockMovement } from '../inventory/stock-movements/entities/stock-movement.entity';
import { MovementReason } from '../inventory/stock-movements/enums/movement-reason.enum';

async function bootstrap() {
  console.log('Starting seed script...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('Clearing existing data...');
  await dataSource.getRepository(StockMovement).createQueryBuilder().delete().execute();
  await dataSource.getRepository(StockLevel).createQueryBuilder().delete().execute();
  await dataSource.getRepository(PurchaseOrderLineItem).createQueryBuilder().delete().execute();
  await dataSource.getRepository(PurchaseOrder).createQueryBuilder().delete().execute();
  await dataSource.getRepository(Vendor).createQueryBuilder().delete().execute();
  await dataSource.getRepository(Sku).createQueryBuilder().delete().execute();
  await dataSource.getRepository(Category).createQueryBuilder().delete().execute();
  await dataSource.getRepository(User).createQueryBuilder().delete().execute();
  await dataSource.getRepository(Warehouse).createQueryBuilder().delete().execute();
  await dataSource.getRepository(Tenant).createQueryBuilder().delete().execute();

  console.log('Creating Tenant...');
  const tenantRepo = dataSource.getRepository(Tenant);
  const tenant = tenantRepo.create({
    name: 'Acme Corp',
  });
  await tenantRepo.save(tenant);

  console.log('Creating Warehouses...');
  const warehouseRepo = dataSource.getRepository(Warehouse);
  const w1 = warehouseRepo.create({ name: 'Main Hub', location: '123 Main St', isMain: true, status: WarehouseStatus.ACTIVE, tenantId: tenant.id, capacityUnits: 1200 });
  const w2 = warehouseRepo.create({ name: 'East Branch', location: '456 East Ave', isMain: false, status: WarehouseStatus.ACTIVE, tenantId: tenant.id, capacityUnits: 800 });
  await warehouseRepo.save([w1, w2]);

  console.log('Creating Users...');
  const userRepo = dataSource.getRepository(User);
  const createUsr = (name: string, email: string, username: string, role: UserRole, whId: string | null) => 
    userRepo.create({ name, email, username, passwordHash: 'Password123!', role, tenantId: tenant.id, warehouseId: whId, isActive: true });

  const users = [
    createUsr('Owner User', 'owner@acme.com', 'owner', UserRole.TENANT, null),
    createUsr('Warehouse Manager', 'manager@acme.com', 'manager', UserRole.WAREHOUSE_MANAGER, w1.id),
    createUsr('Inventory Clerk', 'clerk@acme.com', 'clerk', UserRole.CLERK, w1.id),
  ];
  await userRepo.save(users);

  console.log('Creating Categories...');
  const catRepo = dataSource.getRepository(Category);
  const catElectronics = catRepo.create({ name: 'Electronics', description: 'Gadgets and hardware', tenantId: tenant.id });
  const catFurniture = catRepo.create({ name: 'Furniture', description: 'Office and home furniture', tenantId: tenant.id });
  await catRepo.save([catElectronics, catFurniture]);

  console.log('Creating Vendors...');
  const vendorRepo = dataSource.getRepository(Vendor);
  const v1 = vendorRepo.create({ name: 'TechCorp Suppliers', contactEmail: 'sales@techcorp.com', contactPhone: '555-1234', tenantId: tenant.id });
  const v2 = vendorRepo.create({ name: 'WoodWorks Inc', contactEmail: 'contact@woodworks.com', contactPhone: '555-5678', tenantId: tenant.id });
  await vendorRepo.save([v1, v2]);

  console.log('Creating SKUs...');
  const skuRepo = dataSource.getRepository(Sku);
  const s1 = skuRepo.create({ 
    name: 'ThinkPad T14', sku: 'ELEC-LPT-T14', categoryId: catElectronics.id, tenantId: tenant.id, price: 1200, cost: 900, preferredVendorId: v1.id
  });
  const s2 = skuRepo.create({ 
    name: 'Wireless Mouse', sku: 'ELEC-MOU-01', categoryId: catElectronics.id, tenantId: tenant.id, price: 40, cost: 20, preferredVendorId: v1.id
  });
  const s3 = skuRepo.create({ 
    name: 'Ergonomic Chair', sku: 'FURN-CHR-01', categoryId: catFurniture.id, tenantId: tenant.id, price: 250, cost: 120, preferredVendorId: v2.id
  });
  await skuRepo.save([s1, s2, s3]);

  console.log('Creating Initial Stock Levels...');
  const stockRepo = dataSource.getRepository(StockLevel);
  await stockRepo.save([
    stockRepo.create({ tenantId: tenant.id, warehouseId: w1.id, skuId: s1.id, quantity: 15 }),
    stockRepo.create({ tenantId: tenant.id, warehouseId: w1.id, skuId: s2.id, quantity: 100 }),
    stockRepo.create({ tenantId: tenant.id, warehouseId: w2.id, skuId: s3.id, quantity: 40 }),
  ]);

  console.log('Creating Purchase Orders...');
  const poRepo = dataSource.getRepository(PurchaseOrder);
  const poItemRepo = dataSource.getRepository(PurchaseOrderLineItem);

  // 1. Draft PO
  const po1 = poRepo.create({ tenantId: tenant.id, warehouseId: w1.id, vendorId: v1.id, status: 'draft', createdBy: users[3].id });
  await poRepo.save(po1);
  await poItemRepo.save(poItemRepo.create({ purchaseOrder: po1, skuId: s1.id, quantity: 5, unitPrice: 1100 }));

  // 2. Approved PO
  const po2 = poRepo.create({ tenantId: tenant.id, warehouseId: w2.id, vendorId: v2.id, status: 'approved', createdBy: users[3].id });
  await poRepo.save(po2);
  await poItemRepo.save(poItemRepo.create({ purchaseOrder: po2, skuId: s3.id, quantity: 20, unitPrice: 200 }));

  // 3. Received PO
  const po3 = poRepo.create({ tenantId: tenant.id, warehouseId: w1.id, vendorId: v1.id, status: 'received', createdBy: users[2].id });
  await poRepo.save(po3);
  await poItemRepo.save([
    poItemRepo.create({ purchaseOrder: po3, skuId: s2.id, quantity: 50, unitPrice: 35 }),
  ]);

  console.log('Creating Stock Movements for Dashboard...');
  const movementRepo = dataSource.getRepository(StockMovement);
  
  const m1 = movementRepo.create({
    tenantId: tenant.id,
    skuId: s1.id,
    warehouseId: w1.id,
    reason: MovementReason.MANUAL_ADJUSTMENT,
    quantityChange: 15,
    balanceAfter: 15,
    performedByUserId: users[3].id,
    note: 'Initial stock load',
    idempotencyKey: 'seed-init-s1',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  });

  const m2 = movementRepo.create({
    tenantId: tenant.id,
    skuId: s2.id,
    warehouseId: w1.id,
    reason: MovementReason.PURCHASE_ORDER_RECEIPT,
    quantityChange: 50,
    balanceAfter: 150,
    referenceType: 'purchase_order',
    referenceId: po3.id,
    performedByUserId: users[2].id,
    note: 'System Auto',
    idempotencyKey: `po-receive-${po3.id}-${s2.id}`,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  });

  const m3 = movementRepo.create({
    tenantId: tenant.id,
    skuId: s1.id,
    warehouseId: w1.id,
    reason: MovementReason.SALE,
    quantityChange: -2,
    balanceAfter: 13,
    performedByUserId: users[3].id,
    note: 'Dispatched for Sales Order #1002',
    idempotencyKey: 'seed-sale-1',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
  });

  const m4 = movementRepo.create({
    tenantId: tenant.id,
    skuId: s3.id,
    warehouseId: w2.id,
    reason: MovementReason.TRANSFER_OUT,
    quantityChange: -10,
    balanceAfter: 30,
    performedByUserId: users[2].id,
    note: 'Transfer to Main Hub',
    idempotencyKey: 'seed-transfer-out-1',
  });

  const m5_adjustment = movementRepo.create({
    tenantId: tenant.id,
    skuId: s1.id,
    warehouseId: w1.id,
    reason: MovementReason.MANUAL_ADJUSTMENT,
    quantityChange: -10,
    balanceAfter: 3,
    performedByUserId: users[3].id,
    note: 'Unexplained shrinkage - manual adjustment',
    idempotencyKey: 'seed-adjustment-1',
    createdAt: new Date()
  });

  await movementRepo.save([m1, m2, m3, m4, m5_adjustment]);

  console.log('Seeding completed successfully!');
  await app.close();
}

bootstrap().catch((err) => {
  console.error('Seeding failed!', err);
  process.exit(1);
});
