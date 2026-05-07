/**
 * Test script: generate МКС АОСР+РЭР with Салтыковка sample data.
 * Run: npx tsx scripts/test-mks.ts
 */
import { renderMksActs } from "../src/renderer/mks-acts.js";
import type { MksActsInput } from "../src/domain/mks-types.js";

const input: MksActsInput = {
  object_title: "«Строительство 8КЛ-0,4 кВ от ТП-10/0,4кВ № 22172 до ВРУ-0,4кВ жилого дома по адресу: г. Москва, Салтыковская ул. д.5А»",
  address: "г. Москва, Салтыковская ул. д.5А",
  project_code: "345716/ПС-25",
  transition_number: "№1",
  rer_department: "7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",

  dates: {
    survey:    new Date(2025, 9, 27),   // 27.10.2025
    pits:      new Date(2025, 9, 27),
    pilot:     new Date(2025, 9, 28),
    expansion: new Date(2025, 9, 28),
    pullback:  new Date(2025, 9, 30),
    final:     new Date(2025, 9, 31),   // 31.10.2025
  },

  contractor_org_line: "ООО «СМК» ОГРН 1167154074570, ИНН 7130031154, 153510, Ивановская область, г. Кинешма, ул. Юрьевецкая, д. 90",
  designer_org_line:   "ООО «СМК» ОГРН 1167154074570, ИНН 7130031154, 153510, Ивановская область, г. Кинешма, ул. Юрьевецкая, д. 90",
  executor_org_name:   "ООО «СКМ-ГРУПП»",
  executor_org_line:   "ОГРН 5167746459579, ИНН 9723046395, 125481, г. Москва, ул. Пулковская, д. 13Б",
  contractor_short:    "ООО «СКМ-ГРУПП»",
  designer_short:      "ООО «СМК»",

  mks_rep: {
    full_line:  "Заместитель начальника УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» Гусев П.А., ИНРС №С-77-204102 от 18.10.2019; распоряжение №1253р от 06.06.2023",
    short_name: "Гусев П.А.",
  },
  contractor1: {
    full_line:  "Зам. начальника ПТО ООО \"СМК\" Тишков В.А., С-77-233823 от 25.03.2021; приказ №18-ЛНА 1 от 03.11.2020г.",
    short_name: "Тишков В.А.",
  },
  contractor2: {
    full_line:  "Заместитель генерального директора по развитию ООО \"СМК\" Прошин Н.Н., ИНРС С-71-081355 от 21.08.2017; приказ №27-ЛНА от 03.02.2022",
    short_name: "Прошин Н.Н.",
  },
  designer_rep: {
    full_line:  "ГИП ООО \"СМК\" Сергеев А.А., НРС-Р-С-77-25073, приказ №27-ЛНА от 03.02.2022г.",
    short_name: "Сергеев А.А.",
  },
  executor_rep: {
    full_line:  "Главный инженер ООО «СКМ-ГРУПП» Картавченко А.Л., приказ №25-11-03-1 от 03.11.2023",
    short_name: "Картавченко А.Л.",
  },
  rer_rep: {
    full_line:  "Старший мастер 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» Рящиков М.Ю., распоряжение №1399р от 01.07.2025г.",
    short_name: "Рящиков М.Ю.",
  },

  length_m:           63.64,
  pipe_count:         3,
  pipe_diameter_mm:   160,
  pipe_mark:          "ЭЛЕКТРОПАЙП ОС РС 160х8.9 SN16-N F90 T120",
  pipe_docs:          "Паспорт качества №12514 от 09.10.2025г; Сертификат соответствия №РОСС RU.НВ13.Н12882",
  bentonite_qty_l:    6715,
  bentonite_info:     "Глинопорошок бентонитовый для горизонтального бурения \"Bentosolo PG\", паспорт качества №1234",
  polymer_qty_l:      345,
  polymer_info:       "Ингибитор глины «BentoPro PHPA»",
  final_expansion_mm: 500,
  plugs_info:         "Заглушки УКПТ 175/55",
};

const outDir = "tmp-mks-test";
renderMksActs(input, outDir).then(r => {
  console.log(`✅ Готово: ${r.filePath}`);
  console.log(`   Листов заполнено: ${r.sheetsWritten}`);
}).catch(e => {
  console.error("❌ Ошибка:", e.message);
  process.exit(1);
});
