import crypto from 'node:crypto';

export function hashMessage(parts: Array<string | number | undefined | null>): string {
  return crypto
    .createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('\u001f'))
    .digest('hex');
}
