import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { MaxClient } from './maxClient.js';
import { Storage } from './storage.js';
import { TelegramBot } from './telegramBot.js';

const mode = process.argv[2] ?? 'start';
const config = loadConfig();
const logger = createLogger(config.logLevel);
const storage = new Storage(config.databasePath);
const maxClient = new MaxClient(config, logger);
let telegramBot: TelegramBot | undefined;
let running = false;

async function shutdown(reason: string): Promise<void> {
  running = false;
  logger.info({ reason }, 'Shutting down');
  await telegramBot?.stop(reason);
  await maxClient.close();
  storage.close();
}

process.once('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));

async function runLogin(): Promise<void> {
  await maxClient.login();
  await new Promise(() => undefined);
}

async function runBridge(): Promise<void> {
  running = true;
  await maxClient.launch(config.headless);

  telegramBot = new TelegramBot(
    config,
    storage,
    logger,
    (chatKey, text) => maxClient.sendTextToChat(chatKey, text),
    () => {
      const activeChatKey = storage.getSetting('active_chat_key');
      const activeChat = activeChatKey ? storage.getChat(activeChatKey) : undefined;
      return {
        maxAuthorized: maxClient.isAuthorized,
        knownChats: storage.countChats(),
        lastPollAt: maxClient.lastCheckedAt,
        activeChatKey,
        activeChatTitle: activeChat?.title,
        running,
      };
    },
  );
  await telegramBot.launch();

  while (running) {
    try {
      await maxClient.pollNewMessages(async (chat, messages) => {
        storage.upsertChat(chat, messages.at(-1)?.hash);
        for (const maxMessage of messages) {
          if (!storage.insertMessage(maxMessage)) continue;
          await telegramBot?.forwardMaxMessage(chat, maxMessage);
        }
      });
    } catch (error) {
      logger.error({ error }, 'Polling MAX Web failed');
      const text = `MAX bridge stopped: ${(error as Error).message}`;
      await telegramBot?.notify(text).catch((telegramError) => {
        logger.error({ error: telegramError }, 'Failed to notify Telegram about MAX bridge stop');
      });
      running = false;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }

  await shutdown('bridge stopped');
}

if (mode === 'login') {
  await runLogin();
} else if (mode === 'start') {
  await runBridge();
} else {
  throw new Error(`Unknown command mode: ${mode}. Use "login" or "start".`);
}
