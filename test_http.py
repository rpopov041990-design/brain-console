"""Portable HTTP smoke tests: isolated demo only, no private data or database."""
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch
from server import Handler


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.server.daemon_threads = True
        cls.server.driver = None
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def get(self, path):
        with urlopen(self.url + path, timeout=5) as response:
            return response.read()

    def test_demo_and_scopes(self):
        a = json.loads(self.get('/api/snapshot?scope=pinned'))
        b = json.loads(self.get('/api/snapshot?scope=global'))
        self.assertTrue(a['demo'])
        self.assertEqual(a['registryCount'], 6)
        self.assertFalse({n['id'] for n in a['nodes']} & {n['id'] for n in b['nodes']})

    def test_index_and_assets(self):
        if not (Path(__file__).parent / 'dist/index.html').exists():
            self.skipTest('Run npm run build for the static-assets check')
        page = self.get('/').decode('utf-8')
        self.assertIn('id="root"', page)
        import re
        scripts = re.findall(r'src="(/assets/[^\"]+\.js)"', page)
        self.assertTrue(scripts)
        for script in scripts:
            with patch('server.mimetypes.guess_type', return_value=('text/plain', None)):
                with urlopen(self.url + script, timeout=5) as response:
                    self.assertEqual(response.headers.get_content_type(), 'text/javascript')
                    self.assertGreater(len(response.read()), 1000)

    def test_cross_origin_rejected(self):
        request = Request(self.url + '/api/snapshot', headers={'Origin': 'https://example.invalid'})
        with self.assertRaises(HTTPError) as caught:
            urlopen(request, timeout=5)
        self.assertEqual(caught.exception.code, 403)
        caught.exception.close()


if __name__ == '__main__':
    unittest.main()
