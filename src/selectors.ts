import { Locator, Page } from 'playwright';

const CHAT_ITEM_SELECTORS = [
  // TODO(MAX selectors): replace with stable MAX Web chat-list item locators.
  '[data-testid="chat-item"]',
  '[role="listitem"]:has-text("")',
];

const MESSAGE_ITEM_SELECTORS = [
  // TODO(MAX selectors): replace with stable MAX Web message item locators.
  '[data-testid="message"]',
  '[role="listitem"]:has-text("")',
];

const MESSAGE_TEXT_SELECTORS = [
  // TODO(MAX selectors): replace with stable MAX Web message text locators.
  '[data-testid="message-text"]',
  '.message-text',
];

const MESSAGE_SENDER_SELECTORS = [
  // TODO(MAX selectors): replace with stable MAX Web sender locators.
  '[data-testid="message-sender"]',
  '.message-sender',
];

const MESSAGE_TIMESTAMP_SELECTORS = [
  // TODO(MAX selectors): replace with stable MAX Web timestamp locators.
  'time',
  '[data-testid="message-time"]',
];

const INPUT_SELECTORS = [
  // TODO(MAX selectors): replace with stable MAX Web composer input locators.
  '[contenteditable="true"]',
  'textarea',
  '[data-testid="message-input"]',
];

function selectorTodo(area: string): Error {
  return new Error(
    `MAX Web DOM selector is not configured for ${area}. ` +
      'Open `npm run inspect`, review inspect-output/page.html and screenshot.png, ' +
      'then update src/selectors.ts with stable locator-based selectors.'
  );
}

async function firstExisting(base: Page | Locator, selectors: string[], area: string): Promise<Locator> {
  for (const selector of selectors) {
    const locator = base.locator(selector);
    if ((await locator.count().catch(() => 0)) > 0) {
      return locator;
    }
  }
  throw selectorTodo(area);
}

export async function getChatItems(page: Page): Promise<Locator> {
  return firstExisting(page, CHAT_ITEM_SELECTORS, 'chat list items');
}

export async function getChatTitle(chatItem: Locator): Promise<string> {
  const explicitTitle = chatItem.locator('[data-testid="chat-title"], .chat-title').first();
  if ((await explicitTitle.count().catch(() => 0)) > 0) {
    const title = (await explicitTitle.innerText()).trim();
    if (title) return title;
  }

  const title = (await chatItem.innerText()).split('\n').map((line) => line.trim()).find(Boolean);
  if (!title) throw selectorTodo('chat title');
  return title;
}

export async function openChat(chatItem: Locator): Promise<void> {
  await chatItem.click();
}

export async function getMessageItems(page: Page): Promise<Locator> {
  return firstExisting(page, MESSAGE_ITEM_SELECTORS, 'message items');
}

export async function getMessageText(messageItem: Locator): Promise<string | undefined> {
  for (const selector of MESSAGE_TEXT_SELECTORS) {
    const textLocator = messageItem.locator(selector).first();
    if ((await textLocator.count().catch(() => 0)) > 0) {
      const text = (await textLocator.innerText()).trim();
      return text || undefined;
    }
  }

  const fallback = (await messageItem.innerText().catch(() => '')).trim();
  return fallback || undefined;
}

export async function getMessageSender(messageItem: Locator): Promise<string> {
  for (const selector of MESSAGE_SENDER_SELECTORS) {
    const senderLocator = messageItem.locator(selector).first();
    if ((await senderLocator.count().catch(() => 0)) > 0) {
      const sender = (await senderLocator.innerText()).trim();
      if (sender) return sender;
    }
  }

  const ownMarkers = ['data-own', 'data-outgoing', 'aria-label'];
  for (const attr of ownMarkers) {
    const value = await messageItem.getAttribute(attr).catch(() => null);
    if (value?.toLowerCase().includes('outgoing') || value?.toLowerCase().includes('own')) {
      return 'me';
    }
  }

  return 'unknown';
}

export async function getMessageTimestamp(messageItem: Locator): Promise<string> {
  for (const selector of MESSAGE_TIMESTAMP_SELECTORS) {
    const timestampLocator = messageItem.locator(selector).first();
    if ((await timestampLocator.count().catch(() => 0)) > 0) {
      const datetime = await timestampLocator.getAttribute('datetime');
      if (datetime) return datetime;
      const text = (await timestampLocator.innerText()).trim();
      if (text) return text;
    }
  }

  const position = await messageItem.evaluate((node) => {
    const parent = node.parentElement;
    return parent ? Array.from(parent.children).indexOf(node) : -1;
  });
  return `visible-position:${position}`;
}

export async function getInput(page: Page): Promise<Locator> {
  const input = (await firstExisting(page, INPUT_SELECTORS, 'message input')).first();
  const visible = await input.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    throw selectorTodo('visible message input');
  }
  return input;
}

export async function sendTextMessage(page: Page, text: string): Promise<void> {
  const input = await getInput(page);
  await input.click();
  await input.fill(text).catch(async () => {
    await page.keyboard.insertText(text);
  });
  await page.keyboard.press('Enter');
}
