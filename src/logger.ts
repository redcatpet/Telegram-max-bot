import pino from 'pino';

export function createLogger(level = 'info') {
  return pino({
    level,
    redact: {
      paths: [
        'telegramBotToken',
        'token',
        '*.token',
        'cookies',
        'localStorage',
        'profileDirContents',
      ],
      censor: '[redacted]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
