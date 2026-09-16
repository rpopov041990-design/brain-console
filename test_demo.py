import unittest
from unittest.mock import patch
from demo import demo_snapshot
from server import snapshot,memory_search,neighbors

class DemoTests(unittest.TestCase):
    def test_no_private_reads(self):
        with patch('pathlib.Path.read_text',side_effect=AssertionError('Unexpected file read')):
            d=snapshot(None,'pinned')
        self.assertTrue(d['demo']); self.assertEqual(d['registryCount'],6)
    def test_edges_resolve(self):
        for scope in ['pinned','global']:
            d=demo_snapshot(scope); ids={n['id'] for n in d['nodes']}
            self.assertEqual(len(ids),len(d['nodes']))
            for e in d['edges']:
                self.assertIn(e['source'],ids); self.assertIn(e['target'],ids)
    def test_separate_scopes_and_stable_version(self):
        a=demo_snapshot('pinned'); b=demo_snapshot('global')
        self.assertFalse({n['id'] for n in a['nodes']}&{n['id'] for n in b['nodes']})
        self.assertEqual(a['version'],demo_snapshot('pinned')['version'])
    def test_search_and_neighbors(self):
        d=memory_search(None,'pinned','Альта',0)
        self.assertEqual(len(d['items']),1)
        self.assertGreater(len(neighbors(None,'pinned',d['items'][0]['uuid'])['items']),0)

if __name__=='__main__': unittest.main()
