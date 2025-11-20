import os
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from loguru import logger
from config import config

SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/cloud-vision'
]

class GoogleDriveService:
    def __init__(self):
        self.creds = None
        self.service = None
        self._authenticate()

    def _authenticate(self):
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        
        creds = None
        token_path = 'token.json'
        
        # Token file stores user's access and refresh tokens
        if os.path.exists(token_path):
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)
        
        # If no valid credentials, let user log in
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not os.path.exists(config.google_creds_path):
                    logger.warning(f"Google credentials not found at {config.google_creds_path}")
                    return
                
                flow = InstalledAppFlow.from_client_secrets_file(
                    config.google_creds_path, SCOPES
                )
                creds = flow.run_local_server(port=0)
            
            # Save credentials for next run
            with open(token_path, 'w') as token:
                token.write(creds.to_json())
        
        try:
            self.service = build('drive', 'v3', credentials=creds)
            logger.info("Google Drive service authenticated successfully")
        except Exception as e:
            logger.error(f"Failed to authenticate with Google Drive: {e}")

    def create_folder(self, folder_name: str, parent_id: str = None) -> str:
        if not self.service:
            logger.error("Drive service not initialized")
            return None

        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            file_metadata['parents'] = [parent_id]

        try:
            file = self.service.files().create(body=file_metadata, fields='id').execute()
            logger.info(f"Created folder '{folder_name}' with ID: {file.get('id')}")
            return file.get('id')
        except Exception as e:
            logger.error(f"Error creating folder: {e}")
            return None

    def upload_file(self, file_path: str, parent_id: str = None) -> str:
        if not self.service:
            logger.error("Drive service not initialized")
            return None

        file_name = os.path.basename(file_path)
        file_metadata = {'name': file_name}
        
        logger.info(f"upload_file called with parent_id: {parent_id}")
        
        if parent_id:
            file_metadata['parents'] = [parent_id]
            logger.info(f"Added parent folder: {parent_id}")
        else:
            logger.warning("No parent_id provided, uploading to root!")

        media = MediaFileUpload(file_path, resumable=True)

        try:
            file = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id'
            ).execute()
            logger.info(f"Uploaded file '{file_name}' with ID: {file.get('id')}")
            return file.get('id')
        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return None

    def export_file(self, file_id: str, dest_path: str, mime_type: str = 'application/pdf'):
        if not self.service:
            logger.error("Drive service not initialized")
            return None

        try:
            request = self.service.files().export_media(fileId=file_id, mimeType=mime_type)
            with open(dest_path, "wb") as f:
                f.write(request.execute())
            logger.info(f"Exported file {file_id} to {dest_path}")
            return dest_path
        except Exception as e:
            logger.error(f"Error exporting file: {e}")
            return None

drive_service = GoogleDriveService()
