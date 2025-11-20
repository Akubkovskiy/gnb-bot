import re
from dataclasses import dataclass
from typing import Optional

@dataclass
class ConstructionData:
    project_name: Optional[str] = None
    address: Optional[str] = None
    act_number: Optional[str] = None
    date: Optional[str] = None
    material: Optional[str] = None
    length: Optional[str] = None

class DataParser:
    def parse_text(self, text: str) -> ConstructionData:
        data = ConstructionData()
        
        # Simple regex patterns (Russian)
        # These are placeholders and should be improved based on real documents
        
        # Address: "Адрес: Москва, ул. Ленина 1"
        address_match = re.search(r"Адрес[:\s]+(.+)", text, re.IGNORECASE)
        if address_match:
            data.address = address_match.group(1).strip()
            
        # Act Number: "Акт № 123"
        act_match = re.search(r"Акт\s*№\s*(\S+)", text, re.IGNORECASE)
        if act_match:
            data.act_number = act_match.group(1).strip()
            
        # Date: "Дата: 01.01.2025" or just "01.01.2025"
        date_match = re.search(r"(\d{2}\.\d{2}\.\d{4})", text)
        if date_match:
            data.date = date_match.group(1).strip()
            
        # Length: "Длина 100 м" or "100м"
        length_match = re.search(r"Длина[:\s]+(\d+[\.,]?\d*)\s*м?", text, re.IGNORECASE)
        if length_match:
            data.length = length_match.group(1).strip()

        return data

parser_service = DataParser()
