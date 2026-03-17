import { Bot, Context, InputFile } from "grammy";
import fs from "node:fs";
import path from "node:path";
import { askClaude, ocrDocument } from "../claude.js";
import { readSheet1 } from "../documents/excel.js";
import { getTempDir, getMemoryDir } from "../utils/paths.js";
import { buildMemoryContext } from "../memory/reader.js";
import { logger } from "../logger.js";
import type { Transition } from "../domain/types.js";
import type { IntakeStores } from "../intake/intake-types.js";
import { IntakeDraftStore } from "../store/intake-drafts.js";
import { TransitionStore } from "../store/transitions.js";
import { CustomerStore } from "../store/customers.js";
import { PeopleStore } from "../store/people.js";
import { renderInternalActs } from "../renderer/internal-acts.js";
import { renderAosr } from "../renderer/aosr.js";
import { getProjectDir } from "../utils/paths.js";
import {
  startIntake,
  handleIntakeText,
  handleIntakeDocument,
  handleReview,
  cancelIntake,
  hasActiveIntake,
  handleCallback,
  getSessionInfo,
} from "../intake/intake-engine.js";
import type { IntakeResponse, InlineButton } from "../intake/intake-types.js";
import { InlineKeyboard } from "grammy";
import { processTextWithReasoning, shouldUseReasoning } from "../intake/reasoning-handler.js";
import { processKnowledgeIngest, persistIngestResult } from "../db/knowledge-ingest.js";
import { getDb } from "../db/client.js";
import { extractDocument, mapExtractionToFields } from "../intake/doc-extractor.js";

const CLAUDE_SYSTEM = fs.readFileSync(
  path.join(process.cwd(), "CLAUDE.md"),
  "utf-8",
);

function getSystemPromptWithMemory(): string {
  const memory = buildMemoryContext();
  return `${CLAUDE_SYSTEM}\n\n${memory}`;
}

function splitMessage(text: string, maxLen = 4096): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let cut = remaining.lastIndexOf("\n", maxLen);
    if (cut <= 0) cut = maxLen;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return parts;
}

/** Initialize intake stores. */
function initIntakeStores(): IntakeStores {
  const memDir = getMemoryDir();
  return {
    intakeDrafts: new IntakeDraftStore(memDir),
    transitions: new TransitionStore(memDir),
    customers: new CustomerStore(memDir),
    people: new PeopleStore(memDir),
  };
}

/**
 * Render XLSX files from a finalized transition and send via Telegram.
 */
async function renderAndSend(
  ctx: Context,
  transition: Transition,
): Promise<void> {
  const outputDir = path.join(
    getProjectDir(transition.customer, transition.object),
    `ЗП ${transition.gnb_number_short}`,
    "Исполнительная документация",
  );

  const status = await ctx.reply("📝 Генерирую акты...");
  const files: string[] = [];
  const errors: string[] = [];

  try {
    const actsResult = await renderInternalActs(transition, outputDir);
    files.push(actsResult.filePath);
    if (actsResult.warnings.length > 0) {
      logger.warn({ warnings: actsResult.warnings }, "Предупреждения внутренних актов");
    }
  } catch (err) {
    logger.error({ err }, "Ошибка генерации внутренних актов");
    errors.push(`Внутренние акты: ${err instanceof Error ? err.message : "ошибка"}`);
  }

  try {
    const aosrResult = await renderAosr(transition, outputDir);
    files.push(aosrResult.filePath);
    if (aosrResult.warnings.length > 0) {
      logger.warn({ warnings: aosrResult.warnings }, "Предупреждения АОСР");
    }
  } catch (err) {
    logger.error({ err }, "Ошибка генерации АОСР");
    errors.push(`АОСР: ${err instanceof Error ? err.message : "ошибка"}`);
  }

  if (files.length > 0) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      status.message_id,
      `📄 Сгенерировано файлов: ${files.length}`,
    );
    for (const filePath of files) {
      try {
        await ctx.replyWithDocument(new InputFile(filePath), {
          caption: path.basename(filePath),
        });
      } catch (err) {
        logger.error({ err, filePath }, "Ошибка отправки файла");
        errors.push(`Отправка ${path.basename(filePath)}: ${err instanceof Error ? err.message : "ошибка"}`);
      }
    }
  }

  if (errors.length > 0) {
    const errMsg = files.length === 0
      ? `❌ Не удалось сгенерировать файлы:\n${errors.map((e) => `  • ${e}`).join("\n")}\n\nПереход сохранён (ID: ${transition.id}). Можно перегенерировать позже.`
      : `⚠️ Часть файлов не создана:\n${errors.map((e) => `  • ${e}`).join("\n")}`;
    await ctx.reply(errMsg);
  } else if (files.length > 0) {
    await ctx.reply(`✅ Готово: ${files.map((f) => path.basename(f)).join(", ")}`);
  }
}

/** Download Telegram file to temp dir. Returns local path. */
async function downloadTelegramFile(
  bot: Bot,
  fileId: string,
  fileName: string,
): Promise<string> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error("Не удалось получить файл");

  const tempDir = getTempDir();
  fs.mkdirSync(tempDir, { recursive: true });
  const localPath = path.join(tempDir, fileName);

  const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  const response = await fetch(fileUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(localPath, buffer);

  return localPath;
}

/** Build Grammy InlineKeyboard from button rows. */
function buildKeyboard(buttons: InlineButton[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of buttons) {
    for (const btn of row) {
      kb.text(btn.text, btn.callback_data);
    }
    kb.row();
  }
  return kb;
}

/** Send an IntakeResponse, handling buttons and message splitting. */
async function sendIntakeResponse(
  ctx: Context,
  result: IntakeResponse,
): Promise<void> {
  const parts = splitMessage(result.message);
  // Only attach keyboard to last message part
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    if (isLast && result.buttons) {
      await ctx.reply(parts[i], { reply_markup: buildKeyboard(result.buttons) });
    } else {
      await ctx.reply(parts[i]);
    }
  }
}

export function registerHandlers(bot: Bot): void {
  const stores = initIntakeStores();

  // === Commands ===

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Привет! Я GNB Docs Bot — ассистент инженера ПТО.\n\n" +
      "Умею:\n" +
      "• Создавать комплект актов ГНБ (внутренние + АОСР)\n" +
      "• Распознавать документы (PDF, фото, Excel)\n" +
      "• Собирать Паспорт ГНБ из разных источников\n\n" +
      "Команды:\n" +
      "/new_gnb — новый комплект актов\n" +
      "/review_gnb — сводка текущего черновика\n" +
      "/cancel — отменить черновик\n" +
      "/help — справка\n\n" +
      "Отправь текст, фото или файл — я помогу!",
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Справка GNB Docs Bot\n\n" +
      "Команды:\n" +
      "/start — приветствие\n" +
      "/new_gnb — создать новый ГНБ переход\n" +
      "/review_gnb — сводка текущего черновика\n" +
      "/cancel — отменить черновик\n" +
      "/help — эта справка\n\n" +
      "Как работать:\n" +
      "1. /new_gnb → выбрать заказчика, объект, номер\n" +
      "2. Присылать данные: PDF, фото, Excel, текст\n" +
      "3. /review_gnb → проверить что собрано\n" +
      "4. Подтвердить → получить акты\n\n" +
      "Бот извлекает данные из документов автоматически.\n" +
      "Ваши правки всегда приоритетнее.",
    );
  });

  bot.command("new_gnb", async (ctx) => {
    try {
      const result = startIntake(ctx.chat.id, stores);
      await sendIntakeResponse(ctx, result);
    } catch (err) {
      logger.error({ err }, "Ошибка запуска /new_gnb");
      await ctx.reply("Ошибка при запуске нового перехода.");
    }
  });

  bot.command("review_gnb", async (ctx) => {
    try {
      const result = handleReview(ctx.chat.id, stores);
      await sendIntakeResponse(ctx, result);
    } catch (err) {
      logger.error({ err }, "Ошибка /review_gnb");
      await ctx.reply("Ошибка при формировании сводки.");
    }
  });

  bot.command("cancel", async (ctx) => {
    const result = cancelIntake(ctx.chat.id, stores);
    await ctx.reply(result.message);
  });

  // === Callback queries (inline buttons) ===

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      const result = handleCallback(chatId, data, stores);
      if (result) {
        await ctx.answerCallbackQuery();
        await sendIntakeResponse(ctx, result);

        if (result.done && result.transition) {
          await renderAndSend(ctx, result.transition);
        }
      } else {
        await ctx.answerCallbackQuery({ text: "Неизвестное действие" });
      }
    } catch (err) {
      logger.error({ err, data }, "Ошибка callback query");
      await ctx.answerCallbackQuery({ text: "Ошибка" });
    }
  });

  // === Photo → intake or OCR ===

  bot.on("message:photo", async (ctx) => {
    const chatId = ctx.chat.id;

    // If active intake — route to intake pipeline
    if (hasActiveIntake(chatId)) {
      const status = await ctx.reply("🔍 Анализирую фото...");
      try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const localPath = await downloadTelegramFile(bot, photo.file_id, `photo_${Date.now()}.jpg`);

        const result = await handleIntakeDocument(
          chatId, localPath, `photo_${Date.now()}.jpg`, stores, askClaude,
        );

        fs.unlinkSync(localPath);

        if (result) {
          const parts = splitMessage(result.message);
          await ctx.api.editMessageText(chatId, status.message_id, parts[0]);
          for (let i = 1; i < parts.length; i++) await ctx.reply(parts[i]);
          return;
        }
      } catch (err) {
        logger.error({ err }, "Ошибка intake фото");
        await ctx.api.editMessageText(chatId, status.message_id, `❌ Ошибка: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
        return;
      }
    }

    // Fallback: general OCR
    const status = await ctx.reply("⏳ Скачиваю фото...");
    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const localPath = await downloadTelegramFile(bot, photo.file_id, `photo_${Date.now()}.jpg`);

      await ctx.api.editMessageText(chatId, status.message_id, "🔍 Анализирую документ...");
      const text = await ocrDocument(localPath);
      fs.unlinkSync(localPath);

      const parts = splitMessage(`📋 Результат:\n\n${text}`);
      await ctx.api.editMessageText(chatId, status.message_id, parts[0]);
      for (let i = 1; i < parts.length; i++) await ctx.reply(parts[i]);
    } catch (err) {
      logger.error({ err }, "Ошибка OCR");
      await ctx.api.editMessageText(chatId, status.message_id, `❌ Ошибка: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
    }
  });

  // === Documents (PDF, Excel) → intake or general ===

  bot.on("message:document", async (ctx) => {
    const chatId = ctx.chat.id;
    const doc = ctx.message.document;
    const fileName = doc.file_name || "unknown";
    const ext = path.extname(fileName).toLowerCase();

    // If active intake — route to intake pipeline
    if (hasActiveIntake(chatId) && [".pdf", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"].includes(ext)) {
      const status = await ctx.reply(`🔍 Обрабатываю ${fileName}...`);
      try {
        const localPath = await downloadTelegramFile(bot, doc.file_id, fileName);

        const result = await handleIntakeDocument(
          chatId, localPath, fileName, stores, askClaude,
        );

        fs.unlinkSync(localPath);

        if (result) {
          const parts = splitMessage(result.message);
          await ctx.api.editMessageText(chatId, status.message_id, parts[0]);
          for (let i = 1; i < parts.length; i++) await ctx.reply(parts[i]);
          return;
        }
      } catch (err) {
        logger.error({ err }, "Ошибка intake документа");
        await ctx.api.editMessageText(chatId, status.message_id, `❌ Ошибка: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
        return;
      }
    }

    // Knowledge ingest: no active draft, but document could be useful for DB
    if ([".pdf", ".xls", ".xlsx"].includes(ext)) {
      const status = await ctx.reply(`📥 Сохраняю данные из ${fileName}...`);
      try {
        const localPath = await downloadTelegramFile(bot, doc.file_id, fileName);
        const extraction = await extractDocument(localPath, askClaude);

        // Try knowledge ingest via Claude reasoning
        const memDir = getMemoryDir();
        const db = getDb(memDir);
        const ingestResult = await processKnowledgeIngest(
          db, extraction as any, extraction.doc_class, fileName, askClaude,
        );

        fs.unlinkSync(localPath);

        if (ingestResult && ingestResult.missingLinks.length === 0) {
          // All links resolved — persist immediately
          const { documentId } = persistIngestResult(db, ingestResult, localPath);
          await ctx.api.editMessageText(chatId, status.message_id,
            `✅ Сохранено в базу: ${ingestResult.summary}\nID: ${documentId}`);
          return;
        } else if (ingestResult && ingestResult.questionsForOwner.length > 0) {
          // Missing links — ask owner
          await ctx.api.editMessageText(chatId, status.message_id,
            `📎 ${ingestResult.summary}\n\n❓ ${ingestResult.questionsForOwner.join("\n❓ ")}`);
          return;
        } else if (ingestResult) {
          await ctx.api.editMessageText(chatId, status.message_id,
            `📎 ${ingestResult.summary}\nДля сохранения в базу начните /new_gnb.`);
          return;
        }

        // Ingest failed — fall through to general handler
        await ctx.api.editMessageText(chatId, status.message_id,
          `📎 Получен ${fileName}. Для работы с документом начните /new_gnb.`);
        return;
      } catch (err) {
        logger.error({ err }, "Knowledge ingest error");
        // Fall through to general handler
      }
    }

    // Fallback: general document handling
    if (ext === ".xls" || ext === ".xlsx") {
      const status = await ctx.reply(`⏳ Скачиваю ${fileName}...`);
      try {
        const localPath = await downloadTelegramFile(bot, doc.file_id, fileName);
        await ctx.api.editMessageText(chatId, status.message_id, "📊 Читаю Excel...");

        const { sheetName, text } = readSheet1(localPath);
        fs.unlinkSync(localPath);

        const prompt =
          `Ниже — данные из Excel-файла "${fileName}", лист "${sheetName}".\n` +
          `Каждая строка в формате "R<номер>: ячейка1 | ячейка2 | ..."\n\n` +
          `${text}\n\n` +
          `Извлеки ключевые данные из этого акта ГНБ. Формат: каждое поле на новой строке "Поле: значение".`;

        const claudeResp = await askClaude(prompt, { systemPrompt: getSystemPromptWithMemory() });
        const result = `📊 Данные из ${fileName} (${sheetName}):\n\n${claudeResp}`;
        const parts = splitMessage(result);
        await ctx.api.editMessageText(chatId, status.message_id, parts[0]);
        for (let i = 1; i < parts.length; i++) await ctx.reply(parts[i]);
      } catch (err) {
        logger.error({ err }, "Ошибка чтения Excel");
        await ctx.api.editMessageText(chatId, status.message_id, `❌ Ошибка: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
      }
    } else if (ext === ".pdf") {
      const status = await ctx.reply(`⏳ Скачиваю ${fileName}...`);
      try {
        const localPath = await downloadTelegramFile(bot, doc.file_id, fileName);
        await ctx.api.editMessageText(chatId, status.message_id, "🔍 Анализирую PDF...");

        const text = await ocrDocument(localPath);
        fs.unlinkSync(localPath);

        const parts = splitMessage(`📄 Данные из ${fileName}:\n\n${text}`);
        await ctx.api.editMessageText(chatId, status.message_id, parts[0]);
        for (let i = 1; i < parts.length; i++) await ctx.reply(parts[i]);
      } catch (err) {
        logger.error({ err }, "Ошибка обработки PDF");
        await ctx.api.editMessageText(chatId, status.message_id, `❌ Ошибка: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
      }
    } else {
      await ctx.reply(`📎 Получен файл: ${fileName}\nПоддерживаются: .xls, .xlsx, .pdf`);
    }
  });

  // === Text → intake engine or Claude ===

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (!text || text.startsWith("/")) return;

    const chatId = ctx.chat.id;

    // Check for active intake session
    try {
      const sessionInfo = getSessionInfo(chatId);

      // Collecting state → async reasoning-first path
      if (sessionInfo.state === "collecting" && sessionInfo.draftId) {
        const memDir = getMemoryDir();
        const result = await processTextWithReasoning(
          chatId, text, sessionInfo.draftId, stores, memDir,
          sessionInfo.objectId, askClaude,
        );
        if (result) {
          await sendIntakeResponse(ctx, {
            ...result.response,
            buttons: result.response.buttons,
          });
          return;
        }
      }

      // Other states (customer, object, gnb_number, etc.) → sync handler
      const intakeResult = handleIntakeText(chatId, text, stores);
      if (intakeResult) {
        await sendIntakeResponse(ctx, intakeResult);

        if (intakeResult.done && intakeResult.transition) {
          await renderAndSend(ctx, intakeResult.transition);
        }

        return;
      }
    } catch (err) {
      logger.error({ err }, "Ошибка intake engine");
      await ctx.reply("Ошибка в процессе создания перехода. Попробуйте /cancel и начните заново.");
      return;
    }

    // No active intake — fall through to Claude
    const status = await ctx.reply("⏳ Думаю...");
    try {
      const response = await askClaude(text, { systemPrompt: getSystemPromptWithMemory() });
      const parts = splitMessage(response);
      await ctx.api.editMessageText(chatId, status.message_id, parts[0]);
      for (let i = 1; i < parts.length; i++) await ctx.reply(parts[i]);
    } catch (err) {
      logger.error({ err }, "Ошибка Claude");
      await ctx.api.editMessageText(chatId, status.message_id, `❌ Ошибка: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
    }
  });
}
