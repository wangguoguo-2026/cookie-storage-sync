/**
 * Chrome 扩展类型定义
 */

// Cookie 数据接口
export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite: 'lax' | 'strict' | 'no_restriction' | 'unspecified';
}

// 存储数据接口
export interface StorageData {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

// 域名配置接口
export interface DomainConfig {
  id: string;
  domain: string;
  syncCookie: boolean;
  syncLocalStorage: boolean;
  syncSessionStorage: boolean;
  autoSync: 'off' | 'manual' | '5min' | '30min';
  createdAt: number;
  updatedAt: number;
  lastSyncAt?: number;
}

// 同步记录接口
export interface SyncRecord {
  id: string;
  domainId: string;
  domain: string;
  sourceDomain: string;
  status: 'success' | 'partial' | 'failed';
  cookieCount: number;
  localStorageCount: number;
  sessionStorageCount: number;
  totalCount: number;
  startTime: number;
  endTime: number;
  duration: number;
  error?: string;
  syncedAt?: number;
}

// 同步数据项接口
export interface SyncDataItem {
  id: string;
  recordId: string;
  type: 'cookie' | 'localStorage' | 'sessionStorage';
  key: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  syncedAt: number;
}

// 同步数据接口
export interface SyncData {
  id: string;
  domainId: string;
  recordId: string;
  items: SyncDataItem[];
  cookies: CookieData[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  syncAt: number;
}

// 同步进度接口
export interface SyncProgress {
  status: 'validating' | 'reading' | 'saving' | 'completed' | 'failed';
  currentStep: string;
  currentCount: number;
  totalCount: number;
  logs: string[];
}

// 消息类型定义
export interface MessageTypes {
  // Popup -> Background
  SYNC_DOMAIN: { domainId: string };
  GET_DOMAIN_CONFIGS: void;
  SAVE_DOMAIN_CONFIG: DomainConfig;
  DELETE_DOMAIN_CONFIG: string;
  GET_SYNC_RECORDS: { limit?: number; domain?: string; sourceDomain?: string };
  GET_SYNC_DATA: { recordId: string };
  GET_SYNC_DATA_ITEMS: { recordId: string; page?: number; pageSize?: number; search?: string; type?: string };
  CANCEL_SYNC: void;

  // Background -> Popup
  SYNC_PROGRESS: SyncProgress;
  SYNC_COMPLETE: SyncRecord;
  SYNC_ERROR: { error: string };
  DOMAIN_CONFIGS_UPDATED: DomainConfig[];

  // Background -> Content Script
  READ_STORAGE: void;
  WRITE_STORAGE: { type: 'local' | 'session'; data: Record<string, string> };
  BATCH_WRITE_STORAGE: { localStorage?: Record<string, string>; sessionStorage?: Record<string, string> };

  // Content Script -> Background
  STORAGE_DATA: StorageData;
  STORAGE_WRITE_RESULT: { success: boolean; error?: string };
}
