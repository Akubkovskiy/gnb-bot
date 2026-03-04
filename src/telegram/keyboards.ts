import { InlineKeyboard } from "grammy";

// Клавиатура подтверждения
export function confirmKeyboard(prefix: string = "confirm"): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Подтвердить", `${prefix}:yes`)
    .text("❌ Отклонить", `${prefix}:no`);
}

// Клавиатура после OCR
export function ocrKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Использовать", "ocr:use")
    .text("🔄 Переделать", "ocr:retry");
}
