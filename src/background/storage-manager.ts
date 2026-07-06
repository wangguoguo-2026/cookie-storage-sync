/**
 * 本地存储管理模块
 * 
 * 历史记录存储机制：
 * - 最大存储容量：50 条同步记录
 * - 淘汰策略：当记录数达到上限时，自动删除最旧的记录（基于 syncedAt 时间戳）
 * - 存储顺序：新记录添加在数组头部，保持按时间倒序排列
 * - 数据验证：确保每条记录包含必需的字段（id, domainId, domain, sourceDomain, status 等）
 */

import type { DomainConfig, SyncRecord, SyncData, SyncDataItem } from '@/types';

const STORAGE_KEYS = {
  DOMAIN_CONFIGS: 'domain_configs',
  SYNC_RECORDS: 'sync_records',
  SYNC_DATA: 'sync_data',
  SYNC_DATA_ITEMS: 'sync_data_items'
};

/** 历史记录最大存储数量 */
const MAX_RECORDS = 50;

export class StorageManager {
  async getDomainConfigs(): Promise<DomainConfig[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_CONFIGS);
    return result[STORAGE_KEYS.DOMAIN_CONFIGS] || [];
  }

  async saveDomainConfig(config: DomainConfig): Promise<void> {
    const configs = await this.getDomainConfigs();
    const index = configs.findIndex(c => c.id === config.id);
    
    if (index >= 0) {
      configs[index] = { ...config, updatedAt: Date.now() };
    } else {
      configs.push(config);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.DOMAIN_CONFIGS]: configs });
  }

  async deleteDomainConfig(id: string): Promise<void> {
    const configs = await this.getDomainConfigs();
    const filtered = configs.filter(c => c.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.DOMAIN_CONFIGS]: filtered });
  }

  /**
   * 添加同步记录
   * 
   * 存储机制：
   * - 新记录始终添加在数组头部（unshift），确保最新记录在前
   * - 当记录数超过 MAX_RECORDS (50) 时，自动截断数组，保留最新的 50 条
   * - 由于记录已按时间倒序排列（新记录在头部），截断尾部即删除最旧记录
   * 
   * @param record - 同步记录对象
   * @throws Error - 当记录缺少必需字段时抛出错误
   */
  async addSyncRecord(record: SyncRecord): Promise<void> {
    try {
      // 数据验证：检查必需字段
      this.validateSyncRecord(record);
      
      const records = await this.getSyncRecords();
      
      // 添加新记录到头部
      records.unshift({
        ...record,
        syncedAt: record.syncedAt || Date.now()
      });
      
      // 如果超过最大存储数量，截断数组（删除尾部最旧的记录）
      if (records.length > MAX_RECORDS) {
        records.length = MAX_RECORDS;
      }
      
      await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_RECORDS]: records });
    } catch (error) {
      throw error;
    }
  }

  /**
   * 验证同步记录的必需字段
   * 
   * @param record - 待验证的同步记录
   * @throws Error - 当缺少必需字段时抛出错误
   */
  private validateSyncRecord(record: SyncRecord): void {
    const requiredFields: (keyof SyncRecord)[] = [
      'id',
      'domainId',
      'domain',
      'sourceDomain',
      'status',
      'startTime',
      'endTime',
      'duration'
    ];

    for (const field of requiredFields) {
      if (record[field] === undefined || record[field] === null) {
        throw new Error(`同步记录缺少必需字段: ${String(field)}`);
      }
    }

    // 验证 status 字段的有效值
    const validStatuses = ['success', 'partial', 'failed'];
    if (!validStatuses.includes(record.status)) {
      throw new Error(`无效的同步状态: ${record.status}，有效值为: ${validStatuses.join(', ')}`);
    }

    // 验证时间字段的合理性
    if (record.endTime < record.startTime) {
      throw new Error('结束时间不能早于开始时间');
    }

    if (record.duration < 0) {
      throw new Error('同步时长不能为负数');
    }
  }

  /**
   * 获取同步记录列表
   * 
   * 检索机制：
   * - 记录按时间倒序存储（最新在前）
   * - 支持按 sourceDomain 过滤（支持通配符匹配）
   * - 返回结果限制在指定数量内（默认 50）
   * 
   * @param limit - 返回的最大记录数（默认 50）
   * @param sourceDomain - 可选的源域名过滤条件
   * @returns 同步记录数组
   */
  async getSyncRecords(limit: number = 50, sourceDomain?: string): Promise<SyncRecord[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_RECORDS);
    let records = result[STORAGE_KEYS.SYNC_RECORDS] || [];

    if (sourceDomain) {
      // 支持通配符匹配
      if (sourceDomain.startsWith('*.')) {
        const baseDomain = sourceDomain.substring(2);
        records = records.filter((r: SyncRecord) => 
          r.sourceDomain === baseDomain || r.sourceDomain?.endsWith('.' + baseDomain)
        );
      } else {
        records = records.filter((r: SyncRecord) => r.sourceDomain === sourceDomain);
      }
    }
    return records.slice(0, limit);
  }

  /**
   * 获取当前存储的同步记录总数
   * 
   * @returns 记录总数
   */
  async getSyncRecordsCount(): Promise<number> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_RECORDS);
    const records = result[STORAGE_KEYS.SYNC_RECORDS] || [];
    return records.length;
  }

  /**
   * 清理超出限制的旧记录
   * 
   * 此方法可用于主动清理，确保存储空间不会无限增长
   */
  async cleanupOldRecords(): Promise<void> {
    const records = await this.getSyncRecords();
    
    if (records.length > MAX_RECORDS) {
      records.length = MAX_RECORDS;
      await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_RECORDS]: records });
    }
  }

  async saveSyncData(data: SyncData): Promise<void> {
    const syncDataMap = await this.getSyncDataMap();
    syncDataMap[data.id] = data;
    await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_DATA]: syncDataMap });
  }

  async getSyncDataMap(): Promise<Record<string, SyncData>> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_DATA);
    return result[STORAGE_KEYS.SYNC_DATA] || {};
  }

  async getSyncDataItems(options: {
    recordId: string;
    page?: number;
    pageSize?: number;
    search?: string;
    type?: string;
  }): Promise<{ items: SyncDataItem[]; total: number; page: number; pageSize: number }> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_DATA_ITEMS);
    const allItems: Record<string, SyncDataItem[]> = result[STORAGE_KEYS.SYNC_DATA_ITEMS] || {};
    
    let items = allItems[options.recordId] || [];

    if (options.type) {
      items = items.filter(item => item.type === options.type);
    }

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      items = items.filter(item => 
        item.key.toLowerCase().includes(searchLower) ||
        item.value.toLowerCase().includes(searchLower)
      );
    }

    const total = items.length;
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const start = (page - 1) * pageSize;
    const pagedItems = items.slice(start, start + pageSize);

    return { items: pagedItems, total, page, pageSize };
  }

  async saveSyncDataItems(recordId: string, items: SyncDataItem[]): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_DATA_ITEMS);
    const allItems: Record<string, SyncDataItem[]> = result[STORAGE_KEYS.SYNC_DATA_ITEMS] || {};
    allItems[recordId] = items;
    await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_DATA_ITEMS]: allItems });
  }

  async clearAll(): Promise<void> {
    await chrome.storage.local.clear();
  }
}
