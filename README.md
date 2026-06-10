# Telegram ↔ MAX Web Bridge

Node.js + TypeScript MVP-мост между MAX Web и приватным Telegram-ботом. Проект не использует неофициальные API MAX, не реверсит приватные запросы и работает только через Playwright как обычный браузер.

## Возможности MVP

- Читает новые видимые текстовые сообщения из MAX Web через Playwright.
- Пересылает их в Telegram выбранному пользователю.
- Отправляет текстовые ответы обратно в MAX:
  - через reply на сообщение бота;
  - через активный чат, выбранный командой `/chat N`.
- Хранит чаты, сообщения, связи Telegram↔MAX и настройки в SQLite.
- Файлы, голосовые, картинки, реакции и звонки не реализованы: такие элементы логируются как unsupported/non-text.

## Ограничения

Реальные селекторы MAX Web заранее неизвестны и могут меняться. Вся работа с DOM вынесена в `src/selectors.ts`. Если бот падает с ошибкой про селекторы, запустите `npm run inspect`, изучите `inspect-output/page.html` и `inspect-output/screenshot.png`, затем обновите locator-based функции в `src/selectors.ts`.

## Установка

```bash
npm install
cp .env.example .env
```

## Как создать Telegram-бота

1. Откройте Telegram и найдите `@BotFather`.
2. Выполните команду `/newbot`.
3. Задайте имя и username бота.
4. Скопируйте выданный токен в `TELEGRAM_BOT_TOKEN` в `.env`.

## Как узнать свой Telegram user ID

Самый простой способ — написать боту `@userinfobot` или аналогичному справочному боту и скопировать числовой `Id`. Укажите это значение в `TELEGRAM_ALLOWED_USER_ID`.

Бот принимает команды и сообщения только если одновременно выполняются условия:

- `ctx.from.id === TELEGRAM_ALLOWED_USER_ID`;
- `chat.type === "private"`.

Другим пользователям в приватном чате бот отвечает `Нет доступа`.

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните значения:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
MAX_WEB_URL=https://web.max.ru
HEADLESS=false
POLL_INTERVAL_MS=3000
LOG_LEVEL=info
DATABASE_PATH=./data/bridge.sqlite
```

`MAX_WEB_URL` по умолчанию — `https://web.max.ru`.

## Первый логин в MAX Web

```bash
npm run login
```

Команда откроет Chromium в видимом режиме через `chromium.launchPersistentContext('./max-profile', ...)`. Войдите в MAX вручную. Сессия сохранится в `./max-profile`. После успешного входа остановите команду `Ctrl+C`.

Не запускайте несколько экземпляров Playwright с одной и той же папкой `max-profile`. Проект создает lock-файл `max-profile/bridge.lock` и остановится, если профиль уже используется.

## Запуск моста

Обычный запуск:

```bash
npm run start
```

Headless-запуск:

```bash
npm run start:headless
```

Команды Telegram:

- `/status` — состояние MAX, количество известных чатов, время последней проверки, активный чат;
- `/chats` — последние известные чаты с номерами;
- `/chat N` — выбрать активный чат;
- `/help` — справка.

Чтобы ответить в MAX, отправьте reply на пересланное сообщение бота. Если выбран активный чат, обычные текстовые сообщения без reply отправляются в него.

## Инспекция селекторов

```bash
npm run inspect
```

Команда откроет MAX Web и сохранит:

- `inspect-output/screenshot.png`;
- `inspect-output/page.html`.

Используйте эти файлы, чтобы заполнить TODO в `src/selectors.ts`. Изменяйте именно locator-based функции:

- `getChatItems(page)`;
- `getChatTitle(chatItem)`;
- `openChat(chatItem)`;
- `getMessageItems(page)`;
- `getMessageText(messageItem)`;
- `getMessageSender(messageItem)`;
- `getMessageTimestamp(messageItem)`;
- `getInput(page)`;
- `sendTextMessage(page, text)`.

## SQLite

По умолчанию база находится в `./data/bridge.sqlite`. При старте создаются таблицы:

- `chats(max_chat_key, title, last_seen_message_hash, updated_at)`;
- `messages(max_message_hash, max_chat_key, sender, text, created_at, telegram_message_id)`;
- `telegram_links(telegram_message_id, max_chat_key, created_at)`;
- `settings(key, value)`.

Дедупликация сообщений выполняется через SHA-256 hash от `max_chat_key + sender + text + timestamp_or_position`.

## Запуск через systemd

Создайте unit-файл, например `/etc/systemd/system/telegram-max-bridge.service`:

```ini
[Unit]
Description=Telegram MAX Web Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/telegram-max-bridge
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start:headless
Restart=on-failure
RestartSec=10
User=telegram-max
Group=telegram-max

[Install]
WantedBy=multi-user.target
```

Затем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable telegram-max-bridge
sudo systemctl start telegram-max-bridge
sudo journalctl -u telegram-max-bridge -f
```

## Риски безопасности

- Доступ к VPS фактически дает возможность управлять мостом и читать пересылаемые сообщения.
- Доступ к папке `max-profile` фактически дает доступ к браузерной сессии MAX.
- Никогда не коммитьте `.env`, `max-profile/`, `data/`, `logs/`.
- Не логируйте и не публикуйте токены, cookies, localStorage и содержимое профиля браузера.
- Ограничьте права на директорию проекта и запускайте сервис отдельным пользователем.

## Если MAX поменял верстку

1. Остановите мост.
2. Запустите `npm run inspect`.
3. Найдите новые стабильные DOM-признаки для списка чатов, сообщений и поля ввода.
4. Обновите функции в `src/selectors.ts`.
5. Выполните `npm run build`.
6. Запустите мост снова.
