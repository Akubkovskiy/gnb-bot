import "dotenv/config";

export const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  allowedUserIds: (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
    .split(",")
    .filter(Boolean)
    .map(Number),

  yandexDiskPath: process.env.YANDEX_DISK_PATH || "C:\\Users\\kubko\\YandexDisk",
  workRoot: process.env.WORK_ROOT || "Работа",
  memoryDir: process.env.MEMORY_DIR || ".gnb-memory",

  claudeCliPath: process.env.CLAUDE_CLI_PATH || "",
  claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
  /** Lightweight model for reasoning (intent, extraction, structured JSON). */
  claudeReasoningModel: process.env.CLAUDE_REASONING_MODEL || "claude-haiku-4-5",
} as const;
