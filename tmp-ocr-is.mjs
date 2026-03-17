import { ocrDocument } from './dist/claude.js';
const path = String.raw`C:\Users\kubko\YandexDisk\Работа\Крафт\Марьино\Для актов\ИС ГНБ 5-5.pdf`;
const res = await ocrDocument(path);
console.log(res);
