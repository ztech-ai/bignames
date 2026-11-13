import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// These files are editorial inputs, never inputs to the public biography build.
export const LOCALES = ['zh', 'en', 'fr', 'ar', 'de', 'ja', 'es', 'ko'];
const PROPERTIES = ['P106', 'P27', 'P569', 'P570', 'P19', 'P69', 'P108', 'P39', 'P166', 'P101', 'P800', 'P463', 'P1416', 'P512', 'P856', 'P2031', 'P2032'];
const CAREER = new Set(['P39', 'P108', 'P166', 'P69']);
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const entityId = value => value?.type === 'wikibase-entityid' ? value.value?.id : undefined;
const httpUrl = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

const PROPERTY_LABELS = {
  zh: ['职业', '国籍', '来源所记出生日期', '来源所记死亡日期（未核验）', '出生地', '就读机构', '雇主', '担任职务', '奖项', '研究领域', '代表作品', '组织成员', '所属机构', '学位', '官方网站', '活动开始日期', '活动结束日期'],
  en: ['Occupation', 'Citizenship', 'Source-reported birth date', 'Source-reported death date (unverified)', 'Place of birth', 'Educational institution', 'Employer', 'Position held', 'Award', 'Field of work', 'Notable work', 'Organization membership', 'Affiliation', 'Academic degree', 'Official website', 'Activity start date', 'Activity end date'],
  fr: ['Profession', 'Nationalité', 'Date de naissance indiquée par la source', 'Date de décès indiquée par la source (non vérifiée)', 'Lieu de naissance', 'Établissement fréquenté', 'Employeur', 'Fonction exercée', 'Distinction', 'Domaine de travail', 'Œuvre notable', 'Organisation dont la personne est membre', 'Affiliation', 'Diplôme universitaire', 'Site officiel', "Date de début d'activité", "Date de fin d'activité"],
  ar: ['المهنة', 'الجنسية', 'تاريخ الميلاد الوارد في المصدر', 'تاريخ الوفاة الوارد في المصدر (غير متحقق منه)', 'مكان الميلاد', 'المؤسسة التعليمية', 'جهة العمل', 'المنصب', 'الجائزة', 'مجال العمل', 'عمل بارز', 'عضوية منظمة', 'الانتساب المؤسسي', 'الدرجة الأكاديمية', 'الموقع الرسمي', 'تاريخ بدء النشاط', 'تاريخ انتهاء النشاط'],
  de: ['Beruf', 'Staatsangehörigkeit', 'Geburtsdatum laut Quelle', 'Sterbedatum laut Quelle (ungeprüft)', 'Geburtsort', 'Bildungseinrichtung', 'Arbeitgeber', 'Ausgeübtes Amt', 'Auszeichnung', 'Arbeitsgebiet', 'Bekanntes Werk', 'Mitgliedschaft', 'Zugehörigkeit', 'Akademischer Grad', 'Offizielle Website', 'Beginn der Tätigkeit', 'Ende der Tätigkeit'],
  ja: ['職業', '国籍', '出典に記載された生年月日', '出典に記載された没年月日（未確認）', '出生地', '在籍した教育機関', '雇用主', '役職', '受賞', '活動分野', '代表的な作品', '団体への所属', '所属機関', '学位', '公式サイト', '活動開始日', '活動終了日'],
  es: ['Ocupación', 'Nacionalidad', 'Fecha de nacimiento según la fuente', 'Fecha de fallecimiento según la fuente (sin verificar)', 'Lugar de nacimiento', 'Institución educativa', 'Empleador', 'Cargo desempeñado', 'Distinción', 'Campo de trabajo', 'Obra destacada', 'Pertenencia a una organización', 'Afiliación', 'Grado académico', 'Sitio web oficial', 'Inicio de actividad', 'Fin de actividad'],
  ko: ['직업', '국적', '출처에 기재된 출생일', '출처에 기재된 사망일(미검증)', '출생지', '교육 기관', '고용 기관', '직책', '수상', '활동 분야', '주요 작품', '단체 회원 자격', '소속 기관', '학위', '공식 웹사이트', '활동 시작일', '활동 종료일'],
};
const COPY = {
  zh: { draft: '自动整理的研究草稿；身份、事实、日期和译文均待人工核验。', blocked: '身份资料不足或存在冲突；已暂停生成事实。', birth: '来源记载出生日期', start: '来源记载开始时间', point: '来源记载发生时间', end: '来源记载结束时间', unknown: '来源未提供结束时间；不能据此认定目前仍在任。', education: '就读结束时间不等同于毕业或取得学位。', uncertain: '来源日期存在不确定性，需核对。', raw: '来源日期尚不能规范化', unresolved: '未解析的项目' },
  en: { draft: 'Automatically assembled research draft. Identity, facts, dates and translations require human review.', blocked: 'Identity evidence is missing or conflicting; fact generation is blocked.', birth: 'Birth date reported by source', start: 'Start date reported by source', point: 'Event date reported by source', end: 'End date reported by source', unknown: 'The source gives no end date; this does not establish a current position.', education: 'An education end date does not establish graduation or a degree.', uncertain: 'The source date is uncertain and needs checking.', raw: 'Source date cannot yet be normalized', unresolved: 'Unresolved item' },
  fr: { draft: "Brouillon de recherche assemblé automatiquement. L'identité, les faits, les dates et les traductions doivent être vérifiés.", blocked: "Les données d'identité sont absentes ou contradictoires ; la génération de faits est bloquée.", birth: 'Date de naissance selon la source', start: 'Date de début selon la source', point: "Date de l'événement selon la source", end: 'Date de fin selon la source', unknown: "La source ne donne pas de date de fin ; cela ne prouve pas que la fonction est toujours exercée.", education: "Une date de fin d'études ne prouve ni la réussite ni l'obtention d'un diplôme.", uncertain: 'La date indiquée par la source est incertaine et doit être vérifiée.', raw: 'Date de source non normalisable à ce stade', unresolved: 'Élément non résolu' },
  ar: { draft: 'مسودة بحث جُمعت آليًا. تتطلب الهوية والوقائع والتواريخ والترجمات مراجعة بشرية.', blocked: 'أدلة الهوية ناقصة أو متعارضة؛ أُوقف توليد الوقائع.', birth: 'تاريخ الميلاد حسب المصدر', start: 'تاريخ البدء حسب المصدر', point: 'تاريخ الحدث حسب المصدر', end: 'تاريخ الانتهاء حسب المصدر', unknown: 'لم يحدد المصدر تاريخ انتهاء؛ وهذا لا يثبت استمرار شغل المنصب.', education: 'تاريخ انتهاء الدراسة لا يثبت التخرج أو الحصول على درجة.', uncertain: 'تاريخ المصدر غير يقيني ويحتاج إلى التحقق.', raw: 'تعذر توحيد صيغة تاريخ المصدر حاليًا', unresolved: 'عنصر لم يُحدَّد' },
  de: { draft: 'Automatisch zusammengestellter Forschungsentwurf. Identität, Fakten, Daten und Übersetzungen müssen geprüft werden.', blocked: 'Identitätsbelege fehlen oder widersprechen sich; die Faktengenerierung ist gesperrt.', birth: 'Geburtsdatum laut Quelle', start: 'Beginn laut Quelle', point: 'Ereignisdatum laut Quelle', end: 'Ende laut Quelle', unknown: 'Die Quelle nennt kein Enddatum; daraus folgt keine gegenwärtige Amtsausübung.', education: 'Ein Ausbildungsenddatum belegt weder einen Abschluss noch einen akademischen Grad.', uncertain: 'Das Quelldatum ist unsicher und muss geprüft werden.', raw: 'Quelldatum kann noch nicht normalisiert werden', unresolved: 'Nicht aufgelöster Eintrag' },
  ja: { draft: '自動整理された調査草稿です。本人の同定、事実、日付、翻訳は人による確認が必要です。', blocked: '本人の同定に必要な資料が不足または矛盾しているため、事実の生成を停止しました。', birth: '出典に記載された出生の日付', start: '出典に記載された開始の日付', point: '出典に記載された出来事の日付', end: '出典に記載された終了の日付', unknown: '出典には終了日の記載がありません。現在も在職していることを意味しません。', education: '在学期間の終了日は卒業や学位取得を意味しません。', uncertain: '出典の日付に不確実性があり、確認が必要です。', raw: '出典の日付はまだ正規化できません', unresolved: '未解決の項目' },
  es: { draft: 'Borrador de investigación generado automáticamente. La identidad, los hechos, las fechas y las traducciones requieren revisión humana.', blocked: 'Faltan pruebas de identidad o son contradictorias; la generación de hechos está bloqueada.', birth: 'Fecha de nacimiento según la fuente', start: 'Fecha de inicio según la fuente', point: 'Fecha del acontecimiento según la fuente', end: 'Fecha de fin según la fuente', unknown: 'La fuente no indica una fecha de fin; esto no demuestra que el cargo siga vigente.', education: 'Una fecha de fin de estudios no demuestra la graduación ni la obtención de un título.', uncertain: 'La fecha de la fuente es incierta y requiere comprobación.', raw: 'La fecha de la fuente aún no puede normalizarse', unresolved: 'Elemento sin resolver' },
  ko: { draft: '자동 정리된 조사 초안입니다. 인물 식별, 사실, 날짜와 번역은 사람의 검토가 필요합니다.', blocked: '신원 자료가 부족하거나 상충하여 사실 생성을 중단했습니다.', birth: '출처에 기재된 출생일', start: '출처에 기재된 시작일', point: '출처에 기재된 사건 날짜', end: '출처에 기재된 종료일', unknown: '출처에 종료일이 없습니다. 현재도 재직 중이라는 뜻은 아닙니다.', education: '교육 종료일은 졸업이나 학위 취득을 뜻하지 않습니다.', uncertain: '출처의 날짜가 불확실하여 확인이 필요합니다.', raw: '출처 날짜를 아직 표준화할 수 없습니다', unresolved: '확인되지 않은 항목' },
};
const FUTURE_END_NOTICE = {
  zh: '来源给出未来结束时间，尚未核验；不能据此认定当前任职。',
  en: 'The source gives an unverified future end date; this does not establish a current position.',
  fr: "La source donne une date de fin future non vérifiée ; cela ne prouve pas que la fonction est actuellement exercée.",
  ar: 'يعطي المصدر تاريخ انتهاء مستقبليًا غير متحقق منه؛ وهذا لا يثبت شغل المنصب حاليًا.',
  de: 'Die Quelle nennt ein ungeprüftes zukünftiges Enddatum; daraus folgt keine gegenwärtige Amtsausübung.',
  ja: '出典には未確認の将来の終了日が記載されています。現在の在職を証明するものではありません。',
  es: 'La fuente indica una fecha de fin futura sin verificar; esto no demuestra que el cargo esté vigente.',
  ko: '출처에 미검증된 미래 종료일이 있습니다. 현재 재직 중임을 입증하지는 않습니다.',
};

/** Keep Wikidata precision; never expand a year or month to a made-up day. */
export function normalizeDate(snak, cutoffDate) {
  if (snak?.type !== 'time' || !snak.value) return null;
  const value = snak.value;
  const result = { raw: value.time, precision: value.precision, calendar: value.calendarmodel ?? null, uncertaintyBefore: value.before ?? 0, uncertaintyAfter: value.after ?? 0 };
  const match = /^\+(\d{4})-(\d{2})-(\d{2})T/.exec(value.time ?? '');
  if (!match || !Number.isInteger(value.precision) || value.precision < 9 || (value.calendarmodel && !['http://www.wikidata.org/entity/Q1985727', 'https://www.wikidata.org/entity/Q1985727'].includes(value.calendarmodel))) return { ...result, date: null, cutoffRelation: 'unresolved' };
  const [, year, month, day] = match;
  let date = year;
  if (+year < 1 || value.precision > 14) return { ...result, date: null, cutoffRelation: 'unresolved' };
  if (value.precision >= 10) {
    if (+month < 1 || +month > 12) return { ...result, date: null, cutoffRelation: 'invalid' };
    date += `-${month}`;
  }
  const daysInMonth = new Date(Date.UTC(+year, +month, 0)).getUTCDate();
  if (value.precision >= 11) {
    if (+day < 1 || +day > daysInMonth) return { ...result, date: null, cutoffRelation: 'invalid' };
    date += `-${day}`;
  }
  const earliest = date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date;
  const latest = date.length === 4 ? `${date}-12-31` : date.length === 7 ? `${date}-${String(daysInMonth).padStart(2, '0')}` : date;
  const cutoffRelation = earliest > cutoffDate ? 'after-cutoff' : latest > cutoffDate ? 'overlaps-cutoff' : 'within-cutoff';
  return { ...result, date, earliest, latest, cutoffRelation, uncertain: Boolean(value.before || value.after) };
}

function referenceUrls(references = []) {
  const urls = new Set();
  for (const reference of references) {
    for (const snak of reference.P854 ?? []) { const url = httpUrl(snak.value); if (url) urls.add(url); }
    for (const key of ['P248', 'P143']) {
      for (const snak of reference[key] ?? []) { const id = entityId(snak); if (id) urls.add(`https://www.wikidata.org/wiki/${id}`); }
    }
  }
  return [...urls].sort();
}

function dateRecords(claim, cutoffDate) {
  const result = [];
  for (const property of ['P580', 'P585', 'P582']) {
    for (const snak of claim.qualifiers?.[property] ?? []) {
      const date = normalizeDate(snak, cutoffDate);
      if (date) result.push({ property, ...date });
    }
  }
  return result.sort((a, b) => `${a.property}:${a.raw}`.localeCompare(`${b.property}:${b.raw}`, 'en'));
}

export function createDraft(selection, evidence, { cutoffDate, evidencePath = `data/research/evidence/${selection.id}.json`, evidenceHash } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate ?? '')) throw new Error('A complete cutoffDate is required');
  const blockedReasons = [];
  if (!evidence) blockedReasons.push('missing-evidence');
  else {
    if (evidence.id !== selection.id) blockedReasons.push('evidence-id-mismatch');
    if (evidence.status === 'blocked' || evidence.identity?.disambiguation || evidence.identity?.missing) blockedReasons.push('blocked-source-identity');
    if (!(evidence.claims?.P31 ?? []).some(claim => claim.rank !== 'deprecated' && entityId(claim.value) === 'Q5')) blockedReasons.push('human-P31-not-confirmed');
    if (evidence.identity?.humanEntityConfirmed === false) blockedReasons.push('human-identity-rejected');
    const resolvedQid = evidence.identity?.wikidataId ?? evidence.identity?.qid;
    if (selection.wikidataId && selection.wikidataId !== resolvedQid) blockedReasons.push('selected-entity-mismatch');
  }
  const blocked = blockedReasons.length > 0;
  const sourceUrls = [...new Set((evidence?.sources ?? []).flatMap(source => [source.url, source.permanentUrl]).map(httpUrl).filter(Boolean))].sort();
  const quality = { missingLabels: [], labelFallbacks: [], excludedClaims: [], excludedDates: [], claimsMissingIds: [], uncertainDates: [], datedEventCount: 0, professionalEventCount: 0, factCount: 0, factsWithoutExternalReference: 0 };
  const draft = {
    schemaVersion: 1, generatorVersion: '1.0', id: selection.id, stage: 'research-draft', publicationReady: false,
    reviewStatus: blocked ? 'blocked' : 'needs-editorial-review', cutoffDate,
    evidenceSource: { path: evidencePath, sha256: evidence ? evidenceHash ?? sha256(evidence) : null, capturedAt: evidence?.fetchedAt ?? null, captureIsNotEditorialReview: true, sourceUrls },
    identity: { wikidataId: evidence?.identity?.wikidataId ?? evidence?.identity?.qid ?? null, humanEntityConfirmed: !blocked, editorialIdentityReviewRequired: true, requestedName: selection.enName ?? selection.name, sourceIdentity: evidence?.identity ? clone(evidence.identity) : null, blockedReasons },
    lifeStatus: { status: 'unverified', editorialReviewRequired: true, sourceReportedDeathFacts: [], absenceOfDeathClaimIsNotEvidenceOfLife: true },
    missingChecks: ['editorial-identity-match', 'independent-primary-source-corroboration', 'current-life-status', 'career-chronology-and-completeness', 'source-currency-through-cutoff', 'original-achievements-and-summary', 'human-review-of-all-eight-languages', 'portrait-identity-and-license', 'publication-review'],
    facts: [], timeline: [], localized: {}, quality,
  };

  function label(labels, locale, key, fallback) {
    if (typeof labels?.[locale] === 'string' && labels[locale].trim()) return labels[locale];
    const fallbackLocale = ['en', 'zh', 'fr', 'de', 'es', 'ja', 'ko', 'ar'].find(code => typeof labels?.[code] === 'string' && labels[code].trim());
    const value = fallbackLocale ? labels[fallbackLocale] : fallback;
    quality.missingLabels.push({ locale, key });
    quality.labelFallbacks.push({ locale, key, fallbackLocale: fallbackLocale ?? null, value, unresolved: !fallbackLocale && !fallback });
    return value ?? `${COPY[locale].unresolved}: ${key}`;
  }

  if (!blocked) {
    for (const property of PROPERTIES) {
      for (const claim of evidence.claims?.[property] ?? []) {
        if (claim.rank === 'deprecated') { quality.excludedClaims.push({ property, claimId: claim.id ?? null, reason: 'deprecated' }); continue; }
        const omittedProperties = claim.futureQualifierProperties ?? [];
        if (claim.futureQualifiersOmitted && (!omittedProperties.length || omittedProperties.some(key => key !== 'P582'))) {
          quality.excludedClaims.push({ property, claimId: claim.id ?? null, reason: 'omitted-future-qualifier-not-proven-to-be-end-only', futureQualifiersOmitted: true, futureQualifierProperties: omittedProperties });
          continue;
        }
        const value = claim.value;
        if (!value || ['novalue', 'somevalue'].includes(value.type)) { quality.excludedClaims.push({ property, claimId: claim.id ?? null, reason: 'unknown-value' }); continue; }
        if (!['wikibase-entityid', 'time', 'string', 'monolingualtext', 'quantity'].includes(value.type)) { quality.excludedClaims.push({ property, claimId: claim.id ?? null, reason: 'unsupported-value-type' }); continue; }
        const factId = `fact-${sha256(claim.id ? { property, claimId: claim.id } : { property, value, qualifiers: claim.qualifiers ?? {} }).slice(0, 20)}`;
        if (!claim.id) quality.claimsMissingIds.push(factId);
        const dates = dateRecords(claim, cutoffDate);
        const ownDate = normalizeDate(value, cutoffDate);
        if (ownDate && ['after-cutoff', 'overlaps-cutoff'].includes(ownDate.cutoffRelation)) {
          quality.excludedClaims.push({ property, claimId: claim.id ?? null, reason: ownDate.cutoffRelation }); continue;
        }
        const anchors = dates.filter(date => ['P580', 'P585'].includes(date.property));
        const futureStart = anchors.some(date => date.property === 'P580' && ['after-cutoff', 'overlaps-cutoff'].includes(date.cutoffRelation));
        if (futureStart || (anchors.length && anchors.every(date => ['after-cutoff', 'overlaps-cutoff'].includes(date.cutoffRelation)))) {
          quality.excludedClaims.push({ property, claimId: claim.id ?? null, reason: 'event-not-established-before-cutoff' }); continue;
        }
        const urls = referenceUrls(claim.references);
        const referenceHasExternalUrl = (claim.references ?? []).some(reference => (reference.P854 ?? []).some(snak => httpUrl(snak.value)));
        const fact = {
          id: factId, property, claimId: claim.id ?? null, rank: claim.rank ?? 'normal', value: clone(value),
          qualifiers: clone(claim.qualifiers ?? {}), references: clone(claim.references ?? []), sourceUrls: [...new Set([...urls, ...sourceUrls])].sort(),
          ...(claim.futureQualifiersOmitted ? { futureQualifiersOmitted: true, futureQualifierProperties: clone(omittedProperties), omittedDateQualifiers: clone(claim.omittedDateQualifiers ?? []) } : {}),
          referenceUrls: urls, referenceHasExternalUrl, reviewStatus: 'unverified-source-claim', dates,
          ...(ownDate ? { sourceDate: ownDate } : {}),
          ...(CAREER.has(property) ? { endStatus: omittedProperties.includes('P582') || dates.some(date => date.property === 'P582' && date.cutoffRelation === 'after-cutoff') ? 'source-reported-future-end-unverified' : dates.some(date => date.property === 'P582') ? 'source-reported-not-verified' : 'unknown', currentStatus: 'not-inferred' } : {}),
        };
        draft.facts.push(fact);
        if (!referenceHasExternalUrl) quality.factsWithoutExternalReference++;
        if (property === 'P570') draft.lifeStatus.sourceReportedDeathFacts.push(factId);
        if (ownDate?.uncertain) quality.uncertainDates.push({ factId, property, date: ownDate.date });
        const eventDates = property === 'P569' && ownDate ? [{ property: 'P569', ...ownDate }] : CAREER.has(property) ? dates : [];
        for (const date of eventDates) {
          if (!date.date || date.cutoffRelation !== 'within-cutoff' || date.uncertain) {
            quality.excludedDates.push({ factId, dateProperty: date.property, date: date.date, raw: date.raw, reason: date.uncertain ? 'uncertain-date' : date.cutoffRelation });
            continue;
          }
          const kind = { P569: 'birth', P580: 'start', P585: 'point', P582: 'end' }[date.property];
          draft.timeline.push({ id: `event-${sha256({ factId, property: date.property, date: date.date }).slice(0, 20)}`, factId, claimId: fact.claimId, property, dateProperty: date.property, date: date.date, precision: date.precision, kind, sourceUrls: fact.sourceUrls, reviewStatus: 'unverified-source-claim' });
        }
      }
    }
  }
  draft.facts.sort((a, b) => PROPERTIES.indexOf(a.property) - PROPERTIES.indexOf(b.property) || a.id.localeCompare(b.id, 'en'));
  draft.timeline.sort((a, b) => b.date.localeCompare(a.date, 'en') || a.id.localeCompare(b.id, 'en'));
  // Distinct claims are retained even when their dates conflict: an editor must adjudicate them.
  for (const locale of LOCALES) {
    const copy = COPY[locale];
    const nameLabels = blocked ? {} : { ...evidence.labels };
    if (selection.name) nameLabels.zh = selection.name;
    if (selection.enName) nameLabels.en = selection.enName;
    const local = { name: label(nameLabels, locale, 'person-name', selection.enName ?? selection.name), statusNote: blocked ? copy.blocked : copy.draft, translationStatus: 'template-and-source-labels-unreviewed', facts: [], timeline: [] };
    for (const fact of draft.facts) {
      let text;
      const id = entityId(fact.value);
      if (id) text = label(evidence.relatedEntities?.[id]?.labels, locale, id);
      else if (fact.sourceDate) text = fact.sourceDate.date ?? `${copy.raw}: ${fact.sourceDate.raw}`;
      else if (fact.value.type === 'monolingualtext') {
        text = fact.value.value.text;
        if (fact.value.value.language !== locale) {
          quality.missingLabels.push({ locale, key: fact.id });
          quality.labelFallbacks.push({ locale, key: fact.id, fallbackLocale: fact.value.value.language, value: text, unresolved: false });
        }
      } else if (fact.value.type === 'quantity') text = `${fact.value.value.amount} ${fact.value.value.unit ?? ''}`.trim();
      else text = String(fact.value.value);
      const notes = [];
      if (['P39', 'P108'].includes(fact.property) && fact.endStatus === 'unknown') notes.push(copy.unknown);
      if (['P39', 'P108'].includes(fact.property) && fact.endStatus === 'source-reported-future-end-unverified') notes.push(FUTURE_END_NOTICE[locale]);
      if (fact.property === 'P69' && fact.dates.some(date => date.property === 'P582')) notes.push(copy.education);
      if (fact.sourceDate?.uncertain) notes.push(copy.uncertain);
      local.facts.push({ id: fact.id, label: PROPERTY_LABELS[locale][PROPERTIES.indexOf(fact.property)], value: text, notes });
    }
    const localFacts = new Map(local.facts.map(fact => [fact.id, fact]));
    for (const event of draft.timeline) {
      const fact = localFacts.get(event.factId);
      local.timeline.push({ id: event.id, factId: event.factId, date: event.date, precision: event.precision, kind: event.kind, title: `${fact.label}: ${fact.value}`, text: copy[event.kind], notes: fact.notes });
    }
    draft.localized[locale] = local;
  }
  for (const key of ['missingLabels', 'labelFallbacks']) {
    quality[key] = [...new Map(quality[key].map(entry => [`${entry.locale}:${entry.key}`, entry])).values()].sort((a, b) => `${a.locale}:${a.key}`.localeCompare(`${b.locale}:${b.key}`, 'en'));
  }
  quality.datedEventCount = draft.timeline.length;
  quality.professionalEventCount = draft.timeline.filter(event => event.kind !== 'birth').length;
  quality.factCount = draft.facts.length;
  quality.translationReviewRequired = true;
  quality.sourceReviewRequired = true;
  return draft;
}

/** Deterministic generation: rerunning unchanged evidence leaves files byte-identical. */
export async function generateDrafts({ collectionPath, evidenceDir, outputDir }) {
  const collection = JSON.parse(await readFile(collectionPath, 'utf8'));
  if (!Array.isArray(collection.people)) throw new Error('Collection must contain a people array');
  const ids = new Set();
  for (const person of collection.people) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(person.id) || ids.has(person.id)) throw new Error(`Invalid or duplicate selected id: ${person.id}`);
    ids.add(person.id);
  }
  await mkdir(outputDir, { recursive: true });
  const report = { selected: collection.people.length, drafts: 0, blocked: 0, facts: 0, datedEvents: 0, professionalEvents: 0, draftsWithoutProfessionalEvents: 0, missingLabels: 0, publicationReady: 0, changed: 0 };
  for (const selection of collection.people) {
    const evidencePath = path.join(evidenceDir, `${selection.id}.json`);
    const relativeEvidencePath = path.relative(fileURLToPath(new URL('../', import.meta.url)), evidencePath);
    const displayEvidencePath = relativeEvidencePath.startsWith('..') ? evidencePath : relativeEvidencePath.split(path.sep).join('/');
    let evidence = null, evidenceText;
    try { evidenceText = await readFile(evidencePath, 'utf8'); evidence = JSON.parse(evidenceText); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot read evidence for ${selection.id}: ${error.message}`); }
    const draft = createDraft(selection, evidence, { cutoffDate: collection.cutoffDate, evidencePath: displayEvidencePath, evidenceHash: evidenceText === undefined ? null : sha256(evidenceText) });
    const file = path.join(outputDir, `${selection.id}.json`);
    const text = `${JSON.stringify(draft, null, 2)}\n`;
    let existing;
    try { existing = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing !== text) { await writeFile(`${file}.tmp`, text); await rename(`${file}.tmp`, file); report.changed++; }
    report.drafts++;
    report.blocked += draft.reviewStatus === 'blocked' ? 1 : 0;
    report.facts += draft.quality.factCount;
    report.datedEvents += draft.quality.datedEventCount;
    report.professionalEvents += draft.quality.professionalEventCount;
    report.draftsWithoutProfessionalEvents += draft.quality.professionalEventCount === 0 ? 1 : 0;
    report.missingLabels += draft.quality.missingLabels.length;
  }
  return report;
}

async function main(args) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const options = { collectionPath: path.join(root, 'data/collections/contemporary-1000.json'), evidenceDir: path.join(root, 'data/research/evidence'), outputDir: path.join(root, 'data/research/drafts') };
  const names = { '--collection': 'collectionPath', '--evidence-dir': 'evidenceDir', '--output-dir': 'outputDir' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') { console.log('node scripts/research-drafts.mjs [--collection FILE] [--evidence-dir DIR] [--output-dir DIR]\nCreates unreviewed editorial drafts only; does not publish biographies.'); return; }
    if (!names[args[i]] || !args[i + 1]) throw new Error(`Unknown or incomplete argument: ${args[i]}`);
    options[names[args[i]]] = path.resolve(args[++i]);
  }
  console.log(JSON.stringify(await generateDrafts(options), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
