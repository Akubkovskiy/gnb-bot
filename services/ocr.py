import os
from google.cloud import vision
from loguru import logger

class OCRService:
    def __init__(self):
        self.client = None
        self._authenticate()

    def _authenticate(self):
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        
        token_path = 'token.json'
        
        if not os.path.exists(token_path):
            logger.warning("token.json not found. Please run the bot first to authenticate with Google.")
            return
        
        try:
            creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/cloud-vision'])
            
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open(token_path, 'w') as token:
                    token.write(creds.to_json())
            
            self.client = vision.ImageAnnotatorClient(credentials=creds)
            logger.info("Google Vision service authenticated successfully")
        except Exception as e:
            logger.error(f"Failed to authenticate with Google Vision: {e}")

    def detect_text(self, image_path: str) -> str:
        if not self.client:
            logger.error("Vision client not initialized")
            return ""

        try:
            # For PDF files, try extracting text directly first (faster)
            if image_path.lower().endswith('.pdf'):
                try:
                    import fitz  # PyMuPDF
                    logger.info(f"Trying to extract text from PDF: {image_path}")
                    doc = fitz.open(image_path)
                    text = ""
                    for page in doc:
                        text += page.get_text()
                    doc.close()
                    
                    if text.strip():
                        logger.info(f"Extracted text directly from PDF ({len(text)} chars)")
                        return text.strip()
                    else:
                        logger.info("PDF has no extractable text, converting to image for OCR")
                except Exception as e:
                    logger.warning(f"Failed to extract text from PDF directly: {e}, falling back to OCR")
                
                # If direct extraction failed, convert to image
                from pdf2image import convert_from_path
                from PIL import Image
                import io
                
                logger.info(f"Converting PDF to image for OCR: {image_path}")
                images = convert_from_path(image_path, first_page=1, last_page=1)
                
                if not images:
                    logger.error("Failed to convert PDF to image")
                    return ""
                
                # Convert PIL image to bytes
                img_byte_arr = io.BytesIO()
                images[0].save(img_byte_arr, format='PNG')
                content = img_byte_arr.getvalue()
            else:
                # Read image file directly
                with open(image_path, "rb") as image_file:
                    content = image_file.read()

            image = vision.Image(content=content)
            response = self.client.text_detection(image=image)
            texts = response.text_annotations

            if texts:
                logger.info(f"Detected {len(texts)} text blocks via Vision API")
                return texts[0].description
            
            logger.warning("No text detected in image")
            return ""
        except Exception as e:
            logger.error(f"Error detecting text: {e}")
            return ""

ocr_service = OCRService()
