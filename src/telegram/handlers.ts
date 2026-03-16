import { Bot, Context, InputFile } from "grammy";
import fs from "node:fs";
import path from "node:path";
import { askClaude, ocrDocument } from "../claude.js";
import { readSheet1 } from "../documents/excel.js";
import { getTempDir, getMemoryDir } from "../utils/paths.js";
import { buildMemoryContext } from "../memory/reader.js";
import { logger } from "../logger.js";
import { startFlow, handleInput as flowHandleInput, getActiveDraft } from "../flow/new-flow.js";
import type { FlowStores, FlowResponse } from "../flow/flow-types.js";
import type { Transition } from "../domain/types.js";
import { DraftStore } from "../store/drafts.js";
import { TransitionStore } from "../store/transitions.js";
import { CustomerStore } from "../store/customers.js";
import { PeopleStore } from "../store/people.js";
import { renderInternalActs } from "../renderer/internal-acts.js";
import { renderAosr } from "../renderer/aosr.js";
import { getProjectDir } from "../utils/paths.js";

const CLAUDE_SYSTEM = fs.readFileSync(
  path.join(process.cwd(), "CLAUDE.md"),
  "utf-8",
);

// Собирает system prompt + актуальный контекст из .gnb-memory
function getSystemPromptWithMemory(): string {
  const memory = buildMemoryContext();
  return `${CLAUDE_SYSTEM}\n\n${memory}`;
}

// Разбить длинное сообщение на части по 4096 символов
function splitMessage(text: string, maxLen = 4096): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    // Ищем последний перенос строки в пределах лимита
    let cut = remaining.lastIndexOf("\n", maxLen);
    if (cut <= 0) cut = maxLen;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return parts;
}

/** Initialize stores once per bot lifetime. */
function initStores(): FlowStores {
  const memDir = getMemoryDir();
  return {
    drafts: new DraftStore(memDir),
    transitions: new TransitionStore(memDir),
    customers: new CustomerStore(memDir),
    people: new PeopleStore(memDir),
  };
}

/**
 * Render XLSX files from a finalized transition and send via Telegram.
 * Does not throw — logs errors and sends error message to user.
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

  // Internal acts
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

  // АОСР
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

  // Send generated files
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

export function registerHandlers(bot: Bot): void {
  const stores = initStores();

  // === Команды ===

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Привет! Я GNB Docs Bot — ассистент инженера ПТО.\n\n" +
      "Умею:\n" +
      "• Создавать комплект актов ГНБ (внутренние + АОСР)\n" +
      "• Отвечать на вопросы по ГНБ документации\n" +
      "• Распознавать текст с фото (OCR)\n" +
      "• Читать Excel .xls файлы\n\n" +
      "Команды:\n" +
      "/new_gnb — новый комплект актов\n" +
      "/cancel — отменить текущий черновик\n" +
      "/help — справка\n\n" +
      "Отправь текст, фото или файл — я помогу!",
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Справка GNB Docs Bot\n\n" +
      "Команды:\n" +
      "/start — приветствие\n" +
      "/new_gnb — создать новый комплект актов ГНБ\n" +
      "/cancel — отменить текущий черновик\n" +
      "/help — эта справка\n\n" +
      "Что можно отправить:\n" +
      "• Текст — задать вопрос или дать команду\n" +
      "• Фото — распознать текст (OCR)\n" +
      "• Excel .xls — прочитать данные с Лист1\n\n" +
      "Примеры вопросов:\n" +
      "• «Кто технадзор в 3 районе?»\n" +
      "• «Какая длина у ГНБ 11-11?»\n" +
      "• «Запомни телефон Байдакова +7 916 ...»",
    );
  });

  bot.command("new_gnb", async (ctx) => {
    try {
      const result = startFlow(ctx.chat.id, stores);
      const parts = splitMessage(result.message);
      for (const part of parts) {
        await ctx.reply(part);
      }
    } catch (err) {
      logger.error({ err }, "Ошибка запуска /new_gnb flow");
      await ctx.reply("Ошибка при запуске нового перехода.");
    }
  });

  bot.command("cancel", async (ctx) => {
    const draft = getActiveDraft(ctx.chat.id, stores);
    if (draft) {
      stores.drafts.delete(draft.id);
      await ctx.reply("Черновик отменён.");
    } else {
      await ctx.reply("Нет активного черновика.");
    }
  });

  // === Фото → OCR ===

  bot.on("message:photo", async (ctx) => {
    const status = await ctx.reply("⏳ Скачиваю фото...");

    try {
      // Берём фото максимального размера
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.api.getFile(photo.file_id);

      if (!file.file_path) {
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, "❌ Не удалось получить файл");
        return;
      }

      // Скачиваем
      const tempDir = getTempDir();
      fs.mkdirSync(tempDir, { recursive: true });
      const localPath = path.join(tempDir, `photo_${Date.now()}.jpg`);

      const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(localPath, buffer);

      await ctx.api.editMessageText(ctx.chat.id, status.message_id, "🔍 Анализирую документ...");

      // OCR с автоопределением типа документа
      const text = await ocrDocument(localPath);

      // Удаляем temp файл
      fs.unlinkSync(localPath);

      // Отправляем результат
      const parts = splitMessage(`📋 Результат:\n\n${text}`);
      await ctx.api.editMessageText(ctx.chat.id, status.message_id, parts[0]);
      for (let i = 1; i < parts.length; i++) {
        await ctx.reply(parts[i]);
      }
    } catch (err) {
      logger.error({ err }, "Ошибка OCR");
      await ctx.api.editMessageText(
        ctx.chat.id, status.message_id,
        `❌ Ошибка при распознавании: ${err instanceof Error ? err.message : "неизвестная ошибка"}`,
      );
    }
  });

  // === Документы (Excel .xls) ===

  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    const fileName = doc.file_name || "unknown";
    const ext = path.extname(fileName).toLowerCase();

    // Обработка .xls файлов
    if (ext === ".xls" || ext === ".xlsx") {
      const status = await ctx.reply(`⏳ Скачиваю ${fileName}...`);

      try {
        const file = await ctx.api.getFile(doc.file_id);
        if (!file.file_path) {
          await ctx.api.editMessageText(ctx.chat.id, status.message_id, "❌ Не удалось получить файл");
          return;
        }

        const tempDir = getTempDir();
        fs.mkdirSync(tempDir, { recursive: true });
        const localPath = path.join(tempDir, fileName);

        const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
        const dlResp = await fetch(fileUrl);
        const buffer = Buffer.from(await dlResp.arrayBuffer());
        fs.writeFileSync(localPath, buffer);

        await ctx.api.editMessageText(ctx.chat.id, status.message_id, "📊 Читаю Excel...");

        const { sheetName, text } = readSheet1(localPath);

        // Удаляем temp файл
        fs.unlinkSync(localPath);

        // Отправляем данные Claude для умного извлечения
        const prompt =
          `Ниже — данные из Excel-файла "${fileName}", лист "${sheetName}".\n` +
          `Каждая строка в формате "R<номер>: ячейка1 | ячейка2 | ..."\n\n` +
          `${text}\n\n` +
          `Извлеки и покажи ключевые данные из этого акта ГНБ:\n` +
          `- Наименование объекта\n` +
          `- Адрес\n` +
          `- Заказчик, Генподрядчик, Субподрядчик\n` +
          `- Номер перехода ГНБ\n` +
          `- Номер/шифр проекта\n` +
          `- Дата начала и окончания работ\n` +
          `- Марка трубы, диаметр, длина\n` +
          `- Исполнитель\n` +
          `- Другие важные данные, если есть\n\n` +
          `Формат: каждое поле на новой строке "Поле: значение". Только факты, без пояснений.`;

        const claudeResp = await askClaude(prompt, { systemPrompt: getSystemPromptWithMemory() });

        const result = `📊 Данные из ${fileName} (${sheetName}):\n\n${claudeResp}`;
        const parts = splitMessage(result);
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, parts[0]);
        for (let i = 1; i < parts.length; i++) {
          await ctx.reply(parts[i]);
        }
      } catch (err) {
        logger.error({ err }, "Ошибка чтения Excel");
        await ctx.api.editMessageText(
          ctx.chat.id, status.message_id,
          `❌ Ошибка чтения Excel: ${err instanceof Error ? err.message : "неизвестная ошибка"}`,
        );
      }
    } else if (ext === ".pdf") {
      // PDF → OCR через Claude CLI
      const status = await ctx.reply(`⏳ Скачиваю ${fileName}...`);

      try {
        const file = await ctx.api.getFile(doc.file_id);
        if (!file.file_path) {
          await ctx.api.editMessageText(ctx.chat.id, status.message_id, "❌ Не удалось получить файл");
          return;
        }

        const tempDir = getTempDir();
        fs.mkdirSync(tempDir, { recursive: true });
        const localPath = path.join(tempDir, fileName);

        const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
        const dlResp2 = await fetch(fileUrl);
        const buffer = Buffer.from(await dlResp2.arrayBuffer());
        fs.writeFileSync(localPath, buffer);

        await ctx.api.editMessageText(ctx.chat.id, status.message_id, "🔍 Анализирую PDF...");

        const text = await ocrDocument(localPath);

        fs.unlinkSync(localPath);

        const parts = splitMessage(`📄 Данные из ${fileName}:\n\n${text}`);
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, parts[0]);
        for (let i = 1; i < parts.length; i++) {
          await ctx.reply(parts[i]);
        }
      } catch (err) {
        logger.error({ err }, "Ошибка обработки PDF");
        await ctx.api.editMessageText(
          ctx.chat.id, status.message_id,
          `❌ Ошибка обработки PDF: ${err instanceof Error ? err.message : "неизвестная ошибка"}`,
        );
      }
    } else {
      await ctx.reply(`📎 Получен файл: ${fileName}\nПоддерживаются: .xls, .xlsx, .pdf`);
    }
  });

  // === Текст → Flow engine or Claude ===

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (!text || text.startsWith("/")) return; // команды обработаны выше

    // Check for active /new_gnb flow — route to flow engine
    try {
      const flowResult = flowHandleInput(ctx.chat.id, text, stores);
      if (flowResult) {
        const parts = splitMessage(flowResult.message);
        for (const part of parts) {
          await ctx.reply(part);
        }

        // If flow finalized with a transition, render files
        if (flowResult.done && flowResult.transition) {
          await renderAndSend(ctx, flowResult.transition);
        }

        return; // handled by flow
      }
    } catch (err) {
      logger.error({ err }, "Ошибка flow engine");
      await ctx.reply("Ошибка в процессе создания перехода. Попробуйте /cancel и начните заново.");
      return;
    }

    // No active flow — fall through to Claude
    const status = await ctx.reply("⏳ Думаю...");

    try {
      const response = await askClaude(text, { systemPrompt: getSystemPromptWithMemory() });

      const parts = splitMessage(response);
      await ctx.api.editMessageText(ctx.chat.id, status.message_id, parts[0]);
      for (let i = 1; i < parts.length; i++) {
        await ctx.reply(parts[i]);
      }
    } catch (err) {
      logger.error({ err }, "Ошибка Claude");
      await ctx.api.editMessageText(
        ctx.chat.id, status.message_id,
        `❌ Ошибка: ${err instanceof Error ? err.message : "неизвестная ошибка"}`,
      );
    }
  });
}
