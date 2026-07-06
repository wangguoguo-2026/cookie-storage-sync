/**
 * Cookie 管理模块
 */

import type { CookieData } from '@/types';

export class CookieManager {
  async getCookiesByDomain(domain: string): Promise<CookieData[]> {
    // 清理 domain：去掉通配符和前缀点号
    const cleanDomain = domain.replace(/^\*\./, '').replace(/^\./, '');
    const url = `https://${cleanDomain}`;
    
    // 使用 url 参数可以获取该域名及其所有子域的 Cookie
    const allCookies = await chrome.cookies.getAll({ url });
    return allCookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '',
      path: cookie.path || '/',
      secure: cookie.secure || false,
      httpOnly: cookie.httpOnly || false,
      expirationDate: cookie.expirationDate,
      sameSite: cookie.sameSite || 'unspecified'
    }));
  }

  private buildCookieUrl(domain: string, path: string, secure: boolean): string {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const protocol = secure ? 'https' : 'http';
    return `${protocol}://${cleanDomain}${path}`;
  }

  private async setSingleCookie(cookie: CookieData, targetDomain: string): Promise<boolean> {
    const url = this.buildCookieUrl(targetDomain, cookie.path || '/', cookie.secure);
    
    const setOptions: {
      url: string;
      name: string;
      value: string;
      domain: string;
      path: string;
      secure: boolean;
      httpOnly: boolean;
      sameSite?: chrome.cookies.SameSiteStatus;
      expirationDate?: number;
    } = {
      url,
      name: cookie.name,
      value: cookie.value,
      domain: targetDomain,
      path: cookie.path || '/',
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite !== 'unspecified' ? cookie.sameSite as chrome.cookies.SameSiteStatus : undefined
    };

    if (cookie.expirationDate && !isNaN(cookie.expirationDate)) {
      setOptions.expirationDate = cookie.expirationDate;
    }

    await chrome.cookies.set(setOptions);

    const verifyCookies = await chrome.cookies.getAll({ domain: targetDomain });
    return verifyCookies.some(c => c.name === cookie.name);
  }

  async setCookie(cookie: CookieData): Promise<void> {
    const targetDomains = ['localhost', '127.0.0.1'];
    const errors: Error[] = [];

    for (const domain of targetDomains) {
      try {
        await this.setSingleCookie(cookie, domain);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
      }
    }

    if (errors.length === targetDomains.length) {
      throw new Error(
        `Cookie "${cookie.name}" 在 ${targetDomains.join(', ')} 均设置失败: ` +
        errors.map(e => e.message).join('; ')
      );
    }
  }

  async deleteCookie(domain: string, name: string, path: string = '/'): Promise<void> {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(cleanDomain);
    const protocol = isIpAddress ? 'http' : 'https';
    const url = `${protocol}://${cleanDomain}${path}`;

    await chrome.cookies.remove({ url, name });
  }
}
