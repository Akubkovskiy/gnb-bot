from aiogram import Router, types
from aiogram.filters import Command
from loguru import logger

router = Router()

@router.message(Command("start"))
async def cmd_start(message: types.Message):
    logger.info(f"User {message.from_user.id} started the bot")
    await message.answer(
        "Привет! Я бот для автоматизации строительных актов.\n"
        "Используй /new_project [название], чтобы начать."
    )

@router.message(Command("new_project"))
async def cmd_new_project(message: types.Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Пожалуйста, укажите название проекта.\nПример: `/new_project ГНБ-Москва`")
        return
    
    project_name = args[1]
    logger.info(f"New project requested: {project_name}")
    await message.answer(f"Создаю новый проект: **{project_name}**\n(Функционал в разработке)")
