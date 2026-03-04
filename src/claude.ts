import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";

// Автодетект пути к claude CLI
function findClaudePath(): string {
  if (config.claudeCliPath) return config.claudeCliPath;

  // Пробуем найти через where (Windows)
  try {
    const result = execSync("where claude", { encoding: "utf-8", timeout: 5000 }).trim();
    if (result) {
      const firstLine = result.split("\n")[0].trim();
      logger.info({ path: firstLine }, "Claude CLI найден через where");
      return firstLine;
    }
  } catch { /* не найден */ }

  // Известные пути
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const knownPaths = [
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

// Интерфейс для stream-json событий от Claude CLI
interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  content_block?: { type: string; text?: string };
  delta?: { type: string; text?: string };
  result?: { text?: string };
}

/**
 * Отправляет промпт в Claude CLI и возвращает текстовый ответ.
 * Использует --output-format stream-json для получения ответа.
 */
export async function askClaude(prompt: string, options: AskClaudeOptions = {}): Promise<string> {
  const { systemPrompt, files, timeoutMs = 120_000 } = options;
  const exe = getClaudePath();

  const args = [
    "-p", prompt,
    "--output-format", "stream-json",
  ];

  if (systemPrompt) {
    args.push("--system-prompt", systemPrompt);
  }

  if (config.claudeModel) {
    args.push("--model", config.claudeModel);
  }

  // Передача файлов — добавляем директорию с файлами через --add-dir
  // и упоминаем файлы в промпте
  if (files?.length) {
    const dirs = new Set(files.map((f) => path.dirname(f)));
    for (const dir of dirs) {
      args.push("--add-dir", dir);
    }
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

    let output = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const lines = chunk.toString("utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as ClaudeStreamEvent;

          // Собираем текст из assistant message
          if (event.type === "content_block_delta" && event.delta?.text) {
            output += event.delta.text;
          }
          // Финальный результат
          if (event.type === "result" && event.result?.text) {
            output = event.result.text;
          }
        } catch {
          // Не JSON строка — пропускаем
        }
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    proc.on("close", (code) => {
      if (code === 0 && output) {
        resolve(output.trim());
      } else if (output) {
        // Иногда код != 0, но ответ есть
        resolve(output.trim());
      } else {
        logger.error({ code, stderr }, "Claude CLI ошибка");
        reject(new Error(`Claude CLI завершился с кодом ${code}: ${stderr.slice(0, 500)}`));
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

/**
 * OCR изображения через Claude CLI.
 * Передаёт путь к файлу в промпте + добавляет директорию через --add-dir.
 */
export async function ocrImage(filePath: string, customPrompt?: string): Promise<string> {
  const absPath = path.resolve(filePath);
  const prompt = customPrompt
    || `Прочитай файл ${absPath} и распознай весь текст на изображении. Покажи распознанный текст. Неуверенные места пометь символом (?).`;

  return askClaude(prompt, { files: [absPath] });
}
