/**
 * Shared test fixtures for renderer tests.
 * Returns a complete Transition object matching ЗП 5-5 canonical format.
 */

import type { Transition, Organization, Signatory } from "../../src/domain/types.js";

const oek: Organization = {
  id: "oek",
  name: "АО «Объединенная энергетическая компания»",
  short_name: "АО «ОЭК»",
  department: "СВРЭС",
  ogrn: "1057746394155",
  inn: "7720522853",
  legal_address: "115035, г. Москва, Раушская наб., д.8",
  phone: "8 (495) 657-91-01",
  sro_name: "СРО Ассоциация строительных компаний «Межрегиональный строительный комплекс»",
};

const stroytrest: Organization = {
  id: "oek-stroytrest",
  name: "АНО «ОЭК Стройтрест»",
  short_name: "АНО «ОЭК Стройтрест»",
  ogrn: "1247700649591",
  inn: "7708442087",
  legal_address: "107078, г. Москва, ул Каланевская, д. 11, стр.2, помещ. 415",
  phone: "+7(495)228-19-79",
  sro_name: "Саморегулируемая организация",
};

const specinjstroy: Organization = {
  id: "spetsinzhstroy",
  name: "ООО «СПЕЦИНЖСТРОЙ»",
  short_name: "ООО «СПЕЦИНЖСТРОЙ»",
  ogrn: "1167847487444",
  inn: "7806258664",
  legal_address: "123001, г. Москва, ул. Садовая-Кудринская, д. 25, помещ. 2/4",
  phone: "",
  sro_name: "СРО Ассоциация «Объединение проектных организаций»",
};

const sign1: Signatory = {
  person_id: "korobkov-yun",
  role: "sign1",
  org_description: "Представитель АО «ОЭК»",
  position: "Мастер по ЭРС СВРЭС",
  full_name: "Коробков Ю.Н.",
  aosr_full_line: "Мастер по ЭРС СВРЭС АО «ОЭК» Коробков Ю.Н.",
};

const sign2: Signatory = {
  person_id: "buryak-am",
  role: "sign2",
  org_description: "Подрядчик АНО «ОЭК Стройтрест»",
  position: "Начальник участка",
  full_name: "Буряк А.М.",
  nrs_id: "С-58-228991",
  nrs_date: "05.03.2021",
  order_type: "приказ",
  order_number: "699",
  order_date: "01.10.2025",
  aosr_full_line: "Начальник участка управления по строительству сетей электроснабжения АНО \"ОЭК Стройтрест\" Буряк А.М. идентификационный номер С-58-228991 от 05.03.2021г., приказ № 699 от 01.10.2025г.",
};

const sign3: Signatory = {
  person_id: "shcheglov-ra",
  role: "sign3",
  org_description: "Субподрядчик ООО «СПЕЦИНЖСТРОЙ»",
  position: "Начальник участка",
  full_name: "Щеглов Р.А.",
  order_type: "приказ",
  order_number: "265",
  order_date: "06.10.2025",
  aosr_full_line: "Начальник участка ООО \"СПЕЦИНЖСТРОЙ\" Щеглов Р.А., приказ № 265 от 06.10.2025г.",
};

const tech: Signatory = {
  person_id: "gaydukov-ni",
  role: "tech",
  org_description: "Технадзор АО «ОЭК»",
  position: "Главный специалист ОТН",
  full_name: "Гайдуков Н.И.",
  nrs_id: "C-71-259039",
  nrs_date: "23.09.2022",
  order_type: "распоряжение",
  order_number: "01/3349-р",
  order_date: "14.10.2024",
  aosr_full_line: "Главный специалист ОТН АО «ОЭК» Гайдуков Н.И., идентификационный номер C-71-259039 от 23.09.2022, распоряжение №01/3349-р от 14.10.2024г.",
};

export function makeTestTransition(overrides: Partial<Transition> = {}): Transition {
  return {
    id: "kraft-marino-5-5",
    status: "draft",
    created_at: "2025-12-22T10:00:00.000Z",
    customer: "Крафт",
    object: "Марьино",
    gnb_number: "ЗП № 5-5",
    gnb_number_short: "5-5",
    title_line: "Строительство КЛ 10кВ методом ГНБ",
    object_name: "Марьино",
    address: "г. Москва, Огородный проезд, д. 11",
    project_number: "ШФ-123",
    executor: "ООО «СПЕЦИНЖСТРОЙ»",
    start_date: { day: 10, month: "декабря", year: 2025 },
    end_date: { day: 22, month: "декабря", year: 2025 },
    refs: { person_ids: ["korobkov-yun", "buryak-am", "shcheglov-ra", "gaydukov-ni"], org_ids: ["oek", "oek-stroytrest", "spetsinzhstroy"] },
    organizations: { customer: oek, contractor: stroytrest, designer: specinjstroy },
    signatories: { sign1_customer: sign1, sign2_contractor: sign2, sign3_optional: sign3, tech_supervisor: tech },
    pipe: { mark: "Труба ЭЛЕКТРОПАЙП 225/170-N 1250 F2 SDR 13,6", diameter: "d=225", diameter_mm: 225, quality_passport: "№11086 от 08.09.2025" },
    gnb_params: { profile_length: 194.67, pipe_count: 2, plan_length: 61.7, drill_diameter: 350, configuration: "d=225 2шт" },
    source_docs: [],
    generated_files: [],
    revisions: [],
    ...overrides,
  };
}
