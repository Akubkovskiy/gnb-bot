import google.generativeai as genai
from loguru import logger
from config import config
import json

class GeminiService:
    def __init__(self):
        self.model = None
        self._configure()

    def _configure(self):
        try:
            # Configure Gemini API
            genai.configure(api_key=config.gemini_api_key)
            self.model = genai.GenerativeModel('gemini-pro')
            logger.info("Gemini AI service configured successfully")
        except Exception as e:
            logger.error(f"Failed to configure Gemini: {e}")

    def extract_construction_data(self, text: str) -> dict:
        """
        Extract structured construction data from text using Gemini AI
        """
        if not self.model:
            logger.error("Gemini model not initialized")
            return {}

        prompt = f"""
Ты — ассистент для обработки строительных документов (акты скрытых работ, ведомости).

Проанализируй следующий текст и извлеки ключевые данные в формате JSON.

Текст документа:
{text}

Верни JSON со следующими полями (если поле не найдено, оставь пустую строку ""):
{{
  "project_name": "название проекта",
  "address": "адрес объекта",
  "act_number": "номер акта",
  "date": "дата в формате ДД.ММ.ГГГГ",
  "material": "материал (труба, кабель и т.д.)",
  "diameter": "диаметр в мм",
  "length": "длина в метрах",
  "contractor": "подрядчик/исполнитель",
  "customer": "заказчик",
  "supervisor": "технадзор/ответственный",
  "additional_info": "любая дополнительная важная информация"
}}

Верни ТОЛЬКО валидный JSON, без дополнительного текста.
"""

        try:
            logger.info("Sending text to Gemini for analysis...")
            response = self.model.generate_content(prompt)
            
            # Extract JSON from response
            response_text = response.text.strip()
            
            # Remove markdown code blocks if present
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            data = json.loads(response_text.strip())
            logger.info(f"Successfully extracted data: {list(data.keys())}")
            return data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response as JSON: {e}")
            logger.error(f"Response was: {response.text}")
            return {}
        except Exception as e:
            logger.error(f"Error extracting data with Gemini: {e}")
            return {}

gemini_service = GeminiService()
