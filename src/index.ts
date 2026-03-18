import { Bot } from "grammy";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { authMiddleware } from "./telegram/middleware.js";
import { registerHandlers } from "./telegram/handlers.js";
import { initMemory } from "./memory/init.js";
import { getDb } from "./db/client.js";
import { seedFromJson } from "./db/seed.js";
import { getMemoryDir } from "./utils/paths.js";

async function main() {
  logger.info("=== GNB Docs Bot запускается ===");

  if (!config.botToken) {
    logger.error("TELEGRAM_BOT_TOKEN не задан в .env!");
    process.exit(1);
  }

  // Инициализация JSON-based памяти (backward compat)
  initMemory();

  // Инициализация SQLite knowledge base
  try {
    const memDir = getMemoryDir();
    getDb(memDir); // creates DB + tables
    const stats = seedFromJson(memDir); // seed from existing JSON stores
    logger.info({ stats, dbPath: memDir + "/gnb.db" }, "SQLite knowledge base инициализирована");
  } catch (err) {
    logger.warn({ err }, "SQLite init failed — continuing without DB (JSON-only mode)");
  }

  // Создание бота
  const bot = new Bot(config.botToken);

  // Auth middleware — первым
  bot.use(authMiddleware);

  // Регистрация обработчиков
  registerHandlers(bot);

  // Telegram command menu (кнопка слева от поля ввода)
  await bot.api.setMyCommands([
    { command: "new_gnb", description: "Новый ГНБ переход" },
    { command: "review_gnb", description: "Сводка текущего черновика" },
    { command: "review_gnb_debug", description: "Debug mapping review" },
    { command: "cancel", description: "Отменить черновик" },
    { command: "help", description: "Справка" },
  ]);

  // Обработка ошибок
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update?.update_id }, "Ошибка бота");
  });

  // Запуск
  logger.info({ allowedUsers: config.allowedUserIds }, "Бот запущен, жду сообщения...");
  await bot.start({ drop_pending_updates: true });
}

main().catch((err) => {
  logger.error({ err }, "Фатальная ошибка");
  process.exit(1);
});
