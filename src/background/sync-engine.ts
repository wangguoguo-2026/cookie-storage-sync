/**
 * 同步引擎
 */

import { CookieManager } from './cookie-manager';
import { StorageManager } from './storage-manager';
import { getTabByDomain } from '@/utils/message';
import type { DomainConfig, SyncProgress, SyncRecord, SyncData, StorageData, SyncDataItem } from '@/types';

export class SyncEngine {
  private cookieManager: CookieManager;
  private storageManager: StorageManager;
  private progress: SyncProgress | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.cookieManager = new CookieManager();
    this.storageManager = new StorageManager();
  }

  async syncDomain(domainId: string, onProgress?: (progress: SyncProgress) => void): Promise<void> {
    if (this.isRunning) {
      throw new Error('同步任务正在运行中');
    }

    this.isRunning = true;
    const startTime = Date.now();

    const configs = await this.storageManager.getDomainConfigs();
    const config = configs.find(c => c.id === domainId);

    if (!config) {
      throw new Error('域名配置不存在');
    }

    this.progress = {
      status: 'validating',
      currentStep: '正在校验域名...',
      currentCount: 0,
      totalCount: 0,
      logs: []
    };
    this.reportProgress(onProgress);

    try {
      this.updateProgress('reading', '正在查找目标页面...');
      const tab = await getTabByDomain(config.domain);

      if (!tab || !tab.id) {
        throw new Error(`未找到 ${config.domain} 的打开页面，请先访问该网站`);
      }

      this.addLog(`找到目标页面: ${tab.url}`);

      const syncDataItems: SyncDataItem[] = [];

      if (config.syncCookie) {
        const { items } = await this.syncCookies(config.domain, ['127.0.0.1', 'localhost'], onProgress);
        syncDataItems.push(...items);
      }

      if (config.syncLocalStorage || config.syncSessionStorage) {
        const { items } = await this.syncStorage(tab.id, config, onProgress);
        syncDataItems.push(...items);
      }

      const endTime = Date.now();
      
      // 计算实际同步的 Cookie 项目数量（包括所有目标域）
      const actualCookieCount = syncDataItems.filter(item => item.type === 'cookie').length;
      const actualLocalStorageCount = syncDataItems.filter(item => item.type === 'localStorage').length;
      const actualSessionStorageCount = syncDataItems.filter(item => item.type === 'sessionStorage').length;
      const totalCount = actualCookieCount + actualLocalStorageCount + actualSessionStorageCount;

      const recordId = `record_${Date.now()}`;
      const record: SyncRecord = {
        id: recordId,
        domainId,
        domain: config.domain,
        sourceDomain: config.domain,
        status: 'success',
        cookieCount: actualCookieCount,
        localStorageCount: actualLocalStorageCount,
        sessionStorageCount: actualSessionStorageCount,
        totalCount,
        startTime,
        endTime,
        duration: endTime - startTime
      };

      await this.storageManager.addSyncRecord(record);
      await this.storageManager.saveSyncDataItems(recordId, syncDataItems);

      const syncData: SyncData = {
        id: `syncdata_${Date.now()}`,
        domainId,
        recordId,
        items: syncDataItems,
        cookies: syncDataItems.filter(item => item.type === 'cookie').map(item => ({
          name: item.key,
          value: item.value,
          domain: item.domain || '',
          path: item.path || '/',
          secure: item.secure || false,
          httpOnly: item.httpOnly || false,
          expirationDate: item.expirationDate,
          sameSite: (item.sameSite as any) || 'unspecified'
        })),
        localStorage: Object.fromEntries(
          syncDataItems.filter(item => item.type === 'localStorage').map(item => [item.key, item.value])
        ),
        sessionStorage: Object.fromEntries(
          syncDataItems.filter(item => item.type === 'sessionStorage').map(item => [item.key, item.value])
        ),
        syncAt: Date.now()
      };

      await this.storageManager.saveSyncData(syncData);

      config.lastSyncAt = Date.now();
      await this.storageManager.saveDomainConfig(config);

      this.updateProgress('completed', `同步完成！共同步 ${totalCount} 项数据`);
    } catch (error) {
      const endTime = Date.now();
      const errorMessage = (error as Error).message;

      const record: SyncRecord = {
        id: `record_${Date.now()}`,
        domainId,
        domain: config.domain,
        sourceDomain: config.domain,
        status: 'failed',
        cookieCount: 0,
        localStorageCount: 0,
        sessionStorageCount: 0,
        totalCount: 0,
        startTime,
        endTime,
        duration: endTime - startTime,
        error: errorMessage
      };

      await this.storageManager.addSyncRecord(record);
      this.updateProgress('failed', `同步失败: ${errorMessage}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async syncCookies(domain: string,  targetDomains: string[], onProgress?: (progress: SyncProgress) => void) {
    this.addLog('开始同步 Cookie...');
    
    const cookies = await this.cookieManager.getCookiesByDomain(domain);
    this.progress!.totalCount += cookies.length;
    this.addLog(`${domain}找到 ${cookies.length} 个 Cookie`);
    this.reportProgress(onProgress);

    const items: SyncDataItem[] = [];
    let writeSuccessCount = 0;

    for (let targetDomain of targetDomains) {
      for (let i = 0; i < cookies.length; i++) {
      this.updateProgress(
        'reading',
        `正在同步 Cookie (${i + 1}/${cookies.length})...`,
        this.progress!.currentCount + 1
      );
      this.reportProgress(onProgress);

      const cookie = cookies[i];
      let status: 'success' | 'failed' = 'success';

      try {
        cookie.domain = targetDomain;
        await this.cookieManager.setCookie(cookie);
        writeSuccessCount++;
      } catch (error) {
        status = 'failed';
      }

      items.push({
        id: `item_cookie_${Date.now()}_${i}`,
        recordId: '',
        type: 'cookie',
        key: cookie.name,
        value: cookie.httpOnly ? '**** (httpOnly)' : cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expirationDate,
        sameSite: cookie.sameSite,
        status,
        error: status === 'failed' ? '写入失败' : undefined,
        syncedAt: Date.now()
      });
    }}

    this.addLog(`Cookie 同步完成: 成功 ${writeSuccessCount} 个`);
    return { items };
  }

  private async syncStorage(
    tabId: number, 
    config: DomainConfig, 
    onProgress?: (progress: SyncProgress) => void
  ): Promise<{ items: SyncDataItem[] }> {
    this.addLog('开始读取 Storage 数据...');

    let storageData: StorageData | undefined = undefined;
    let lastError: Error | null = null;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.addLog(`尝试读取 Storage (第 ${attempt}/${maxRetries} 次)...`);
        storageData = await chrome.tabs.sendMessage(tabId, { type: 'READ_STORAGE' });
        if (storageData) {
          this.addLog(`Storage 数据读取成功 (尝试 ${attempt} 次)`);
          break;
        }
      } catch (error) {
        lastError = error as Error;
        this.addLog(`读取 Storage 失败 (第 ${attempt} 次): ${lastError.message}`);
        
        if (attempt < maxRetries) {
          const delay = 500 * Math.pow(2, attempt - 1);
          this.addLog(`等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    if (!storageData) {
      const errorMsg = lastError?.message || '未知错误';
      this.addLog(`读取 Storage 失败: ${errorMsg}`);
      throw new Error(
        `无法读取页面 Storage 数据: ${errorMsg}\n\n` +
        `请尝试以下解决方案：\n` +
        `1. 刷新页面后重新同步\n` +
        `2. 确认不是 chrome://、edge:// 等浏览器特殊页面\n` +
        `3. 检查浏览器扩展管理页面，确认扩展已启用并刷新\n` +
        `4. 打开浏览器开发者工具 Console，查看是否有 Content Script 加载错误`
      );
    }
    
    this.addLog('成功读取 Storage 数据');

    let localCount = Object.keys(storageData.localStorage).length;
    let sessionCount = Object.keys(storageData.sessionStorage).length;

    if (!config.syncLocalStorage) localCount = 0;
    if (!config.syncSessionStorage) sessionCount = 0;

    const totalCount = localCount + sessionCount;
    this.progress!.totalCount += totalCount;
    this.addLog(`找到 ${totalCount} 个 Storage 数据`);
    this.reportProgress(onProgress);

    const items: SyncDataItem[] = [];
    const targetDomains = ['localhost', '127.0.0.1'];

    // 构建要同步的 storage 数据
    const localData = config.syncLocalStorage ? storageData.localStorage : {};
    const sessionData = config.syncSessionStorage ? storageData.sessionStorage : {};

    // 同步到 localhost 和 127.0.0.1
    for (let d = 0; d < targetDomains.length; d++) {
      const targetDomain = targetDomains[d];
      this.addLog(`开始同步 Storage 到 ${targetDomain}...`);

      // 写入 localStorage
      if (config.syncLocalStorage && Object.keys(localData).length > 0) {
        const writeResult = await this.writeStorageToTarget(targetDomain, 'local', localData);
        
        for (const key of Object.keys(localData)) {
          const itemIndex = items.findIndex(item => item.type === 'localStorage' && item.key === key && item.domain === targetDomain);
          const item: SyncDataItem = itemIndex >= 0 ? items[itemIndex] : {
            id: `item_local_${Date.now()}_${key}`,
            recordId: '',
            type: 'localStorage',
            key,
            value: localData[key] || '',
            domain: targetDomain,
            status: writeResult.success ? 'success' : 'failed',
            error: writeResult.error,
            syncedAt: Date.now()
          };
          
          if (itemIndex < 0) items.push(item);
        }
      }

      // 写入 sessionStorage
      if (config.syncSessionStorage && Object.keys(sessionData).length > 0) {
        const writeResult = await this.writeStorageToTarget(targetDomain, 'session', sessionData);
        
        for (const key of Object.keys(sessionData)) {
          const itemIndex = items.findIndex(item => item.type === 'sessionStorage' && item.key === key && item.domain === targetDomain);
          const item: SyncDataItem = itemIndex >= 0 ? items[itemIndex] : {
            id: `item_session_${Date.now()}_${key}`,
            recordId: '',
            type: 'sessionStorage',
            key,
            value: sessionData[key] || '',
            domain: targetDomain,
            status: writeResult.success ? 'success' : 'failed',
            error: writeResult.error,
            syncedAt: Date.now()
          };
          
          if (itemIndex < 0) items.push(item);
        }
      }

      this.addLog(`Storage 同步到 ${targetDomain} 完成`);
    }

    return { items };
  }

  private async writeStorageToTarget(
    targetDomain: string,
    type: 'local' | 'session',
    data: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const targetTab = await getTabByDomain(targetDomain);
      
      if (!targetTab || !targetTab.id) {
        this.addLog(`未找到 ${targetDomain} 的打开页面，跳过写入`);
        return { success: false, error: `未找到 ${targetDomain} 页面` };
      }

      const writeResult = await chrome.tabs.sendMessage(targetTab.id, {
        type: 'WRITE_STORAGE',
        data: { type, data }
      });

      if (writeResult?.success) {
        this.addLog(`${targetDomain} 的 ${type === 'local' ? 'localStorage' : 'sessionStorage'} 写入成功`);
        return { success: true };
      } else {
        this.addLog(`${targetDomain} 的 ${type === 'local' ? 'localStorage' : 'sessionStorage'} 写入失败`);
        return { success: false, error: writeResult?.error || '写入失败' };
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      this.addLog(`写入 ${targetDomain} Storage 失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  private updateProgress(
    status: SyncProgress['status'],
    currentStep: string,
    currentCount?: number
  ): void {
    if (this.progress) {
      this.progress.status = status;
      this.progress.currentStep = currentStep;
      if (currentCount !== undefined) {
        this.progress.currentCount = currentCount;
      }
    }
  }

  private reportProgress(onProgress?: (progress: SyncProgress) => void): void {
    if (onProgress && this.progress) {
      onProgress(this.progress);
    }
  }

  private addLog(message: string): void {
    if (this.progress) {
      const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      this.progress.logs.push(`[${timestamp}] ${message}`);
    }
  }

  cancelSync(): void {
    this.isRunning = false;
  }
}
