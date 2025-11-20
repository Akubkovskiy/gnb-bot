import os
from google.oauth2 import service_account
from googleapiclient.discovery import build
from loguru import logger
from config import config

SCOPES = ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive']

class GoogleDocsService:
    def __init__(self):
        self.creds = None
        self.service = None
        self._authenticate()

    def _authenticate(self):
        if not os.path.exists(config.google_creds_path):
            logger.warning(f"Google credentials not found at {config.google_creds_path}")
            return

        try:
            self.creds = service_account.Credentials.from_service_account_file(
                config.google_creds_path, scopes=SCOPES
            )
            self.service = build('docs', 'v1', credentials=self.creds)
            logger.info("Google Docs service authenticated successfully")
        except Exception as e:
            logger.error(f"Failed to authenticate with Google Docs: {e}")

    def create_document(self, title: str) -> str:
        if not self.service:
            logger.error("Docs service not initialized")
            return None

        try:
            doc = self.service.documents().create(body={'title': title}).execute()
            logger.info(f"Created document '{title}' with ID: {doc.get('documentId')}")
            return doc.get('documentId')
        except Exception as e:
            logger.error(f"Error creating document: {e}")
            return None

    def replace_text(self, document_id: str, replacements: dict):
        if not self.service:
            logger.error("Docs service not initialized")
            return

        requests = []
        for key, value in replacements.items():
            requests.append({
                'replaceAllText': {
                    'containsText': {
                        'text': f'{{{{{key}}}}}',
                        'matchCase': True
                    },
                    'replaceText': str(value)
                }
            })

        try:
            self.service.documents().batchUpdate(
                documentId=document_id, body={'requests': requests}
            ).execute()
            logger.info(f"Replaced text in document {document_id}")
        except Exception as e:
            logger.error(f"Error replacing text: {e}")

docs_service = GoogleDocsService()
