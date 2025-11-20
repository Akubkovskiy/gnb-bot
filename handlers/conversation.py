import os
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from aiogram.filters import Command
from states import ProjectStates
from services.parser import ConstructionData

router = Router()

@router.message(Command("verify"))
async def cmd_verify(message: types.Message, state: FSMContext):
    data = await state.get_data()
    parsed_data = data.get("parsed_data")
    
    if not parsed_data:
        await message.answer("⚠️ Нет данных для проверки. Загрузите файлы.")
        return

    # Convert dict back to object if needed, or just use dict
    # Assuming parsed_data is stored as dict
    
    text = (
        "📋 **Проверка данных:**\n\n"
        f"🏗 **Проект:** {parsed_data.get('project_name', 'Не указан')}\n"
        f"📍 **Адрес:** {parsed_data.get('address', 'Не найдено')}\n"
        f"📄 **Акт №:** {parsed_data.get('act_number', 'Не найдено')}\n"
        f"📅 **Дата:** {parsed_data.get('date', 'Не найдено')}\n"
        f"📏 **Длина:** {parsed_data.get('length', 'Не найдено')}\n\n"
        "Для исправления отправьте сообщение в формате:\n"
        "`Длина 150` или `Адрес Москва, Ленина 1`"
    )
    
    await message.answer(text)
    await state.set_state(ProjectStates.verifying_data)

@router.message(ProjectStates.verifying_data)
async def process_correction(message: types.Message, state: FSMContext):
    data = await state.get_data()
    parsed_data = data.get("parsed_data", {})
    
    text = message.text
    
    # Simple correction logic
    if text.lower().startswith("длина"):
        parsed_data['length'] = text.split(maxsplit=1)[1]
        await message.answer(f"✅ Длина обновлена: {parsed_data['length']}")
    elif text.lower().startswith("адрес"):
        parsed_data['address'] = text.split(maxsplit=1)[1]
        await message.answer(f"✅ Адрес обновлен: {parsed_data['address']}")
    elif text.lower().startswith("акт"):
        parsed_data['act_number'] = text.split(maxsplit=1)[1]
        await message.answer(f"✅ Номер акта обновлен: {parsed_data['act_number']}")
    elif text.lower() == "ок" or text.lower() == "готово":
        await message.answer("⏳ Генерирую документы...")
        await state.set_state(ProjectStates.generating_docs)
        
        from services.exporter import exporter_service
        
        # Run generation in executor to not block event loop
        # In a real app, use a task queue (Celery/Redis)
        zip_path = await message.bot.loop.run_in_executor(
            None, exporter_service.generate_package, parsed_data
        )
        
        if zip_path and os.path.exists(zip_path):
            await message.answer_document(
                types.FSInputFile(zip_path),
                caption="✅ **Ваши документы готовы!**\n\nАрхив содержит PDF версии актов."
            )
            # Cleanup
            os.remove(zip_path)
        else:
            await message.answer("❌ Ошибка при генерации документов.")
            
        return
    else:
        await message.answer("Не понял команду. Используйте формат `Поле Значение` или напишите `Готово`.")
        return

    await state.update_data(parsed_data=parsed_data)
