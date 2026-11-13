#!/usr/bin/env python3
"""Collect citable public evidence; never turn it into verified/published biographies.

Examples:
  python scripts/research-fetch.py --roster data/collections/contemporary-1000.json --resume
  python scripts/research-fetch.py --roster data/research/rosters --limit 5

Python standard library only. Wikimedia requests identify this project and run
serially, at most two network requests per second. The cache stores only selected
professional biographical properties, not full Wikidata person records.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import html
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ['zh', 'en', 'fr', 'ar', 'de', 'ja', 'es', 'ko']
UA = 'BigNamesResearch/1.0 (https://github.com/ztech-ai/bignames; biography editorial research)'
PROPERTIES = {
    'P31': 'instanceOf', 'P569': 'birthDate', 'P570': 'deathDate',
    'P19': 'birthPlace', 'P27': 'citizenship', 'P106': 'occupation',
    'P69': 'education', 'P108': 'employer', 'P39': 'position',
    'P166': 'award', 'P800': 'notableWork', 'P856': 'officialWebsite',
    'P18': 'image', 'P101': 'fieldOfWork',
    'P2031': 'careerStart', 'P2032': 'careerEnd', 'P463': 'membership',
    'P512': 'academicDegree', 'P1416': 'affiliation',
}
# No family, relationships, religion, health, sexual orientation or other private
# properties. Chronology and professional context only.
QUALIFIERS = {'P580', 'P582', 'P585', 'P1545', 'P512', 'P69', 'P642', 'P3831', 'P768', 'P1001', 'P1026', 'P1365', 'P1366'}
REFERENCES = {'P854', 'P813', 'P248', 'P577', 'P1476', 'P143'}
DATE_NORMALIZATION_VERSION = 2


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def safe_date(value, cutoff):
    """Date comparison that respects Wikidata precision (no invented month/day)."""
    if not isinstance(value, dict) or 'time' not in value:
        return None
    match = re.match(r'^\+(\d{4})-(\d{2})-(\d{2})T', value['time'])
    if not match:
        return None
    year, month, day = match.groups()
    precision = value.get('precision', 9)
    if precision < 9:
        return None
    date = year
    if precision >= 10 and month != '00':
        date += '-' + month
    if precision >= 11 and month != '00' and day != '00':
        date += '-' + day
    if date > cutoff[:len(date)]:
        return None
    return date


def imprecise_time(value):
    return isinstance(value, dict) and value.get('precision', 9) < 9


def normalize_cached_dates(value, cutoff):
    """Recompute derived dates from retained raw Wikidata precision, recursively.

    Old cache entries retained the raw time even when their derived year was too
    precise. Repair them without pretending to have performed a new retrieval.
    """
    if isinstance(value, dict):
        if value.get('type') == 'time' and isinstance(value.get('value'), dict):
            value['date'] = safe_date(value['value'], cutoff)
            if imprecise_time(value['value']):
                value['datePrecisionInsufficient'] = True
            else:
                value.pop('datePrecisionInsufficient', None)
        for item in value.values():
            normalize_cached_dates(item, cutoff)
    elif isinstance(value, list):
        for item in value:
            normalize_cached_dates(item, cutoff)
    return value


def snak_value(snak):
    if snak.get('snaktype') != 'value':
        return {'type': snak.get('snaktype', 'unknown')}
    data = snak.get('datavalue', {})
    return {'type': data.get('type'), 'value': data.get('value')}


def clean_claim(claim, cutoff):
    if claim.get('rank') == 'deprecated':
        return None
    main = snak_value(claim.get('mainsnak', {}))
    if (main.get('type') == 'time' and safe_date(main.get('value'), cutoff) is None
            and not imprecise_time(main.get('value'))):
        return None
    qualifiers = {}
    future = False
    omitted_dates = []
    for prop, values in claim.get('qualifiers', {}).items():
        if prop not in QUALIFIERS:
            continue
        keep = []
        for s in values:
            v = snak_value(s)
            if v.get('type') == 'time':
                v['date'] = safe_date(v.get('value'), cutoff)
                if imprecise_time(v.get('value')):
                    v['datePrecisionInsufficient'] = True
                elif v['date'] is None:
                    # A future end does not prove a future appointment. Preserve
                    # the statement but make that qualifier unusable as history.
                    future = True
                    omitted_dates.append({'property': prop, 'value': v,
                                          'reason': 'after-cutoff-or-invalid-date'})
                    continue
            keep.append(v)
        if keep:
            qualifiers[prop] = keep
    if main.get('type') == 'time':
        main['date'] = safe_date(main['value'], cutoff)
        if imprecise_time(main['value']):
            main['datePrecisionInsufficient'] = True
    refs = []
    for ref in claim.get('references', []):
        vals = {p: [snak_value(s) for s in values] for p, values in ref.get('snaks', {}).items() if p in REFERENCES}
        if vals:
            refs.append(vals)
    # If start/point-in-time is future, do not offer the statement as an event.
    for prop in ('P580', 'P585'):
        for value in claim.get('qualifiers', {}).get(prop, []):
            raw = snak_value(value)
            if (raw.get('type') == 'time' and safe_date(raw.get('value'), cutoff) is None
                    and not imprecise_time(raw.get('value'))):
                return None
    return {'id': claim.get('id'), 'rank': claim.get('rank', 'normal'),
            'value': main, 'qualifiers': qualifiers, 'references': refs,
            **({'futureQualifiersOmitted': True,
                'futureQualifierProperties': sorted({v['property'] for v in omitted_dates}),
                'omittedDateQualifiers': omitted_dates} if future else {})}


def clean_entity(entity, cutoff):
    claims = {}
    for prop, raw in entity.get('claims', {}).items():
        if prop in PROPERTIES:
            cleaned = [c for x in raw if (c := clean_claim(x, cutoff)) is not None]
            if cleaned:
                claims[prop] = cleaned
    return {'id': entity['id'], 'dateNormalizationVersion': DATE_NORMALIZATION_VERSION,
            'lastRevisionId': entity.get('lastrevid'),
            'modified': entity.get('modified'),
            'labels': {l: v['value'] for l, v in entity.get('labels', {}).items() if l in LANGUAGES},
            'descriptions': {l: v['value'] for l, v in entity.get('descriptions', {}).items() if l in LANGUAGES},
            'sitelinks': {k: v for k, v in entity.get('sitelinks', {}).items() if k in [x + 'wiki' for x in LANGUAGES]},
            'claims': claims}


def entity_ids(value):
    result = set()
    if isinstance(value, dict):
        if value.get('type') == 'wikibase-entityid' and isinstance(value.get('value'), dict):
            q = value['value'].get('id')
            if q and re.fullmatch(r'Q\d+', q):
                result.add(q)
        for v in value.values():
            result |= entity_ids(v)
    elif isinstance(value, list):
        for v in value:
            result |= entity_ids(v)
    return result


def is_human(entity):
    return any(c['value'].get('value', {}).get('id') == 'Q5'
               for c in entity.get('claims', {}).get('P31', [])
               if isinstance(c['value'].get('value'), dict))


def load_roster(path):
    path = Path(path)
    if path.is_dir():
        files = sorted(f for f in path.glob('*.json') if not re.search(r'-(?:sources|reserves)\.json$', f.name))
        if not files:
            raise ValueError('No roster files ready in ' + str(path))
        people = []
        for f in files:
            data = read(f)
            people += data if isinstance(data, list) else data['people']
    else:
        data = read(path)
        people = data if isinstance(data, list) else data['people']
    seen = set()
    for p in people:
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', p.get('id', '')):
            raise ValueError('Invalid person id: ' + repr(p.get('id')))
        if p['id'] in seen:
            raise ValueError('Duplicate roster id: ' + p['id'])
        seen.add(p['id'])
    return people


class Client:
    def __init__(self, cache, cutoff, delay=0.5, refresh=False):
        self.cache = Path(cache)
        self.cutoff = cutoff
        self.delay = delay
        self.refresh = refresh
        self.last_request = 0
        self.requests = 0
        self.cache_hits = 0

    def request(self, url, binary=False):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != 'https' or (binary and parsed.hostname not in ('upload.wikimedia.org', 'thumb.wikimedia.org')):
            raise ValueError('Unexpected research download URL')
        for attempt in range(4):
            time.sleep(max(0, self.delay - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            self.requests += 1
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*' if binary else 'application/json'})
                with urllib.request.urlopen(req, timeout=60) as r:
                    raw = r.read()
                    if binary:
                        return raw
                    data = json.loads(raw)
                    if 'error' in data:
                        err = data['error']
                        if err.get('code') in ('maxlag', 'ratelimited') and attempt < 3:
                            time.sleep(min(30, 2 ** (attempt + 1)))
                            continue
                        raise RuntimeError('API ' + json.dumps(err, ensure_ascii=False))
                    return data
            except urllib.error.HTTPError as e:
                if e.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise
                retry = e.headers.get('Retry-After', '')
                time.sleep(min(55, int(retry) if retry.isdigit() else 2 ** (attempt + 1)))
            except (urllib.error.URLError, TimeoutError):
                if attempt == 3:
                    raise
                time.sleep(2 ** (attempt + 1))
        raise RuntimeError('Request exhausted retries')

    def api(self, base, params):
        params = {'format': 'json', 'formatversion': 2, 'maxlag': 5, **params}
        return self.request(base + '?' + urllib.parse.urlencode(params))

    def wiki_pages(self, people):
        # Cache only processed extracts/metadata, not full articles.
        titles = [p.get('wikipediaTitle') or p.get('enName') or p['name'] for p in people]
        key = hashlib.sha256(json.dumps(titles).encode()).hexdigest()[:24]
        file = self.cache / 'wiki-pages' / (key + '.json')
        if file.exists() and not self.refresh:
            cached = read(file)
            if cached.get('fetchedAt', '')[:10] == now()[:10]:
                self.cache_hits += 1
                return cached
        data = self.api('https://en.wikipedia.org/w/api.php', {
            'action': 'query', 'titles': '|'.join(titles), 'redirects': 1,
            'prop': 'pageprops|extracts|info|revisions|categories',
            'ppprop': 'wikibase_item|disambiguation', 'exintro': 1, 'explaintext': 1,
            'exchars': 1200, 'exlimit': min(len(titles), 20), 'inprop': 'url',
            'rvprop': 'ids|timestamp', 'clcategories': 'Category:Living people', 'cllimit': 'max',
        })
        query = data.get('query', {})
        maps = {x['from']: x['to'] for x in query.get('normalized', []) + query.get('redirects', [])}
        pages = {p['title']: p for p in query.get('pages', [])}
        result = {'fetchedAt': now(), 'people': {}}
        for person, title in zip(people, titles):
            visited = set()
            resolved = title
            while resolved in maps and resolved not in visited:
                visited.add(resolved)
                resolved = maps[resolved]
            page = pages.get(resolved, {'title': resolved, 'missing': True})
            result['people'][person['id']] = {
                'requestedTitle': title, 'resolvedTitle': resolved,
                'missing': bool(page.get('missing')), 'disambiguation': 'disambiguation' in page.get('pageprops', {}),
                'qid': page.get('pageprops', {}).get('wikibase_item'),
                'url': page.get('fullurl'), 'revision': (page.get('revisions') or [{}])[0],
                'intro': page.get('extract', '')[:1600],
                'hasLivingPeopleCategory': any(c['title'] == 'Category:Living people' for c in page.get('categories', [])),
            }
        dump(file, result)
        return result

    def entities(self, ids, labels_only=False):
        results, missing = {}, []
        kind = 'labels' if labels_only else 'entities'
        for qid in sorted(set(ids)):
            file = self.cache / kind / (qid + '.json')
            if file.exists() and not self.refresh:
                data = read(file)
                if data.get('fetchedAt', '')[:10] == now()[:10] and (labels_only or data.get('cutoffDate') == self.cutoff):
                    if not labels_only and data.get('dateNormalizationVersion') != DATE_NORMALIZATION_VERSION:
                        normalize_cached_dates(data.get('claims', {}), self.cutoff)
                        data['dateNormalizationVersion'] = DATE_NORMALIZATION_VERSION
                        dump(file, data)
                    results[qid] = data
                    self.cache_hits += 1
                    continue
            missing.append(qid)
        for start in range(0, len(missing), 30):
            batch = missing[start:start + 30]
            data = self.api('https://www.wikidata.org/w/api.php', {
                'action': 'wbgetentities', 'ids': '|'.join(batch),
                'props': 'labels|descriptions' if labels_only else 'info|labels|descriptions|claims|sitelinks',
                'languages': '|'.join(LANGUAGES), 'sitefilter': '|'.join(l + 'wiki' for l in LANGUAGES),
            })
            for qid, raw in data.get('entities', {}).items():
                if 'missing' in raw:
                    continue
                if labels_only:
                    result = {'id': qid, 'fetchedAt': now(), 'labels': {k: v['value'] for k, v in raw.get('labels', {}).items()},
                              'descriptions': {k: v['value'] for k, v in raw.get('descriptions', {}).items()}}
                else:
                    result = {**clean_entity(raw, self.cutoff), 'fetchedAt': now(), 'cutoffDate': self.cutoff}
                results[qid] = result
                dump(self.cache / kind / (qid + '.json'), result)
        return results

    def commons(self, titles, download=True):
        results, missing = {}, []
        for title in sorted(set(titles)):
            title = title if title.startswith('File:') else 'File:' + title
            key = hashlib.sha256(title.encode()).hexdigest()[:24]
            file = self.cache / 'commons' / (key + '.json')
            cached = read(file) if file.exists() else None
            if (cached and not self.refresh and cached.get('fetchedAt', '')[:10] == now()[:10]
                and not (download and cached.get('downloadError'))):
                results[title] = cached
                self.cache_hits += 1
            else:
                missing.append(title)
        for start in range(0, len(missing), 25):
            batch = missing[start:start + 25]
            data = self.api('https://commons.wikimedia.org/w/api.php', {
                'action': 'query', 'titles': '|'.join(batch), 'prop': 'imageinfo',
                'iiprop': 'url|extmetadata|size|timestamp', 'iiurlwidth': 600, 'iiurlheight': 800, 'iilimit': 1,
            })
            for page in data.get('query', {}).get('pages', []):
                title = page['title']
                info = (page.get('imageinfo') or [{}])[0]
                metadata = info.get('extmetadata', {})
                def val(k):
                    raw = metadata.get(k, {}).get('value', '')
                    return html.unescape(re.sub('<[^>]+>', '', raw)).strip()
                license_name = val('LicenseShortName')
                license_url = val('LicenseUrl')
                author = val('Artist')
                is_open = bool(re.search(r'CC[ -]BY|CC0|Public domain|PDM', license_name, re.I))
                result = {
                    'title': title, 'fetchedAt': now(), 'sourceUrl': info.get('descriptionurl'),
                    'originalUrl': info.get('url'), 'thumbnailUrl': info.get('thumburl'),
                    'width': info.get('width'), 'height': info.get('height'),
                    'thumbnailWidth': info.get('thumbwidth'), 'thumbnailHeight': info.get('thumbheight'),
                    'mediaTimestamp': info.get('timestamp'), 'license': license_name,
                    'licenseUrl': license_url, 'author': author, 'credit': val('Credit'),
                    'description': val('ImageDescription')[:2000], 'attributionRequired': val('AttributionRequired'),
                    'openLicenseRecognized': is_open, 'identityReviewRequired': True,
                    'colorReviewRequired': True,
                }
                key = hashlib.sha256(title.encode()).hexdigest()[:24]
                if download and is_open and info.get('thumburl') and license_name and (license_url or 'public domain' in license_name.lower()):
                    ext = Path(urllib.parse.urlparse(info['thumburl']).path).suffix.lower()
                    if ext in ('.jpg', '.jpeg', '.png', '.webp'):
                        image_path = self.cache / 'portraits' / (key + ext)
                        try:
                            if not image_path.exists():
                                raw = self.request(info['thumburl'], binary=True)
                                valid = raw.startswith(b'\xff\xd8\xff') or raw.startswith(b'\x89PNG\r\n\x1a\n') or (raw[:4] == b'RIFF' and raw[8:12] == b'WEBP')
                                if not valid or len(raw) < 1000:
                                    raise ValueError('Thumbnail response is not a supported image')
                                image_path.parent.mkdir(parents=True, exist_ok=True)
                                image_path.write_bytes(raw)
                            result['cachedImage'] = str(image_path.relative_to(ROOT))
                            result['cachedImageBytes'] = image_path.stat().st_size
                            result['cachedImageSha256'] = hashlib.sha256(image_path.read_bytes()).hexdigest()
                        except Exception as exc:
                            result['downloadError'] = type(exc).__name__ + ': ' + str(exc)
                dump(self.cache / 'commons' / (key + '.json'), result)
                results[title] = result
        return results


def assemble(person, page, entity, labels, image, fetched, cutoff):
    source_url = page.get('url') or ('https://en.wikipedia.org/wiki/' + urllib.parse.quote(page['resolvedTitle'].replace(' ', '_')))
    rev = page.get('revision', {})
    qid = entity['id']
    death = entity.get('claims', {}).get('P570', [])
    death_dates = [c['value'].get('date') for c in death if c['value'].get('date')]
    related = entity_ids(entity.get('claims', {}))
    return {
        'schemaVersion': 2, 'dateNormalizationVersion': DATE_NORMALIZATION_VERSION, 'id': person['id'], 'cutoffDate': cutoff,
        'selection': {k: v for k, v in person.items() if k in ('name', 'enName', 'domain', 'domains', 'regions', 'subfield', 'inclusionReason', 'priority') or k.startswith('influence')},
        'fetchedAt': fetched, 'status': 'needs-review', 'publicationReady': False,
        'identity': {'requestedName': person.get('enName'), 'requestedTitle': page['requestedTitle'],
                     'resolvedTitle': page['resolvedTitle'], 'wikidataId': qid,
                     'humanEntityConfirmed': True, 'editorialIdentityReviewRequired': True,
                     'resolutionMethod': 'explicit-wikidata-id' if page.get('identityOverride') else 'wikipedia-pageprops',
                     **({'excludedWikipediaRedirect': page['excludedWikipediaRedirect']} if page.get('excludedWikipediaRedirect') else {})},
        'lifeStatus': {'reviewRequired': True, 'deathDatesInSource': death_dates,
                       'livingCategoryInSource': page.get('hasLivingPeopleCategory', False),
                       'interpretation': 'reported-deceased' if death_dates else 'not-confirmed',
                       'note': 'No death statement is not proof of life. Check recent independent/official evidence before setting death=null.'},
        'sources': ([
            {'id': 'wikipedia-en', 'url': source_url, 'title': page['resolvedTitle'], 'publisher': 'Wikipedia',
             'retrievedAt': fetched, 'revisionId': rev.get('revid'), 'revisionTimestamp': rev.get('timestamp'),
             'permanentUrl': 'https://en.wikipedia.org/w/index.php?oldid=' + str(rev['revid']) if rev.get('revid') else None,
             'license': 'CC BY-SA 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/'},
        ] if page.get('suitableForBiography', True) else []) + [
            {'id': 'wikidata', 'url': 'https://www.wikidata.org/wiki/' + qid, 'title': qid,
             'publisher': 'Wikidata', 'retrievedAt': entity.get('fetchedAt'), 'revisionId': entity.get('lastRevisionId'),
             'revisionTimestamp': entity.get('modified'), 'license': 'CC0',
             'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/'},
        ],
        'intro': {'language': 'en', 'text': page.get('intro', ''), 'sourceId': 'wikipedia-en' if page.get('suitableForBiography', True) else None,
                  'usage': 'Research excerpt; paraphrase and cross-check before publication.'},
        'labels': entity.get('labels', {}), 'descriptions': entity.get('descriptions', {}),
        'languageArticles': {k[:-4]: v['title'] for k, v in entity.get('sitelinks', {}).items()},
        'claims': entity.get('claims', {}), 'propertyNames': {p: PROPERTIES[p] for p in entity.get('claims', {})},
        'relatedEntities': {q: labels[q] for q in sorted(related) if q in labels},
        'portrait': image,
        'qualitySignals': {
            'hasBirthDate': any(c['value'].get('date') for c in entity.get('claims', {}).get('P569', [])),
            'datedProfessionalStatements': sum(any(v.get('date') for vals in c.get('qualifiers', {}).values() for v in vals) for prop, cs in entity.get('claims', {}).items() if prop in ('P69', 'P108', 'P39', 'P166', 'P800', 'P463', 'P512', 'P1416') for c in cs),
            'referenceUrls': len({v.get('value') for cs in entity.get('claims', {}).values() for c in cs for ref in c.get('references', []) for v in ref.get('P854', []) if isinstance(v.get('value'), str)}),
            'sourceRevisionAfterCutoff': any(t and t[:10] > cutoff for t in (rev.get('timestamp'), entity.get('modified'))),
        },
        'reviewChecklist': ['Confirm identity against official biography', 'Check living/deceased status as of cutoff',
                            'Review latest career events and distinguish former/current offices',
                            'Cross-check significant claims against primary/independent sources',
                            'Write original concise summary and reverse chronology',
                            'Verify portrait identity, license, credit and original color',
                            'Review all eight language versions against the same canonical facts'],
        'coverageNote': 'Retrieved public structured evidence, not a verified complete biography. Retrieval date does not prove coverage through cutoff.',
    }


def run(args):
    people = load_roster(args.roster)
    if args.limit:
        people = people[:args.limit]
    cache, evidence_dir = ROOT / 'data/research/cache', ROOT / 'data/research/evidence'
    evidence_dir.mkdir(parents=True, exist_ok=True)
    client = Client(cache, args.cutoff, args.delay, args.refresh)
    pending = []
    skipped = 0
    for p in people:
        file = evidence_dir / (p['id'] + '.json')
        if args.resume and not args.refresh and file.exists():
            prior = read(file)
            if (prior.get('status') == 'needs-review' and prior.get('cutoffDate') == args.cutoff
                    and 'qualitySignals' in prior
                    and prior.get('dateNormalizationVersion') == DATE_NORMALIZATION_VERSION
                    and not (prior.get('portrait') or {}).get('downloadError')
                    and prior.get('identity', {}).get('requestedTitle') == (p.get('wikipediaTitle') or p.get('enName') or p['name'])
                    and (not p.get('wikidataId') or prior.get('identity', {}).get('wikidataId') == p['wikidataId'])):
                prior['selection'] = {k: v for k, v in p.items() if k in ('name', 'enName', 'domain', 'domains', 'regions', 'subfield', 'inclusionReason', 'priority') or k.startswith('influence')}
                dump(file, prior)
                skipped += 1
                continue
        pending.append(p)
    print(json.dumps({'event': 'start', 'selected': len(people), 'pending': len(pending), 'resumed': skipped}), flush=True)
    for start in range(0, len(pending), 20):
        group = pending[start:start + 20]
        try:
            pages = client.wiki_pages(group)
            qids = [p.get('wikidataId') or pages['people'][p['id']].get('qid') for p in group
                    if p.get('wikidataId') or (pages['people'][p['id']].get('qid') and not pages['people'][p['id']]['disambiguation'] and not pages['people'][p['id']]['missing'])]
            if any(not re.fullmatch(r'Q\d+', q) for q in qids):
                raise ValueError('Invalid explicit Wikidata ID')
            entities = client.entities(qids)
            refs = set()
            for ent in entities.values():
                refs |= entity_ids(ent.get('claims', {}))
            labels = client.entities(refs, labels_only=True)
            image_titles = []
            person_image = {}
            for qid, ent in entities.items():
                files = [c['value'].get('value') for c in ent.get('claims', {}).get('P18', [])]
                files = [v for v in files if isinstance(v, str)]
                if files:
                    title = 'File:' + files[0]
                    person_image[qid] = title
                    image_titles.append(title)
            try:
                images = client.commons(image_titles, download=not args.skip_images)
            except Exception as exc:
                images = {}
                print(json.dumps({'event': 'image-metadata-error', 'error': str(exc)}), flush=True)
            for person in group:
                page = dict(pages['people'][person['id']])
                override = person.get('wikidataId')
                entity = entities.get(override or page.get('qid'))
                if override and entity:
                    page['identityOverride'] = True
                    if page.get('qid') != override or page['missing'] or page['disambiguation']:
                        page['excludedWikipediaRedirect'] = {k: page.get(k) for k in ('resolvedTitle', 'qid', 'url')}
                        page.update({'suitableForBiography': False, 'intro': '', 'hasLivingPeopleCategory': False, 'revision': {},
                                     'resolvedTitle': entity.get('labels', {}).get('en', person.get('enName', '')), 'url': None})
                error = ('Wikipedia page missing' if page['missing'] and not override else
                         'Wikipedia disambiguation page' if page['disambiguation'] and not override else
                         'Wikidata entity unavailable' if not entity else
                         'Entity is not confirmed human (P31=Q5)' if not is_human(entity) else None)
                if error:
                    data = {'schemaVersion': 1, 'id': person['id'], 'cutoffDate': args.cutoff, 'fetchedAt': now(),
                            'status': 'blocked', 'publicationReady': False, 'identity': page, 'errors': [error]}
                else:
                    data = assemble(person, page, entity, labels, images.get(person_image.get(entity['id'])), pages['fetchedAt'], args.cutoff)
                dump(evidence_dir / (person['id'] + '.json'), data)
        except Exception as exc:
            for person in group:
                dump(evidence_dir / (person['id'] + '.json'), {'schemaVersion': 1, 'id': person['id'], 'cutoffDate': args.cutoff,
                     'fetchedAt': now(), 'status': 'blocked', 'publicationReady': False, 'errors': [type(exc).__name__ + ': ' + str(exc)]})
            print(json.dumps({'event': 'batch-error', 'error': str(exc), 'first': group[0]['id']}), flush=True)
        progress = {'event': 'progress', 'processed': min(start + len(group), len(pending)), 'total': len(pending),
                    'selected': len(people), 'resumed': skipped, 'generatedAt': now(),
                    'requests': client.requests, 'cacheHits': client.cache_hits}
        dump(evidence_dir / '_progress.json', progress)
        print(json.dumps(progress), flush=True)
    records = [read(evidence_dir / (p['id'] + '.json')) for p in people]
    identities = {}
    for record in records:
        qid = record.get('identity', {}).get('wikidataId')
        if qid:
            identities.setdefault(qid, []).append(record['id'])
    report = {'schemaVersion': 1, 'generatedAt': now(), 'cutoffDate': args.cutoff,
              'roster': str(Path(args.roster)), 'selected': len(people),
              'evidenceCollected': sum(r['status'] == 'needs-review' for r in records),
              'blocked': [{'id': r['id'], 'errors': r.get('errors', [])} for r in records if r['status'] == 'blocked'],
              'reportedDeceased': [r['id'] for r in records if r.get('lifeStatus', {}).get('deathDatesInSource')],
              'withPortraitMetadata': sum(bool(r.get('portrait')) for r in records),
              'withCachedPortrait': sum(bool(r.get('portrait', {}).get('cachedImage')) for r in records if r.get('portrait')),
              'duplicateIdentities': {qid: ids for qid, ids in identities.items() if len(ids) > 1},
              'missingBirthDate': [r['id'] for r in records if r.get('status') == 'needs-review' and not r.get('qualitySignals', {}).get('hasBirthDate')],
              'publicationReady': 0, 'requests': client.requests, 'cacheHits': client.cache_hits}
    dump(evidence_dir / '_report.json', report)
    print(json.dumps(report, ensure_ascii=False), flush=True)
    return 0 if not report['blocked'] else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--roster', default=str(ROOT / 'data/research/rosters'))
    parser.add_argument('--limit', type=int)
    parser.add_argument('--cutoff', default='2026-11-13')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--refresh', action='store_true', help='Request fresh source metadata instead of same-day caches')
    parser.add_argument('--skip-images', action='store_true')
    parser.add_argument('--delay', type=float, default=0.5)
    args = parser.parse_args()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.cutoff):
        parser.error('--cutoff must be YYYY-MM-DD')
    try:
        cutoff_day = dt.date.fromisoformat(args.cutoff)
        if cutoff_day > dt.datetime.now(dt.timezone.utc).date():
            parser.error('--cutoff cannot be a future date')
    except ValueError:
        parser.error('--cutoff must be a valid calendar date')
    if args.delay < 0.5:
        parser.error('--delay must be at least 0.5 seconds')
    if args.limit is not None and args.limit < 1:
        parser.error('--limit must be positive')
    return run(args)


if __name__ == '__main__':
    raise SystemExit(main())
