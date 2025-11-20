import os
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from loguru import logger
from services.google_drive import drive_service
from services.ocr import ocr_service

router = Router()

# Temporary directory for downloads
TEMP_DIR = "temp_files"
os.makedirs(TEMP_DIR, exist_ok=True)

@router.message(F.document | F.photo)
async def handle_file(message: types.Message, state: FSMContext):
    # TODO: Check if user is in a project context (FSM)
    # For now, just assume a generic upload
    
    file_id = None
    file_name = None
    
    if message.document:
        file_id = message.document.file_id
        file_name = message.document.file_name
    elif message.photo:
        file_id = message.photo[-1].file_id
        file_name = f"photo_{file_id}.jpg"

    if not file_id:
        return

    status_msg = await message.answer("📥 Скачиваю файл...")
    
    bot = message.bot
    file = await bot.get_file(file_id)
    file_path = os.path.join(TEMP_DIR, file_name)
    
    await bot.download_file(file.file_path, file_path)
    
    await status_msg.edit_text("☁️ Загружаю в Google Drive...")
    
    from config import config
    drive_file_id = drive_service.upload_file(file_path, parent_id=config.google_drive_folder_id)
    
    if drive_file_id:
        await status_msg.edit_text(f"✅ Файл загружен в Drive!\nID: `{drive_file_id}`\n\n👁️ Распознаю текст...")
        
        # OCR processing
        text = ocr_service.detect_text(file_path)
        
        if text:
            from services.gemini_ai import gemini_service
            
            # Use Gemini to extract structured data
            await message.answer("🤖 Анализирую данные с помощью AI...")
            extracted_data = gemini_service.extract_construction_data(text)
            
            # Update state
            current_data = await state.get_data()
            stored_parsed_data = current_data.get("parsed_data", {})
            
            # Merge Gemini data
            for key, value in extracted_data.items():
                if value:  # Only update if Gemini found something
                    stored_parsed_data[key] = value
            
            await state.update_data(parsed_data=stored_parsed_data)
            
            # Format response
            data_summary = "\n".join([f"**{k}**: {v}" for k, v in extracted_data.items() if v])
            
            await message.answer(
                f"✅ **Данные извлечены:**\n\n{data_summary}\n\n"
                "Используйте /verify для проверки и редактирования."
            )
        else:
            await message.answer("⚠️ Текст не найден или не распознан.")
            
    else:
        await status_msg.edit_text("❌ Ошибка загрузки в Drive.")

    # Cleanup
    if os.path.exists(file_path):
        os.remove(file_path)
