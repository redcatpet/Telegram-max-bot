import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MaxChat, MaxMessage } from './types.js';

export class Storage {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        max_chat_key TEXT PRIMARY KEY,
        title TEXT,
        last_seen_message_hash TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        max_message_hash TEXT PRIMARY KEY,
        max_chat_key TEXT,
        sender TEXT,
        text TEXT,
        created_at TEXT,
        telegram_message_id INTEGER
      );

      CREATE TABLE IF NOT EXISTS telegram_links (
        telegram_message_id INTEGER PRIMARY KEY,
        max_chat_key TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  upsertChat(chat: MaxChat, lastSeenMessageHash?: string): void {
    this.db.prepare(`
      INSERT INTO chats (max_chat_key, title, last_seen_message_hash, updated_at)
      VALUES (@key, @title, @lastSeenMessageHash, @updatedAt)
      ON CONFLICT(max_chat_key) DO UPDATE SET
        title = excluded.title,
        last_seen_message_hash = COALESCE(excluded.last_seen_message_hash, chats.last_seen_message_hash),
        updated_at = excluded.updated_at
    `).run({
      key: chat.key,
      title: chat.title,
      lastSeenMessageHash: lastSeenMessageHash ?? null,
      updatedAt: new Date().toISOString(),
    });
  }

  getRecentChats(limit = 20): MaxChat[] {
    return this.db.prepare(`
      SELECT max_chat_key AS key, title
      FROM chats
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as MaxChat[];
  }

  getChat(key: string): MaxChat | undefined {
    return this.db.prepare(`
      SELECT max_chat_key AS key, title
      FROM chats
      WHERE max_chat_key = ?
    `).get(key) as MaxChat | undefined;
  }

  countChats(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM chats').get() as { count: number };
    return row.count;
  }

  insertMessage(message: MaxMessage, telegramMessageId?: number): boolean {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO messages
        (max_message_hash, max_chat_key, sender, text, created_at, telegram_message_id)
      VALUES (@hash, @chatKey, @sender, @text, @createdAt, @telegramMessageId)
    `).run({
      ...message,
      telegramMessageId: telegramMessageId ?? null,
    });
    return result.changes > 0;
  }

  setTelegramMessageId(maxMessageHash: string, telegramMessageId: number): void {
    this.db.prepare(`
      UPDATE messages
      SET telegram_message_id = ?
      WHERE max_message_hash = ?
    `).run(telegramMessageId, maxMessageHash);
  }

  hasMessage(hash: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM messages WHERE max_message_hash = ?').get(hash);
    return Boolean(row);
  }

  linkTelegramMessage(telegramMessageId: number, maxChatKey: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO telegram_links (telegram_message_id, max_chat_key, created_at)
      VALUES (?, ?, ?)
    `).run(telegramMessageId, maxChatKey, new Date().toISOString());
  }

  getChatKeyByTelegramMessageId(telegramMessageId: number): string | undefined {
    const row = this.db.prepare(`
      SELECT max_chat_key AS chatKey
      FROM telegram_links
      WHERE telegram_message_id = ?
    `).get(telegramMessageId) as { chatKey: string } | undefined;
    return row?.chatKey;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }
}
