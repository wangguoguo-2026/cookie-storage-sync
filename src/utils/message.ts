/**
 * 消息通信工具
 */

import type { MessageTypes } from '@/types';

export function sendMessageToBackground<T extends keyof MessageTypes>(
  type: T,
  data: MessageTypes[T]
): Promise<any> {
  return chrome.runtime.sendMessage({ type, data });
}

export function onMessage<T extends keyof MessageTypes>(
  type: T,
  handler: (data: MessageTypes[T], sender: chrome.runtime.MessageSender) => Promise<any>
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === type) {
      handler(message.data, sender).then(sendResponse).catch(err => {
        sendResponse({ error: err.message });
      });
      return true;
    }
  });
}

export async function getTabByDomain(domain: string): Promise<chrome.tabs.Tab | undefined> {
  const patterns = [
    `*://${domain}/*`,
    `*://*.${domain}/*`,
    `http://${domain}/*`,
    `https://${domain}/*`
  ];

  for (const pattern of patterns) {
    const tabs = await chrome.tabs.query({ url: pattern });
    if (tabs.length > 0) {
      return tabs[0];
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab;
}
