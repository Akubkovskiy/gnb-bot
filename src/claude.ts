import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";

// Автодетект пути к claude CLI
function findClaudePath(): string {
  if (config.claudeCliPath) return config.claudeCliPath;

  // Пробуем найти через which/where
  const whichCmd = process.platform === "win32" ? "where claude" : "which claude";
  try {
    const result = execSync(whichCmd, { encoding: "utf-8", timeout: 5000 }).trim();
    if (result) {
      const firstLine = result.split("\n")[0].trim();
      logger.info({ path: firstLine }, "Claude CLI найден через which/where");
      return firstLine;
    }
  } catch { /* не найден */ }

  // Известные пути
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const knownPaths = [
    // Linux
    "/usr/bin/claude",
    "/usr/local/bin/claude",
    path.join(home, ".local", "bin", "claude"),
    // Windows
    path.join(home, ".local", "bin", "claude.exe"),
    path.join(home, "AppData", "Local", "Programs", "claude", "claude.exe"),
    path.join(home, ".claude", "bin", "claude.exe"),
  ];

  for (const p of knownPaths) {
    try {
      execSync(`"${p}" --version`, { timeout: 5000, stdio: "ignore" });
      logger.info({ path: p }, "Claude CLI найден по известному пути");
      return p;
    } catch { /* не подошёл */ }
  }

  throw new Error("Claude CLI не найден. Укажите CLAUDE_CLI_PATH в .env");
}

let claudePath: string | null = null;

function getClaudePath(): string {
  if (!claudePath) claudePath = findClaudePath();
  return claudePath;
}

interface AskClaudeOptions {
  systemPrompt?: string;
  files?: string[];       // Пути к файлам (изображения, PDF)
  timeoutMs?: number;
}

// Ответ Claude CLI в формате json
interface ClaudeJsonResult {
  type: string;
  subtype?: string;
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
}

/**
 * Отправляет промпт в Claude CLI и возвращает текстовый ответ.
 * Использует --output-format json (одиночный результат).
 */
export async function askClaude(prompt: string, options: AskClaudeOptions = {}): Promise<string> {
  const { systemPrompt, files, timeoutMs = 120_000 } = options;
  const exe = getClaudePath();

  const args = [
    "-p", prompt,
    "--output-format", "json",
  ];

  if (systemPrompt) {
    args.push("--append-system-prompt", systemPrompt);
  }

  if (config.claudeModel) {
    args.push("--model", config.claudeModel);
  }

  // Передача файлов — добавляем директорию с файлами через --add-dir
  // и разрешаем Read/Bash для чтения PDF/image
  if (files?.length) {
    const dirs = new Set(files.map((f) => path.dirname(f)));
    for (const dir of dirs) {
      args.push("--add-dir", dir);
    }
    args.push("--allowedTools", "Read,Bash");
  }

  logger.debug({ exe, args: args.filter((a) => a !== prompt) }, "Запуск Claude CLI");

  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, {
      env: {
        ...process.env,
        // Снимаем флаг вложенной сессии, если он установлен
        CLAUDECODE: undefined,
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    proc.on("close", (code) => {
      if (stdout.trim()) {
        try {
          const json = JSON.parse(stdout) as ClaudeJsonResult;
          if (json.result) {
            resolve(json.result.trim());
            return;
          }
        } catch {
          // Не JSON — вернём как текст
          resolve(stdout.trim());
          return;
        }
      }
      if (code !== 0) {
        logger.error({ code, stderr }, "Claude CLI ошибка");
        reject(new Error(`Claude CLI завершился с кодом ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout.trim() || "(пустой ответ)");
      }
    });

    proc.on("error", (err) => {
      logger.error({ err }, "Не удалось запустить Claude CLI");
      reject(err);
    });

    // Таймаут
    setTimeout(() => {
      proc.kill();
      reject(new Error("Claude CLI таймаут"));
    }, timeoutMs);
  });
}

// Промпты для разных типов документов
const DOC_PROMPTS = {
  // Общий OCR
  generic: (filePath: string) =>
    `Прочитай файл ${filePath} и распознай текст. Покажи распознанный текст. Неуверенные места пометь (?).`,

  // Определение типа документа + извлечение данных
  detect: (filePath: string) =>
    `Прочитай файл ${filePath}. Определи тип документа и извлеки ТОЛЬКО ключевые данные.

Типы документов и что извлекать:

1. ПАСПОРТ КАЧЕСТВА / ПАСПОРТ ТРУБЫ:
   Извлеки ТОЛЬКО: номер паспорта, дата паспорта, условное обозначение трубы (марка).
   Формат ответа:
   ТИП: паспорт качества
   Номер: [номер]
   Дата: [дата]
   Труба: [условное обозначение]

2. СЕРТИФИКАТ СООТВЕТСТВИЯ:
   Извлеки: номер сертификата, срок действия, на что выдан.
   Формат: ТИП: сертификат / Номер / Срок / Продукция

3. ПРИКАЗ О НАЗНАЧЕНИИ:
   Извлеки: ФИО, должность, номер приказа, дата, кем выдан.
   Формат: ТИП: приказ / ФИО / Должность / Номер / Дата / Организация

4. ИСПОЛНИТЕЛЬНАЯ СХЕМА (чертёж со штампом):
   Извлеки: номер ГНБ, шифр проекта, L план, L профиль, диаметр, адрес.
   Формат: ТИП: схема / Номер ГНБ / Шифр / L_план / L_профиль / Диаметр / Адрес

5. АКТ ОСМОТРА (рукописный):
   Извлеки: подписанты (ФИО, должности), даты работ.
   Формат: ТИП: акт осмотра / Подписанты / Даты

Если не можешь определить тип — напиши ТИП: неизвестен и покажи краткое содержание.
Неуверенные места пометь (?).`,
} as const;

/**
 * OCR документа через Claude CLI с автоопределением типа.
 */
export async function ocrDocument(filePath: string, customPrompt?: string): Promise<string> {
  const absPath = path.resolve(filePath);
  const prompt = customPrompt || DOC_PROMPTS.detect(absPath);
  return askClaude(prompt, { files: [absPath] });
}

/**
 * Простой OCR — распознать весь текст.
 */
export async function ocrRawText(filePath: string): Promise<string> {
  const absPath = path.resolve(filePath);
  return askClaude(DOC_PROMPTS.generic(absPath), { files: [absPath] });
}
