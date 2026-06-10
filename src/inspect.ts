import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const outputDir = path.resolve('./inspect-output');

fs.mkdirSync(outputDir, { recursive: true });

const context = await chromium.launchPersistentContext(config.profileDir, {
  headless: config.headless,
  viewport: { width: 1400, height: 900 },
});

try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(config.maxWebUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page.screenshot({ path: path.join(outputDir, 'screenshot.png'), fullPage: true });
  fs.writeFileSync(path.join(outputDir, 'page.html'), await page.content());
  logger.info({ outputDir }, 'Saved MAX Web screenshot and HTML for selector inspection');
} finally {
  await context.close();
}
