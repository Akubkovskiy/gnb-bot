import os
from dotenv import load_dotenv
from dataclasses import dataclass

load_dotenv()

@dataclass
class Config:
    bot_token: str
    admin_ids: list[int]
    google_creds_path: str
    google_drive_folder_id: str
    gemini_api_key: str

    @classmethod
    def from_env(cls):
        admins = os.getenv("ADMIN_IDS", "")
        return cls(
            bot_token=os.getenv("BOT_TOKEN", ""),
            admin_ids=[int(id) for id in admins.split(",") if id.strip()],
            google_creds_path=os.getenv("GOOGLE_CREDS_PATH", "credentials.json"),
            google_drive_folder_id=os.getenv("GOOGLE_DRIVE_FOLDER_ID", ""),
            gemini_api_key=os.getenv("GEMINI_API_KEY", "")
        )

config = Config.from_env()
