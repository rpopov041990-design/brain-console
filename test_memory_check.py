import json
import tempfile
import unittest
from pathlib import Path
from memory_check import check_registry

class ReadinessTests(unittest.TestCase):
    def check(self,data):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'registry.json';p.write_text(json.dumps(data))
            before=p.read_bytes();result=check_registry(p)
            self.assertEqual(before,p.read_bytes());return result
    def test_empty(self): self.assertTrue(self.check({'personas':{}})['empty'])
    def test_valid(self): self.assertEqual(self.check({'personas':{'demo':{'name':'Demo'}}})['profiles'],1)
    def test_bad_schema(self):
        with self.assertRaises(ValueError): self.check({'personas':[]})
    def test_bad_capabilities(self):
        with self.assertRaises(ValueError): self.check({'personas':{'a':{'name':'Demo','capabilities':'incorrect'}}})
    def test_orphan_route(self):
        r=self.check({'personas':{},'verified_collaboration_routes':{'routes':{'r':{'source_thread_id':'a','target_thread_id':'b'}}}})
        self.assertEqual(r['orphan_routes'],1)

if __name__=='__main__': unittest.main()
