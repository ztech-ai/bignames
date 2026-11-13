import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('research_fetch', Path(__file__).parents[1] / 'scripts/research-fetch.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def snak(value, datatype='wikibase-entityid'):
    return {'snaktype': 'value', 'datavalue': {'type': datatype, 'value': value}}


def time_value(date, precision=11):
    return {'time': '+' + date + 'T00:00:00Z', 'precision': precision}


class ResearchEvidenceTests(unittest.TestCase):
    def test_cutoff_precision_and_future_events(self):
        self.assertEqual(r.safe_date(time_value('2026-11-13'), '2026-11-13'), '2026-11-13')
        self.assertIsNone(r.safe_date(time_value('2026-11-14'), '2026-11-13'))
        self.assertEqual(r.safe_date(time_value('2026-00-00', 9), '2026-11-13'), '2026')
        claim = {'mainsnak': snak({'id': 'Q99'}), 'qualifiers': {'P580': [snak(time_value('2027-01-01'), 'time')]}}
        self.assertIsNone(r.clean_claim(claim, '2026-11-13'))

    def test_deprecated_and_private_claims_excluded(self):
        entity = {'id': 'Q1', 'claims': {
            'P31': [{'mainsnak': snak({'id': 'Q5'})}],
            'P26': [{'mainsnak': snak({'id': 'Q2'})}],
            'P106': [{'rank': 'deprecated', 'mainsnak': snak({'id': 'Q3'})}],
        }}
        clean = r.clean_entity(entity, '2026-11-13')
        self.assertTrue(r.is_human(clean))
        self.assertNotIn('P26', clean['claims'])
        self.assertNotIn('P106', clean['claims'])

    def test_century_and_decade_never_become_exact_birth_years(self):
        for precision in (7, 8):
            raw = time_value('1901-00-00', precision)
            self.assertIsNone(r.safe_date(raw, '2026-11-13'))
            cleaned = r.clean_claim({'mainsnak': snak(raw, 'time')}, '2026-11-13')
            self.assertEqual(cleaned['value']['value']['precision'], precision)
            self.assertIsNone(cleaned['value']['date'])
            self.assertTrue(cleaned['value']['datePrecisionInsufficient'])
        uncertain_start = {'mainsnak': snak({'id': 'Q99'}),
                           'qualifiers': {'P580': [snak(time_value('1990-00-00', 8), 'time')]}}
        cleaned = r.clean_claim(uncertain_start, '2026-11-13')
        self.assertIsNone(cleaned['qualifiers']['P580'][0]['date'])
        self.assertTrue(cleaned['qualifiers']['P580'][0]['datePrecisionInsufficient'])
        self.assertNotIn('futureQualifiersOmitted', cleaned)

    def test_old_cached_precision_is_repaired_without_changing_raw_time(self):
        cached = {'type': 'time', 'value': time_value('1901-00-00', 7), 'date': '1901'}
        r.normalize_cached_dates(cached, '2026-11-13')
        self.assertIsNone(cached['date'])
        self.assertEqual(cached['value']['time'], '+1901-00-00T00:00:00Z')
        self.assertTrue(cached['datePrecisionInsufficient'])

    def test_future_end_keeps_past_start_and_records_exact_omission(self):
        claim = {'mainsnak': snak({'id': 'Q99'}), 'qualifiers': {
            'P580': [snak(time_value('2019-11-01'), 'time')],
            'P582': [snak(time_value('2027-10-31'), 'time')],
        }}
        result = r.clean_claim(claim, '2026-11-13')
        self.assertEqual(result['qualifiers']['P580'][0]['date'], '2019-11-01')
        self.assertNotIn('P582', result['qualifiers'])
        self.assertEqual(result['futureQualifierProperties'], ['P582'])
        omitted = result['omittedDateQualifiers'][0]
        self.assertEqual(omitted['property'], 'P582')
        self.assertEqual(omitted['value']['value']['time'], '+2027-10-31T00:00:00Z')
        self.assertIsNone(omitted['value']['date'])

    def test_no_death_does_not_mean_alive_or_publication_ready(self):
        person = {'id': 'sample', 'enName': 'Sample', 'influence': 4}
        page = {'requestedTitle': 'Sample', 'resolvedTitle': 'Sample', 'hasLivingPeopleCategory': True}
        entity = {'id': 'Q1', 'claims': {}}
        result = r.assemble(person, page, entity, {}, None, '2026-11-13T10:00:00Z', '2026-11-13')
        self.assertEqual(result['lifeStatus']['interpretation'], 'not-confirmed')
        self.assertTrue(result['lifeStatus']['reviewRequired'])
        self.assertFalse(result['publicationReady'])
        self.assertEqual(result['status'], 'needs-review')
        self.assertEqual(result['selection']['influence'], 4)

    def test_explicit_identity_override_excludes_wrong_company_article(self):
        person = {'id': 'sample', 'enName': 'Person'}
        page = {'requestedTitle': 'Person', 'resolvedTitle': 'Person', 'identityOverride': True,
                'suitableForBiography': False, 'intro': '',
                'excludedWikipediaRedirect': {'resolvedTitle': 'Company', 'qid': 'Q2'}}
        result = r.assemble(person, page, {'id': 'Q1', 'claims': {}}, {}, None, '2026-11-13T10:00:00Z', '2026-11-13')
        self.assertEqual([s['id'] for s in result['sources']], ['wikidata'])
        self.assertIsNone(result['intro']['sourceId'])
        self.assertEqual(result['identity']['resolutionMethod'], 'explicit-wikidata-id')
        self.assertEqual(result['identity']['excludedWikipediaRedirect']['qid'], 'Q2')

    def test_roster_directory_ignores_source_and_reserve_files(self):
        with tempfile.TemporaryDirectory() as folder:
            r.dump(Path(folder) / 'sports.json', [{'id': 'person-one', 'name': 'One'}])
            r.dump(Path(folder) / 'sports-sources.json', {'not': 'a roster'})
            r.dump(Path(folder) / 'sports-reserves.json', [{'id': 'reserve'}])
            self.assertEqual([x['id'] for x in r.load_roster(folder)], ['person-one'])

    def test_identity_requires_human_entity(self):
        self.assertFalse(r.is_human({'claims': {'P31': [{'value': {'value': {'id': 'Q43229'}}}]}}))
        self.assertFalse(r.is_human({'claims': {}}))


if __name__ == '__main__':
    unittest.main()
