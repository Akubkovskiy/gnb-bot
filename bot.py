import asyncio
import logging
from aiogram import Bot, Dispatcher
from loguru import logger
from config import config

# Configure logging
logger.add("bot.log", rotation="10 MB")

async def main():
    logger.info("Starting bot...")
    
    if not config.bot_token:
        logger.error("BOT_TOKEN is not set!")
        return

    bot = Bot(token=config.bot_token)
    dp = Dispatcher()

    from handlers import base, files, conversation
    dp.include_router(base.router)
    dp.include_router(files.router)
    dp.include_router(conversation.router)

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"Bot stopped with error: {e}")
    finally:
        await bot.session.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
