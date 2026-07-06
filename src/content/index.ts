/**
 * Content Script - 页面 Storage 数据读取与写入
 * 
 * 功能说明：
 * 1. 读取页面的 localStorage 和 sessionStorage 数据
 * 2. 写入数据到页面的 localStorage 和 sessionStorage
 * 3. 提供写入验证机制，确保数据正确写入
 * 
 * 运行环境：
 * - 注入到用户配置的域名页面中（包括 127.0.0.1）
 * - 通过 Chrome 消息 API 与 Background Service Worker 通信
 */

import type { StorageData } from '@/types';

/**
 * 读取页面 Storage 数据
 * 
 * 功能说明：
 * - 遍历读取当前页面所有的 localStorage 和 sessionStorage 数据
 * - 对读取过程中的异常进行捕获和记录
 * 
 * @returns 包含 localStorage 和 sessionStorage 数据的对象
 */
function readStorageData(): StorageData {
  const localStorageData: Record<string, string> = {};
  const sessionStorageData: Record<string, string> = {};

  // 读取 localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        localStorageData[key] = localStorage.getItem(key) || '';
      }
    }
  } catch (error) {
    // 忽略读取错误
  }

  // 读取 sessionStorage
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        sessionStorageData[key] = sessionStorage.getItem(key) || '';
      }
    }
  } catch (error) {
    // 忽略读取错误
  }

  return {
    localStorage: localStorageData,
    sessionStorage: sessionStorageData
  };
}

/**
 * 写入数据到 Storage
 * 
 * 功能说明：
 * - 支持写入 localStorage 和 sessionStorage
 * - 提供写入验证：写入后立即读取验证是否成功
 * - 记录详细的写入日志，包括写入的键值对数量
 * 
 * @param type - 存储类型：'local' 表示 localStorage，'session' 表示 sessionStorage
 * @param data - 要写入的键值对数据
 * @returns 写入结果，包含成功状态和可能的错误信息
 */
function writeStorageData(type: 'local' | 'session', data: Record<string, string>): { success: boolean; error?: string; verified?: boolean } {
  try {
    const storage = type === 'local' ? localStorage : sessionStorage;

    // 遍历写入所有键值对
    for (const [key, value] of Object.entries(data)) {
      storage.setItem(key, value);
    }

    // 写入验证：立即读取刚写入的数据确认是否成功
    let verified = true;
    for (const [key, value] of Object.entries(data)) {
      const readValue = storage.getItem(key);
      if (readValue !== value) {
        verified = false;
        break;
      }
    }

    return { success: true, verified };
  } catch (error) {
    const errorMessage = (error as Error).message;
    return { success: false, error: errorMessage };
  }
}

/**
 * 批量写入 Storage 数据（支持同时写入 localStorage 和 sessionStorage）
 * 
 * @param localStorageData - 要写入 localStorage 的数据
 * @param sessionStorageData - 要写入 sessionStorage 的数据
 * @returns 批量写入结果
 */
function batchWriteStorage(
  localStorageData?: Record<string, string>,
  sessionStorageData?: Record<string, string>
): { localResult?: { success: boolean; error?: string; verified?: boolean }; sessionResult?: { success: boolean; error?: string; verified?: boolean } } {
  const results: Record<string, any> = {};

  if (localStorageData && Object.keys(localStorageData).length > 0) {
    results.localResult = writeStorageData('local', localStorageData);
  }

  if (sessionStorageData && Object.keys(sessionStorageData).length > 0) {
    results.sessionResult = writeStorageData('session', sessionStorageData);
  }

  return results;
}

// ==================== 消息监听 ====================

/**
 * 监听来自 Background 的消息
 * 
 * 支持的消息类型：
 * - READ_STORAGE: 读取 Storage 数据
 * - WRITE_STORAGE: 写入 Storage 数据
 * - BATCH_WRITE_STORAGE: 批量写入 Storage 数据
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message.type === 'READ_STORAGE') {
      const data = readStorageData();
      sendResponse(data);
    } else if (message.type === 'WRITE_STORAGE') {
      const result = writeStorageData(message.data.type, message.data.data);
      sendResponse(result);
    } else if (message.type === 'BATCH_WRITE_STORAGE') {
      const result = batchWriteStorage(message.data.localStorage, message.data.sessionStorage);
      sendResponse(result);
    } else {
      sendResponse({ error: `未知消息类型: ${message.type}` });
    }
  } catch (error) {
    sendResponse({ error: (error as Error).message });
  }

  return true;
});
