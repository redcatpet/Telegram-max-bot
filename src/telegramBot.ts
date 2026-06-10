import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { AppConfig, BridgeStatus, MaxChat, MaxMessage } from './types.js';
import { Storage } from './storage.js';
import { Logger } from './logger.js';

export type SendToMaxHandler = (chatKey: string, text: string) => Promise<void>;
export type StatusProvider = () => BridgeStatus;

export class TelegramBot {
  private readonly bot: Telegraf;

  constructor(
    private readonly config: AppConfig,
    private readonly storage: Storage,
    private readonly logger: Logger,
    private readonly sendToMax: SendToMaxHandler,
    private readonly statusProvider: StatusProvider,
  ) {
    this.bot = new Telegraf(config.telegramBotToken);
    this.registerHandlers();
  }

  async launch(): Promise<void> {
    await this.bot.launch();
    this.logger.info('Telegram bot started');
  }

  async stop(reason = 'shutdown'): Promise<void> {
    this.bot.stop(reason);
  }

  async notify(text: string): Promise<void> {
    await this.bot.telegram.sendMessage(this.config.telegramAllowedUserId, text);
  }

  async forwardMaxMessage(chat: MaxChat, messageFromMax: MaxMessage): Promise<void> {
    const body = [`💬 ${chat.title}`, `👤 ${messageFromMax.sender}`, '', messageFromMax.text].join('\n');
    const sent = await this.bot.telegram.sendMessage(this.config.telegramAllowedUserId, body);
    this.storage.setTelegramMessageId(messageFromMax.hash, sent.message_id);
    this.storage.linkTelegramMessage(sent.message_id, chat.key);
  }

  private registerHandlers(): void {
    this.bot.use(async (ctx, next) => {
      if (!this.isAllowed(ctx)) {
        if (ctx.chat?.type === 'private') {
          await ctx.reply('Нет доступа');
        }
        return;
      }
      await next();
    });

    this.bot.start((ctx) => ctx.reply(this.helpText()));
    this.bot.help((ctx) => ctx.reply(this.helpText()));

    this.bot.command('status', async (ctx) => {
      const status = this.statusProvider();
      await ctx.reply([
        `MAX authorized: ${status.maxAuthorized ? 'yes' : 'no'}`,
        `Bridge running: ${status.running ? 'yes' : 'no'}`,
        `Known chats: ${status.knownChats}`,
        `Last check: ${status.lastPollAt ?? 'never'}`,
        `Active chat: ${status.activeChatTitle ?? status.activeChatKey ?? 'not selected'}`,
      ].join('\n'));
    });

    this.bot.command('chats', async (ctx) => {
      const chats = this.storage.getRecentChats(20);
      if (chats.length === 0) {
        await ctx.reply('Пока нет известных чатов. Дождитесь успешного чтения MAX Web.');
        return;
      }
      await ctx.reply(chats.map((chat, index) => `${index + 1}. ${chat.title}`).join('\n'));
    });

    this.bot.command('chat', async (ctx) => {
      const [, rawNumber] = ctx.message.text.trim().split(/\s+/);
      const selectedIndex = Number(rawNumber) - 1;
      const chats = this.storage.getRecentChats(20);
      const chat = chats[selectedIndex];
      if (!chat) {
        await ctx.reply('Чат не найден. Используйте /chats и затем /chat N.');
        return;
      }
      this.storage.setSetting('active_chat_key', chat.key);
      await ctx.reply(`Активный чат выбран: ${chat.title}`);
    });

    this.bot.on(message('text'), async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;

      const replyToMessageId = ctx.message.reply_to_message?.message_id;
      const targetChatKey = replyToMessageId
        ? this.storage.getChatKeyByTelegramMessageId(replyToMessageId)
        : this.storage.getSetting('active_chat_key');

      if (!targetChatKey) {
        await ctx.reply('Не выбран чат. Ответьте reply на сообщение бота или используйте /chats и /chat N.');
        return;
      }

      try {
        await this.sendToMax(targetChatKey, ctx.message.text);
        const chat = this.storage.getChat(targetChatKey);
        await ctx.reply(`Отправлено в MAX${chat ? `: ${chat.title}` : ''}`);
      } catch (error) {
        this.logger.error({ error, targetChatKey }, 'Failed to send Telegram text to MAX');
        await ctx.reply(`Не удалось отправить сообщение в MAX: ${(error as Error).message}`);
      }
    });
  }

  private isAllowed(ctx: Context): boolean {
    return ctx.chat?.type === 'private' && ctx.from?.id === this.config.telegramAllowedUserId;
  }

  private helpText(): string {
    return [
      'Команды:',
      '/status — состояние моста и MAX Web',
      '/chats — последние известные чаты',
      '/chat N — выбрать активный чат',
      '/help — справка',
      '',
      'Чтобы ответить в MAX, отправьте reply на сообщение бота или выберите активный чат командой /chat N.',
    ].join('\n');
  }
}
