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
  handleDebugReview,
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
import { createRepos } from "../db/repositories.js";
import { getObjectProfile } from "../db/retrieval.js";
import { extractDocument, mapExtractionToFields } from "../intake/doc-extractor.js";
import type { KnowledgeIngestOutput, IngestDocKind } from "../db/reasoning-contracts.js";
import {
  getIngestSession,
  setIngestSession,
  clearIngestSession,
  hasActiveIngestSession,
  isSaveTrigger,
  handleIngestTextAnswer,
  buildQuestionsResponse,
  buildPersistedResponse,
  buildFailedResponse,
  type IngestResponse,
} from "../intake/ingest-session.js";
import {
  buildStoragePlan as buildTransitionStoragePlan,
  placeDocument,
  ensureStorageDirs,
  buildPlacementReport,
  type TransitionStoragePlan,
  type PlacementRecord,
} from "../storage/placement.js";
import { buildStorageFileName, extractExtension } from "../storage/document-naming.js";

const CLAUDE_SYSTEM = fs.readFileSync(
  path.join(process.cwd(), "CLAUDE.md"),
  "utf-8",
);

function getSystemPromptWithMemory(): string {
  const memory = buildMemoryContext();
  return `${CLAUDE_SYSTEM}\n\n${memory}`;
}

/**
 * Strip markdown formatting that Telegram plain-text mode doesn't render.
 * Converts: **bold** → bold, ```code``` → code, `inline` → inline, ### headings → headings
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```\w*\n?/, "").replace(/\n?```$/, "")) // code blocks → plain
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")  // ***bold italic***
    .replace(/\*\*(.+?)\*\*/g, "$1")      // **bold**
    .replace(/\*(.+?)\*/g, "$1")          // *italic*
    .replace(/`(.+?)`/g, "$1")            // `inline code`
    .replace(/^#{1,6}\s+/gm, "");         // ### headings
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
 * Also ensures the full transition storage structure exists.
 */
async function renderAndSend(
  ctx: Context,
  transition: Transition,
): Promise<void> {
  // Build storage plan and ensure all dirs exist
  const storagePlan = buildTransitionStoragePlan(
    transition.customer,
    transition.object,
    transition.gnb_number_short,
  );
  ensureStorageDirs(storagePlan);

  const outputDir = storagePlan.execDocsDir;

  const status = await ctx.reply("\uD83D\uDCDD Генерирую акты...");
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
      `\uD83D\uDCC4 Сгенерировано файлов: ${files.length}`,
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
      ? `\u274C Не удалось сгенерировать файлы:\n${errors.map((e) => `  \u2022 ${e}`).join("\n")}\n\nПереход сохранён (ID: ${transition.id}). Можно перегенерировать позже.`
      : `\u26A0\uFE0F Часть файлов не создана:\n${errors.map((e) => `  \u2022 ${e}`).join("\n")}`;
    await ctx.reply(errMsg);
  } else if (files.length > 0) {
    // Report storage placement
    const placementLines: string[] = [];
    for (const f of files) {
      placementLines.push(`  ${path.basename(f)} \u2192 Исполнительная документация/`);
    }
    await ctx.reply(
      `\u2705 Готово: ${files.map((f) => path.basename(f)).join(", ")}\n\n` +
      `\uD83D\uDCC1 Документы размещены:\n${placementLines.join("\n")}`,
    );
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
  const parts = splitMessage(stripMarkdown(result.message));
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

/** Send an IngestResponse with optional keyboard. */
async function sendIngestResponse(
  ctx: Context,
  result: IngestResponse,
): Promise<void> {
  const parts = splitMessage(stripMarkdown(result.message));
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    if (isLast && result.buttons) {
      await ctx.reply(parts[i], { reply_markup: buildKeyboard(result.buttons) });
    } else {
      await ctx.reply(parts[i]);
    }
  }
}

/**
 * Run standalone knowledge ingest for a document file.
 * Downloads, extracts, calls Claude reasoning, handles session.
 */
async function runStandaloneIngest(
  ctx: Context,
  bot: Bot,
  fileId: string,
  fileName: string,
  statusMsgId: number,
): Promise<void> {
  const chatId = ctx.chat!.id;
  try {
    const localPath = await downloadTelegramFile(bot, fileId, fileName);
    const extraction = await extractDocument(localPath, askClaude);

    const memDir = getMemoryDir();
    const db = getDb(memDir);
    const ingestResult = await processKnowledgeIngest(
      db, extraction as any, extraction.doc_class, fileName, askClaude,
    );

    if (ingestResult && ingestResult.missingLinks.length === 0 && ingestResult.questionsForOwner.length === 0) {
      // All links resolved — persist immediately
      const { documentId } = persistIngestResult(db, ingestResult, localPath);

      // Place document into storage if object/transition context is known
      const placementMsg = placeIngestedDocument(
        db, ingestResult, localPath, fileName, documentId,
      );

      fs.unlinkSync(localPath);
      const resp = buildPersistedResponse(ingestResult.summary, documentId, ingestResult.suggestedLinks);
      const fullMsg = placementMsg
        ? `${resp.message}\n\n${placementMsg}`
        : resp.message;
      await ctx.api.editMessageText(chatId, statusMsgId, fullMsg);
      clearIngestSession(chatId);
      return;
    }

    if (ingestResult && (ingestResult.questionsForOwner.length > 0 || ingestResult.missingLinks.length > 0)) {
      // Missing links — save session, ask owner
      setIngestSession(chatId, {
        state: "awaiting_link",
        pendingResult: ingestResult,
        filePath: localPath,
        fileName,
        startedAt: Date.now(),
      });
      const resp = buildQuestionsResponse(ingestResult);
      await ctx.api.editMessageText(chatId, statusMsgId, resp.message);
      // Send buttons separately (editMessageText doesn't support reply_markup easily)
      if (resp.buttons) {
        await ctx.reply("Выберите действие:", { reply_markup: buildKeyboard(resp.buttons) });
      }
      return;
    }

    // Ingest returned null or no useful result
    fs.unlinkSync(localPath);
    clearIngestSession(chatId);
    const resp = buildFailedResponse(fileName, "Не удалось классифицировать документ");
    await ctx.api.editMessageText(chatId, statusMsgId, resp.message);
  } catch (err) {
    logger.error({ err, fileName }, "Standalone ingest error");
    clearIngestSession(chatId);
    await ctx.api.editMessageText(
      chatId, statusMsgId,
      `❌ Ошибка обработки ${fileName}: ${err instanceof Error ? err.message : "неизвестная ошибка"}`,
    );
  }
}

/**
 * Place an ingested document into storage if object/transition context is known.
 * Returns a human-readable placement message, or empty string if no placement.
 */
function placeIngestedDocument(
  db: ReturnType<typeof getDb>,
  ingestResult: KnowledgeIngestOutput,
  filePath: string,
  fileName: string,
  documentId: string,
): string {
  try {
    const links = ingestResult.suggestedLinks;
    if (!links.objectId) return "";

    const objectProfile = getObjectProfile(db, links.objectId);
    if (!objectProfile) return "";

    const customerName = objectProfile.customer?.name;
    const objectName = objectProfile.object.short_name;
    if (!customerName || !objectName) return "";

    // Determine doc type for routing
    const docType = mapIngestKindToDocType(ingestResult.docKind, ingestResult.extractedData);

    // If transition is known, place into transition folder
    let gnbShort = "";
    if (links.transitionId) {
      const repos = createRepos(db);
      const transition = repos.transitions.getById(links.transitionId);
      if (transition?.gnb_number_short) {
        gnbShort = transition.gnb_number_short;
      }
    }

    if (gnbShort) {
      const plan = buildTransitionStoragePlan(customerName, objectName, gnbShort);
      ensureStorageDirs(plan);

      // Build canonical filename
      const ext = extractExtension(fileName);
      const canonicalName = buildStorageFileName(docType, {
        docNumber: ingestResult.extractedData.docNumber as string,
        docDate: ingestResult.extractedData.docDate as string,
        mark: ingestResult.extractedData.mark as string,
        gnbNumberShort: gnbShort,
        originalExt: ext,
      });

      const record = placeDocument(plan, docType, filePath, canonicalName);
      if (record.success) {
        // Update DB with final storage path
        const repos = createRepos(db);
        repos.documents.updateFilePath(documentId, record.targetFile);

        const dirName = path.basename(record.targetDir);
        return `\uD83D\uDCC1 ${path.basename(record.targetFile)} \u2192 ${dirName}/`;
      }
    } else {
      // Object known but no transition — place into object-level Прочее
      const projectDir = getProjectDir(customerName, objectName);
      const miscDir = path.join(projectDir, "\u041F\u0440\u043E\u0447\u0435\u0435");
      fs.mkdirSync(miscDir, { recursive: true });

      const targetPath = path.join(miscDir, fileName);
      fs.copyFileSync(filePath, targetPath);

      const repos = createRepos(db);
      repos.documents.updateFilePath(documentId, targetPath);

      return `\uD83D\uDCC1 ${fileName} \u2192 ${objectName}/\u041F\u0440\u043E\u0447\u0435\u0435/`;
    }
  } catch (err) {
    logger.error({ err, fileName }, "Failed to place ingested document");
  }
  return "";
}

function mapIngestKindToDocType(kind: IngestDocKind, data: Record<string, unknown>): string {
  switch (kind) {
    case "person_document": return (data.docType as string) ?? "order";
    case "pipe_document": return "passport_pipe";
    case "material_document": return "certificate";
    case "scheme": return "executive_scheme";
    case "reference_act": return "prior_aosr";
    case "organization_document": return "order";
    default: return "unknown";
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
      "• Собирать Паспорт ГНБ из разных источников\n" +
      "• Сохранять документы в базу знаний (паспорта, приказы, сертификаты)\n\n" +
      "Команды:\n" +
      "/new_gnb — новый комплект актов\n" +
      "/review_gnb — сводка текущего черновика\n" +
      "/cancel — отменить черновик\n" +
      "/help — справка\n\n" +
      "Сохранение в базу: отправь файл с подписью «сохрани»\n" +
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

  bot.command("review_gnb_debug", async (ctx) => {
    try {
      const result = handleDebugReview(ctx.chat.id, stores);
      // Send debug text (may be long — split)
      const parts = splitMessage(result.message);
      for (const part of parts) {
        await ctx.reply(part);
      }
      // Save and send debug JSON snapshot as file
      if (result.snapshot) {
        const snapshotJson = JSON.stringify(result.snapshot, null, 2);
        const snapshotPath = path.join(getTempDir(), `debug-${result.snapshot.draft_id}.json`);
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.writeFileSync(snapshotPath, snapshotJson, "utf-8");
        await ctx.replyWithDocument(new InputFile(snapshotPath), {
          caption: `Debug snapshot: ${result.snapshot.draft_id}`,
        });
        try { fs.unlinkSync(snapshotPath); } catch { /* ignore */ }
      }
    } catch (err) {
      logger.error({ err }, "Ошибка /review_gnb_debug");
      await ctx.reply("Ошибка при формировании debug сводки.");
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

    // Handle ingest callbacks
    if (data.startsWith("ingest:")) {
      try {
        await ctx.answerCallbackQuery();
        const session = getIngestSession(chatId);

        if (data === "ingest:cancel") {
          if (session?.filePath) {
            try { fs.unlinkSync(session.filePath); } catch { /* ignore */ }
          }
          clearIngestSession(chatId);
          await ctx.reply("Сохранение отменено.");
          return;
        }

        if (data === "ingest:skip_links" && session?.pendingResult) {
          // Persist without missing links
          const result = session.pendingResult;
          result.missingLinks = [];
          result.questionsForOwner = [];

          const memDir = getMemoryDir();
          const db = getDb(memDir);
          const { documentId } = persistIngestResult(db, result, session.filePath);

          // Place document into storage if context is known
          let placementMsg = "";
          if (session.filePath) {
            placementMsg = placeIngestedDocument(
              db, result, session.filePath, session.fileName || "document", documentId,
            ) || "";
            try { fs.unlinkSync(session.filePath); } catch { /* ignore */ }
          }
          clearIngestSession(chatId);

          const resp = buildPersistedResponse(result.summary, documentId, result.suggestedLinks);
          const fullMsg = placementMsg ? `${resp.message}\n\n${placementMsg}` : resp.message;
          await ctx.reply(fullMsg);
          return;
        }

        await ctx.reply("Неизвестное действие.");
      } catch (err) {
        logger.error({ err, data }, "Ошибка ingest callback");
        await ctx.reply("Ошибка обработки.");
      }
      return;
    }

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

    // Check if owner wants to save data (caption trigger or active ingest)
    const caption = ctx.message.caption?.toLowerCase().trim() ?? "";
    const wantsSave = isSaveTrigger(caption);

    if (wantsSave) {
      const photoFileName = `photo_${Date.now()}.jpg`;
      const status = await ctx.reply(`📥 Сохраняю данные из фото...`);
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      await runStandaloneIngest(ctx, bot, photo.file_id, photoFileName, status.message_id);
      return;
    }

    // Fallback: general OCR
    const status = await ctx.reply("⏳ Скачиваю фото...");
    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const localPath = await downloadTelegramFile(bot, photo.file_id, `photo_${Date.now()}.jpg`);

      await ctx.api.editMessageText(chatId, status.message_id, "🔍 Анализирую документ...");
      const text = await ocrDocument(localPath);
      fs.unlinkSync(localPath);

      const parts = splitMessage(stripMarkdown(`📋 Результат:\n\n${text}`));
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

    // Knowledge ingest: no active draft, document could be useful for DB.
    // Trigger: caption says "сохрани" OR document is PDF/Excel (auto-ingest attempt).
    const docCaption = ctx.message?.caption?.toLowerCase().trim() ?? "";
    const docWantsSave = isSaveTrigger(docCaption);

    if ([".pdf", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"].includes(ext) && (docWantsSave || [".pdf", ".xls", ".xlsx"].includes(ext))) {
      const status = await ctx.reply(`📥 Сохраняю данные из ${fileName}...`);
      await runStandaloneIngest(ctx, bot, doc.file_id, fileName, status.message_id);
      return;
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
        const result = stripMarkdown(`📊 Данные из ${fileName} (${sheetName}):\n\n${claudeResp}`);
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

        const parts = splitMessage(stripMarkdown(`📄 Данные из ${fileName}:\n\n${text}`));
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

    // Check for active ingest session (standalone save flow)
    if (hasActiveIngestSession(chatId)) {
      try {
        const { updated, result } = handleIngestTextAnswer(chatId, text);
        if (!updated) {
          // Cancelled or no session
          await ctx.reply("Сохранение отменено.");
          return;
        }
        if (result) {
          // Owner answered — try to persist
          const memDir = getMemoryDir();
          const db = getDb(memDir);
          const session = getIngestSession(chatId);
          const { documentId } = persistIngestResult(db, result, session?.filePath);

          // Place document into storage if context is known
          let placementMsg = "";
          if (session?.filePath) {
            placementMsg = placeIngestedDocument(
              db, result, session.filePath, session.fileName || "document", documentId,
            ) || "";
            try { fs.unlinkSync(session.filePath); } catch { /* ignore */ }
          }
          clearIngestSession(chatId);
          const resp = buildPersistedResponse(result.summary, documentId, result.suggestedLinks);
          const fullMsg = placementMsg ? `${resp.message}\n\n${placementMsg}` : resp.message;
          await ctx.reply(fullMsg);
          return;
        }
      } catch (err) {
        logger.error({ err }, "Ingest text answer error");
        clearIngestSession(chatId);
        await ctx.reply("Ошибка при сохранении. Попробуйте снова.");
        return;
      }
    }

    // "save data" trigger without a document — tell owner to send a document
    if (isSaveTrigger(text) && !hasActiveIntake(chatId)) {
      await ctx.reply(
        "📎 Пришлите документ (PDF, фото, Excel) с подписью «сохрани» — я извлеку данные и сохраню в базу.\n" +
        "Или отправьте файл, а потом напишите «сохрани».",
      );
      return;
    }

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
      const clean = stripMarkdown(response);
      const parts = splitMessage(clean);
      await ctx.api.editMessageText(chatId, status.message_id, parts[0]);
      for (let i = 1; i < parts.length; i++) await ctx.reply(parts[i]);
    } catch (err) {
      logger.error({ err }, "Ошибка Claude");
      await ctx.api.editMessageText(chatId, status.message_id, `❌ Ошибка: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
    }
  });
}
