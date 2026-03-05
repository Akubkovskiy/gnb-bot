import pino from "pino";
import path from "node:path";

const logFile = path.join(process.cwd(), "bot.log");

// Логирование в файл + консоль (ТЗ ч.10 п.2)
export const logger = pino({
  level: "debug",
  transport: {
    targets: [
      {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss" },
        level: "info",
      },
      {
        target: "pino/file",
        options: { destination: logFile, mkdir: true },
        level: "debug",
      },
    ],
  },
});
