import { Bot, Context, InputFile } from "grammy";
import fs from "node:fs";
import path from "node:path";
import { askClaude, ocrDocument } from "../claude.js";
import { readSheet1 } from "../documents/excel.js";
import { getTempDir } from "../utils/paths.js";
import { buildMemoryContext } from "../memory/reader.js";
import { logger } from "../logger.js";

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

export function registerHandlers(bot: Bot): void {
  // === Команды ===

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 Привет! Я GNB Docs Bot — ассистент инженера ПТО.\n\n" +
      "Умею:\n" +
      "• Отвечать на вопросы по ГНБ документации\n" +
      "• Распознавать текст с фото (OCR)\n" +
      "• Читать Excel .xls файлы\n" +
      "• Искать по базе знаний\n\n" +
      "Команды:\n" +
      "/new — новый комплект актов\n" +
      "/help — справка\n\n" +
      "Отправь текст, фото или файл — я помогу!",
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📖 Справка GNB Docs Bot\n\n" +
      "Команды:\n" +
      "/start — приветствие\n" +
      "/new — создать новый комплект актов ГНБ\n" +
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

  bot.command("new", async (ctx) => {
    await ctx.reply(
      "🆕 Создание нового комплекта актов ГНБ\n\n" +
      "Для начала мне понадобятся:\n" +
      "1. Заказчик и объект\n" +
      "2. Номер ГНБ перехода\n\n" +
      "Затем жду документы:\n" +
      "☐ Исполнительная схема (PDF)\n" +
      "☐ Акт осмотра (фото рукописного)\n" +
      "☐ Паспорт трубы (PDF или фото)\n" +
      "☐ Образец акта (Excel прошлого ГНБ) — опционально\n\n" +
      "⚙️ Полный сценарий создания будет в следующей версии.\n" +
      "Пока можешь отправлять документы — я распознаю данные.",
    );
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
        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
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

        const response = await askClaude(prompt, { systemPrompt: getSystemPromptWithMemory() });

        const result = `📊 Данные из ${fileName} (${sheetName}):\n\n${response}`;
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
        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(localPath, buffer);

        await ctx.api.editMessageText(ctx.chat.id, status.message_id, "🔍 Анализирую PDF...");

        const text = await ocrDocument(localPath
        );

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

  // === Текст → Claude ===

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (!text || text.startsWith("/")) return; // команды обработаны выше

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
