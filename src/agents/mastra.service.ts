import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { StockMovement } from '../inventory/stock-movements/entities/stock-movement.entity';
import { StockLevel } from '../inventory/stock-levels/entities/stock-level.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { AnomalyFlag } from './entities/anomaly-flag.entity';

@Injectable()
export class MastraService {
  private mastra: Mastra | null = null;
  private readonly logger = new Logger(MastraService.name);
  
  public anomalyAgent: Agent | null = null;
  public forecastingAgent: Agent | null = null;
  public reorderAgent: Agent | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.initializeMastra();
  }

  private initializeMastra() {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY is not set. Mastra agents will be unavailable.');
      return;
    }

    // 1. Define Tools
    const fetchRecentMovementsTool = createTool({
      id: 'fetchRecentMovements',
      description: 'Fetch the last 7 days of stock movements across all SKUs.',
      inputSchema: z.object({}),
      execute: async () => {
        const repo = this.dataSource.getRepository(StockMovement);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        return await repo.createQueryBuilder('m')
          .where('m.createdAt >= :date', { date: sevenDaysAgo })
          .orderBy('m.createdAt', 'DESC')
          .getMany();
      }
    });

    const createAnomalyFlagTool = createTool({
      id: 'createAnomalyFlag',
      description: 'Create an anomaly flag for human review when suspicious stock movements are found.',
      inputSchema: z.object({
        skuId: z.string().uuid(),
        description: z.string(),
      }),
      execute: async ({ context }) => {
        const repo = this.dataSource.getRepository(AnomalyFlag);
        const flag = repo.create({
          skuId: context.skuId,
          description: context.description,
          status: 'flagged',
        });
        return await repo.save(flag);
      }
    });

    const fetchStockHistoryTool = createTool({
      id: 'fetchStockHistory',
      description: 'Fetch historical stock movements for specific SKUs to project demand.',
      inputSchema: z.object({
        skuIds: z.array(z.string().uuid()),
        days: z.number().default(30),
      }),
      execute: async ({ context }) => {
        const repo = this.dataSource.getRepository(StockMovement);
        const date = new Date();
        date.setDate(date.getDate() - context.days);
        
        return await repo.createQueryBuilder('m')
          .where('m.skuId IN (:...skuIds)', { skuIds: context.skuIds })
          .andWhere('m.createdAt >= :date', { date })
          .orderBy('m.createdAt', 'ASC')
          .getMany();
      }
    });

    const checkStockLevelsTool = createTool({
      id: 'checkStockLevels',
      description: 'Check if stock levels for SKUs are below the reorder threshold.',
      inputSchema: z.object({
        skuIds: z.array(z.string().uuid()),
      }),
      execute: async ({ context }) => {
        const repo = this.dataSource.getRepository(StockLevel);
        return await repo.createQueryBuilder('sl')
          .where('sl.skuId IN (:...skuIds)', { skuIds: context.skuIds })
          .getMany();
      }
    });

    // 2. Define Agents
    this.anomalyAgent = new Agent({
      name: 'Anomaly Agent',
      id: 'anomaly-agent',
      instructions: 'You are an inventory fraud and anomaly detection assistant. Scan recent movements for suspicious activity (like negative adjustments without sales). If you find any, use the createAnomalyFlag tool.',
      model: anthropic('claude-3-5-sonnet-20241022'),
      tools: {
        fetchRecentMovements: fetchRecentMovementsTool,
        createAnomalyFlag: createAnomalyFlagTool,
      }
    });

    this.forecastingAgent = new Agent({
      name: 'Forecasting Agent',
      id: 'forecasting-agent',
      instructions: 'You are a demand forecasting assistant. Analyze historical stock movements to project future demand. Provide clear reasoning.',
      model: anthropic('claude-3-5-sonnet-20241022'),
      tools: {
        fetchStockHistory: fetchStockHistoryTool,
      }
    });

    this.reorderAgent = new Agent({
      name: 'Reorder Agent',
      id: 'reorder-agent',
      instructions: 'You are a restocking assistant. Check stock levels for the provided SKUs. If they are low, prepare to draft a Purchase Order.',
      model: anthropic('claude-3-5-sonnet-20241022'),
      tools: {
        checkStockLevels: checkStockLevelsTool,
      }
    });

    // 3. Initialize Mastra
    this.mastra = new Mastra({
      agents: {
        anomaly: this.anomalyAgent,
        forecasting: this.forecastingAgent,
        reorder: this.reorderAgent,
      },
    });
    
    this.logger.log('Mastra framework initialized with 3 agents.');
  }

  getMastra(): Mastra | null {
    return this.mastra;
  }
}
