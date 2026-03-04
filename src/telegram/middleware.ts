import { Context, NextFunction } from "grammy";
import { config } from "../config.js";
import { logger } from "../logger.js";

// Middleware: пропускать только разрешённых пользователей
export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  if (config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(userId)) {
    logger.warn({ userId }, "Неавторизованный пользователь");
    return; // молча игнорируем
  }

  await next();
}
