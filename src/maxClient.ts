import fs from 'node:fs';
import path from 'node:path';
import { chromium, BrowserContext, Page } from 'playwright';
import { AppConfig, MaxChat, MaxMessage } from './types.js';
import { Logger } from './logger.js';
import { hashMessage } from './dedupe.js';
import {
  getChatItems,
  getChatTitle,
  getMessageItems,
  getMessageSender,
  getMessageText,
  getMessageTimestamp,
  openChat,
  sendTextMessage,
} from './selectors.js';

export type NewMessagesHandler = (chat: MaxChat, messages: MaxMessage[]) => Promise<void>;

export class MaxClient {
  private context?: BrowserContext;
  private page?: Page;
  private lockFd?: number;
  private lastPollAt?: string;
  private authorized = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  get isAuthorized(): boolean {
    return this.authorized;
  }

  get lastCheckedAt(): string | undefined {
    return this.lastPollAt;
  }

  async launch(headless = this.config.headless): Promise<void> {
    this.acquireProfileLock();
    fs.mkdirSync(this.config.profileDir, { recursive: true });

    this.context = await chromium.launchPersistentContext(this.config.profileDir, {
      headless,
      viewport: { width: 1400, height: 900 },
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    await this.page.goto(this.config.maxWebUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    this.authorized = await this.detectAuthorized();
  }

  async login(): Promise<void> {
    await this.launch(false);
    this.logger.info('MAX Web opened. Complete login in the visible browser, then stop this command with Ctrl+C.');
  }

  async close(): Promise<void> {
    await this.context?.close().catch((error) => this.logger.warn({ error }, 'Failed to close Playwright context'));
    this.context = undefined;
    this.page = undefined;
    this.releaseProfileLock();
  }

  async pollNewMessages(onNewMessages: NewMessagesHandler): Promise<void> {
    const page = this.requirePage();
    if (!(await this.detectAuthorized())) {
      this.authorized = false;
      throw new Error('MAX Web appears to be logged out. Run npm run login to restore the browser session.');
    }

    const chatItems = await getChatItems(page);
    const chatCount = await chatItems.count();
    for (let index = 0; index < chatCount; index += 1) {
      const chatItem = chatItems.nth(index);
      const title = await getChatTitle(chatItem);
      const key = await this.chatKey(chatItem, title, index);
      const chat: MaxChat = { key, title };
      await openChat(chatItem);
      await page.waitForTimeout(300);

      const messages = await this.readVisibleTextMessages(chat.key);
      await onNewMessages(chat, messages.filter((message) => !message.isOwn));
    }
    this.lastPollAt = new Date().toISOString();
  }

  async sendTextToChat(chatKey: string, text: string): Promise<void> {
    const page = this.requirePage();
    const chatItems = await getChatItems(page);
    const chatCount = await chatItems.count();

    for (let index = 0; index < chatCount; index += 1) {
      const chatItem = chatItems.nth(index);
      const title = await getChatTitle(chatItem);
      const key = await this.chatKey(chatItem, title, index);
      if (key === chatKey) {
        await openChat(chatItem);
        await page.waitForTimeout(300);
        await sendTextMessage(page, text);
        return;
      }
    }

    throw new Error(`MAX chat not found: ${chatKey}`);
  }

  private async readVisibleTextMessages(chatKey: string): Promise<MaxMessage[]> {
    const page = this.requirePage();
    const messageItems = await getMessageItems(page);
    const messageCount = await messageItems.count();
    const messages: MaxMessage[] = [];

    for (let index = 0; index < messageCount; index += 1) {
      const messageItem = messageItems.nth(index);
      const text = await getMessageText(messageItem);
      if (!text) {
        this.logger.debug({ chatKey, index }, 'Unsupported or non-text MAX message skipped');
        continue;
      }

      const sender = await getMessageSender(messageItem);
      const timestamp = await getMessageTimestamp(messageItem);
      const hash = hashMessage([chatKey, sender, text, timestamp || index]);
      messages.push({
        hash,
        chatKey,
        sender,
        text,
        createdAt: timestamp || new Date().toISOString(),
        isOwn: sender.toLowerCase() === 'me',
      });
    }

    return messages;
  }

  private async chatKey(chatItem: import('playwright').Locator, title: string, index: number): Promise<string> {
    const stableId =
      (await chatItem.getAttribute('data-chat-id').catch(() => null)) ??
      (await chatItem.getAttribute('data-testid').catch(() => null)) ??
      (await chatItem.getAttribute('href').catch(() => null));
    return stableId ? `max:${stableId}` : `title:${hashMessage([title, index]).slice(0, 16)}`;
  }

  private async detectAuthorized(): Promise<boolean> {
    const page = this.requirePage();
    const url = page.url();
    const loginVisible = await page
      .locator('input[type="tel"], input[name*="phone"], text=/login|войти|телефон/i')
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false);
    return url.includes(new URL(this.config.maxWebUrl).host) && !loginVisible;
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new Error('MAX Web page is not open');
    }
    return this.page;
  }

  private acquireProfileLock(): void {
    fs.mkdirSync(this.config.profileDir, { recursive: true });
    const lockPath = path.join(this.config.profileDir, 'bridge.lock');
    try {
      this.lockFd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(this.lockFd, `${process.pid}\n`);
    } catch (error) {
      throw new Error(
        `Another bridge instance appears to be using ${this.config.profileDir}. ` +
          `Remove ${lockPath} only if no bridge process is running. Original error: ${(error as Error).message}`
      );
    }
  }

  private releaseProfileLock(): void {
    if (this.lockFd === undefined) return;
    const lockPath = path.join(this.config.profileDir, 'bridge.lock');
    fs.closeSync(this.lockFd);
    this.lockFd = undefined;
    fs.rmSync(lockPath, { force: true });
  }
}
