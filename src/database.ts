/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createClient, RedisClientType } from 'redis';
import pg from 'pg';
import type { FullConfig } from './config.js';

const { Pool } = pg;

export interface CrawlJob {
  id?: number;
  url: string;
  strategy_hash?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at?: Date;
  completed_at?: Date;
  total_pages?: number;
  total_items?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface CrawlResult {
  id?: number;
  job_id: number;
  page_number: number;
  extracted_data: any;
  metadata: any;
  created_at?: Date;
}

export interface CrawlStrategy {
  id?: number;
  site_pattern: string;
  strategy_hash: string;
  strategy_data: any;
  success_rate?: number;
  last_used?: Date;
}

export interface PageAnalysis {
  url: string;
  html_content: string;
  analysis_result?: any;
  timestamp: Date;
}

export interface CrawlJobsFilter {
  limit?: number;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'all';
  sortBy?: 'created_at' | 'completed_at' | 'total_items';
  sortOrder?: 'asc' | 'desc';
}

export class DatabaseManager {
  private redisClient: RedisClientType | null = null;
  private pgPool: pg.Pool | null = null;
  private config: FullConfig;

  constructor(config: FullConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    await this.connectRedis();
    await this.connectPostgres();
  }

  async disconnect(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
  }

  private async connectRedis(): Promise<void> {
    const redisConfig = this.config.database.redis;
    if (!redisConfig) {
      throw new Error('Redis configuration not found');
    }

    this.redisClient = createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
      },
      password: redisConfig.password,
      database: redisConfig.db,
    });

    this.redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    await this.redisClient.connect();
  }

  private async connectPostgres(): Promise<void> {
    const pgConfig = this.config.database.postgres;
    if (!pgConfig) {
      throw new Error('PostgreSQL configuration not found');
    }

    this.pgPool = new Pool({
      host: pgConfig.host,
      port: pgConfig.port,
      database: pgConfig.database,
      user: pgConfig.user,
      password: pgConfig.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await this.pgPool.connect();
    client.release();
  }

  async initializeDatabase(): Promise<void> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      // Create tables if they don't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS crawl_jobs (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          strategy_hash TEXT,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          completed_at TIMESTAMP,
          total_pages INTEGER,
          total_items INTEGER,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS crawl_results (
          id SERIAL PRIMARY KEY,
          job_id INTEGER REFERENCES crawl_jobs(id),
          page_number INTEGER,
          extracted_data JSONB,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS crawl_strategies (
          id SERIAL PRIMARY KEY,
          site_pattern TEXT,
          strategy_hash TEXT UNIQUE,
          strategy_data JSONB,
          success_rate FLOAT DEFAULT 0,
          last_used TIMESTAMP DEFAULT NOW()
        );
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_crawl_jobs_url ON crawl_jobs(url);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_crawl_results_job_id ON crawl_results(job_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_crawl_strategies_hash ON crawl_strategies(strategy_hash);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_crawl_strategies_pattern ON crawl_strategies(site_pattern);
      `);

    } finally {
      client.release();
    }
  }

  // Redis operations
  async storePageAnalysis(key: string, analysis: PageAnalysis): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    await this.redisClient.setEx(`page_analysis:${key}`, 3600, JSON.stringify(analysis)); // 1 hour TTL
  }

  async getPageAnalysis(key: string): Promise<PageAnalysis | null> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    const data = await this.redisClient.get(`page_analysis:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async storeCrawlStrategy(key: string, strategy: any): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    await this.redisClient.setEx(`strategy:${key}`, 86400, JSON.stringify(strategy)); // 24 hours TTL
  }

  async getCrawlStrategy(key: string): Promise<any | null> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    const data = await this.redisClient.get(`strategy:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async storeCrawlProgress(jobId: number, progress: any): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    await this.redisClient.setEx(`progress:${jobId}`, 3600, JSON.stringify(progress)); // 1 hour TTL
  }

  async getCrawlProgress(jobId: number): Promise<any | null> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    const data = await this.redisClient.get(`progress:${jobId}`);
    return data ? JSON.parse(data) : null;
  }

  // PostgreSQL operations
  async createCrawlJob(job: Omit<CrawlJob, 'id' | 'created_at'>): Promise<number> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      const result = await client.query(
        `INSERT INTO crawl_jobs (url, strategy_hash, status, total_pages, total_items, input_tokens, output_tokens, total_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [job.url, job.strategy_hash, job.status, job.total_pages, job.total_items, job.input_tokens, job.output_tokens, job.total_tokens]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async updateCrawlJob(id: number, updates: Partial<CrawlJob>): Promise<void> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      const setClause = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');
      
      const values = [id, ...Object.values(updates)];
      
      await client.query(
        `UPDATE crawl_jobs SET ${setClause} WHERE id = $1`,
        values
      );
    } finally {
      client.release();
    }
  }

  async getCrawlJob(id: number): Promise<CrawlJob | null> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      const result = await client.query('SELECT * FROM crawl_jobs WHERE id = $1', [id]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getCrawlJobs(filter: CrawlJobsFilter = {}): Promise<CrawlJob[]> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      let query = 'SELECT * FROM crawl_jobs';
      const params: any[] = [];
      const conditions: string[] = [];

      // Add status filter
      if (filter.status && filter.status !== 'all') {
        conditions.push(`status = $${params.length + 1}`);
        params.push(filter.status);
      }

      // Add WHERE clause if there are conditions
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      // Add sorting
      const sortBy = filter.sortBy || 'created_at';
      const sortOrder = filter.sortOrder || 'desc';
      query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

      // Add limit
      const limit = filter.limit || 20;
      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async storeCrawlResult(result: Omit<CrawlResult, 'id' | 'created_at'>): Promise<number> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      const queryResult = await client.query(
        `INSERT INTO crawl_results (job_id, page_number, extracted_data, metadata)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [result.job_id, result.page_number, JSON.stringify(result.extracted_data), JSON.stringify(result.metadata)]
      );
      return queryResult.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getCrawlResults(jobId: number): Promise<CrawlResult[]> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM crawl_results WHERE job_id = $1 ORDER BY page_number',
        [jobId]
      );
      return result.rows.map(row => ({
        ...row,
        extracted_data: row.extracted_data,
        metadata: row.metadata
      }));
    } finally {
      client.release();
    }
  }

  async storeCrawlStrategyPersistent(strategy: Omit<CrawlStrategy, 'id' | 'last_used'>): Promise<number> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      const result = await client.query(
        `INSERT INTO crawl_strategies (site_pattern, strategy_hash, strategy_data, success_rate)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (strategy_hash) 
         DO UPDATE SET last_used = NOW(), success_rate = $4
         RETURNING id`,
        [strategy.site_pattern, strategy.strategy_hash, JSON.stringify(strategy.strategy_data), strategy.success_rate]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getCrawlStrategyPersistent(strategyHash: string): Promise<CrawlStrategy | null> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM crawl_strategies WHERE strategy_hash = $1',
        [strategyHash]
      );
      if (result.rows[0]) {
        return {
          ...result.rows[0],
          strategy_data: result.rows[0].strategy_data
        };
      }
      return null;
    } finally {
      client.release();
    }
  }

  async findSimilarStrategies(sitePattern: string): Promise<CrawlStrategy[]> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM crawl_strategies 
         WHERE site_pattern ILIKE $1 
         ORDER BY success_rate DESC, last_used DESC 
         LIMIT 5`,
        [`%${sitePattern}%`]
      );
      return result.rows.map(row => ({
        ...row,
        strategy_data: row.strategy_data
      }));
    } finally {
      client.release();
    }
  }
}

// Global database manager instance
let dbManager: DatabaseManager | null = null;

export function initializeDatabaseManager(config: FullConfig): DatabaseManager {
  dbManager = new DatabaseManager(config);
  return dbManager;
}

export function getDatabaseManager(): DatabaseManager {
  if (!dbManager) {
    throw new Error('Database manager not initialized. Call initializeDatabaseManager first.');
  }
  return dbManager;
}
