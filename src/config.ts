import 'dotenv/config';
import path from 'node:path';
import { AppConfig } from './types.js';

function requiredString(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return parsed;
}

function optionalBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function loadConfig(): AppConfig {
  const allowedUserId = Number(requiredString('TELEGRAM_ALLOWED_USER_ID'));
  if (!Number.isSafeInteger(allowedUserId)) {
    throw new Error('TELEGRAM_ALLOWED_USER_ID must be an integer Telegram user id');
  }

  return {
    telegramBotToken: requiredString('TELEGRAM_BOT_TOKEN'),
    telegramAllowedUserId: allowedUserId,
    maxWebUrl: process.env.MAX_WEB_URL || 'https://web.max.ru',
    headless: optionalBoolean('HEADLESS', false),
    pollIntervalMs: optionalNumber('POLL_INTERVAL_MS', 3000),
    logLevel: process.env.LOG_LEVEL || 'info',
    databasePath: process.env.DATABASE_PATH || './data/bridge.sqlite',
    profileDir: path.resolve('./max-profile'),
  };
}
