/**
 * 域名校验工具
 */

const DOMAIN_REGEX = /^(?:(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

export function validateDomain(domain: string): { valid: boolean; message?: string } {
  if (!domain || domain.trim() === '') {
    return { valid: false, message: '域名不能为空' };
  }

  domain = domain.trim().toLowerCase();

  if (!DOMAIN_REGEX.test(domain)) {
    return { valid: false, message: '域名格式不正确' };
  }

  return { valid: true };
}

export function formatDomain(domain: string): string {
  return domain.trim().toLowerCase();
}
