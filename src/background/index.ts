/**
 * Background Service Worker 入口
 */

import { StorageManager } from './storage-manager';
import { SyncEngine } from './sync-engine';
import { onMessage } from '@/utils/message';
import type { DomainConfig, SyncProgress } from '@/types';

const storageManager = new StorageManager();
const syncEngine = new SyncEngine();

onMessage('GET_DOMAIN_CONFIGS', async () => {
  return await storageManager.getDomainConfigs();
});

onMessage('SAVE_DOMAIN_CONFIG', async (data: DomainConfig) => {
  await storageManager.saveDomainConfig(data);
  const configs = await storageManager.getDomainConfigs();
  chrome.runtime.sendMessage({ 
    type: 'DOMAIN_CONFIGS_UPDATED', 
    data: configs 
  }).catch(() => {});
  return { success: true };
});

onMessage('DELETE_DOMAIN_CONFIG', async (data: string) => {
  await storageManager.deleteDomainConfig(data);
  const configs = await storageManager.getDomainConfigs();
  chrome.runtime.sendMessage({ 
    type: 'DOMAIN_CONFIGS_UPDATED', 
    data: configs 
  }).catch(() => {});
  return { success: true };
});

onMessage('GET_SYNC_RECORDS', async (data: { limit?: number; sourceDomain?: string }) => {
  const limit = data?.limit || 50;
  const sourceDomain = data?.sourceDomain;
  return await storageManager.getSyncRecords(limit, sourceDomain);
});

onMessage('GET_SYNC_DATA_ITEMS', async (data: { recordId: string; page?: number; pageSize?: number; search?: string; type?: string }) => {
  return await storageManager.getSyncDataItems(data);
});

onMessage('SYNC_DOMAIN', async (data: { domainId: string }) => {
  try {
    await syncEngine.syncDomain(data.domainId, (progress: SyncProgress) => {
      chrome.runtime.sendMessage({ 
        type: 'SYNC_PROGRESS', 
        data: progress 
      }).catch(() => {});
    });

    const records = await storageManager.getSyncRecords(1);
    chrome.runtime.sendMessage({ 
      type: 'SYNC_COMPLETE', 
      data: records[0] 
    }).catch(() => {});

    return { success: true };
  } catch (error) {
    const errorMessage = (error as Error).message;
    chrome.runtime.sendMessage({ 
      type: 'SYNC_ERROR', 
      data: { error: errorMessage } 
    }).catch(() => {});
    throw error;
  }
});

onMessage('CANCEL_SYNC', async () => {
  syncEngine.cancelSync();
  return { success: true };
});
