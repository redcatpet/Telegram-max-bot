export type BridgeMode = 'login' | 'start';

export interface AppConfig {
  telegramBotToken: string;
  telegramAllowedUserId: number;
  maxWebUrl: string;
  headless: boolean;
  pollIntervalMs: number;
  logLevel: string;
  databasePath: string;
  profileDir: string;
}

export interface MaxChat {
  key: string;
  title: string;
}

export interface MaxMessage {
  hash: string;
  chatKey: string;
  sender: string;
  text: string;
  createdAt: string;
  isOwn?: boolean;
}

export interface BridgeStatus {
  maxAuthorized: boolean;
  knownChats: number;
  lastPollAt?: string;
  activeChatKey?: string;
  activeChatTitle?: string;
  running: boolean;
}

export interface UnsupportedMaxItem {
  chatKey: string;
  reason: string;
}
