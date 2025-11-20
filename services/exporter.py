import os
import zipfile
from services.google_docs import docs_service
from services.google_drive import drive_service
from loguru import logger

# Placeholder template ID - in real app, this should be in config or DB
TEMPLATE_DOC_ID = "1X2Y3Z_placeholder_template_id" 

class ExporterService:
    def generate_package(self, data: dict) -> str:
        """
        Generates documents, exports them to PDF, and zips them.
        Returns path to ZIP file.
        """
        # 1. Create a copy of the template (conceptually)
        # Since Docs API doesn't have "copy", we use Drive API to copy file
        # But for now, let's just create a new doc and fill it as a simple example
        # In production, we would copy a template file using Drive API
        
        doc_title = f"Акт_{data.get('act_number', 'new')}"
        doc_id = docs_service.create_document(doc_title)
        
        if not doc_id:
            return None
            
        # 2. Fill data
        # Note: create_document creates an empty doc. 
        # Real implementation requires copying a template.
        # For MVP, we will just assume we can replace text if we had a template.
        # Since we created a blank doc, there is nothing to replace.
        # So this is a mock implementation of the logic.
        
        replacements = {
            "ADDRESS": data.get('address', ''),
            "LENGTH": data.get('length', ''),
            "DATE": data.get('date', ''),
            "ACT_NO": data.get('act_number', '')
        }
        
        docs_service.replace_text(doc_id, replacements)
        
        # 3. Export to PDF
        output_dir = "temp_output"
        os.makedirs(output_dir, exist_ok=True)
        
        pdf_path = os.path.join(output_dir, f"{doc_title}.pdf")
        drive_service.export_file(doc_id, pdf_path)
        
        # 4. Create ZIP
        zip_path = os.path.join(output_dir, f"Project_{data.get('project_name', 'docs')}.zip")
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            if os.path.exists(pdf_path):
                zipf.write(pdf_path, os.path.basename(pdf_path))
                
        return zip_path

exporter_service = ExporterService()
