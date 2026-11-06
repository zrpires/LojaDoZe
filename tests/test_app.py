import json
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

class AppTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(server, 'DB', str(Path(self.tmp.name) / 'test.sqlite3'))
        self.db_patch.start()
        self.env_patch = patch.dict(server.os.environ, {'OPENAI_API_KEY': ''})
        self.env_patch.start()
        server.init_db()

    def tearDown(self):
        self.env_patch.stop()
        self.db_patch.stop()
        self.tmp.cleanup()

    def test_chat_demo_is_explicit(self):
        result = server.action('/api/chat', {'message': 'Como organizar minha rotina?'})
        self.assertEqual(result['mode'], 'demo')
        self.assertTrue(result['reply'])
        with self.assertRaises(server.ValidationError):
            server.action('/api/chat', {'message': ' '})
        with self.assertRaises(server.ValidationError):
            server.action('/api/chat', {'message': 'x' * 2001})

    def test_openai_request_keeps_key_on_server(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'{"choices":[{"message":{"content":"Plano personalizado"}}]}'
        with patch.dict(server.os.environ, {'OPENAI_API_KEY': 'test-only'}), patch.object(server.urllib.request, 'urlopen', return_value=Response()) as call:
            result = server.action('/api/chat', {'message': 'Planeje meu dia'})
            self.assertEqual(result, {'reply': 'Plano personalizado', 'mode': 'openai'})
            request = call.call_args.args[0]
            self.assertEqual(request.get_header('Authorization'), 'Bearer test-only')
            self.assertEqual(json.loads(request.data)['messages'][1]['content'], 'Planeje meu dia')

    def test_provider_failure_is_clear(self):
        with patch.dict(server.os.environ, {'OPENAI_API_KEY': 'test-only'}), patch.object(server.urllib.request, 'urlopen', side_effect=urllib.error.URLError('offline')):
            with self.assertRaisesRegex(server.ValidationError, 'consultar a IA'):
                server.action('/api/chat', {'message': 'Olá'})


    def test_checkout_server_price_and_rollback(self):
        if server.KIND != 'store': self.skipTest('Outro projeto')
        product = server.get_state()['products'][0]
        result = server.action('/api/orders', {'items': [{'id': product['id'], 'quantity': 2, 'price': 1}]})
        self.assertEqual(result['total'], product['price'] * 2)
        self.assertEqual(server.get_state()['products'][0]['stock'], product['stock'] - 2)
        with self.assertRaises(server.ValidationError):
            server.action('/api/orders', {'items': [{'id': product['id'], 'quantity': 1}, {'id': 'missing', 'quantity': 1}]})
        self.assertEqual(server.get_state()['products'][0]['stock'], product['stock'] - 2)
        for items in ([], [{'id': product['id'], 'quantity': -1}], [{'id': product['id'], 'quantity': True}], [{'id': product['id'], 'quantity': 1}] * 2):
            with self.assertRaises(server.ValidationError):
                server.action('/api/orders', {'items': items})
        with server.database() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM orders').fetchone()[0], 1)

    def test_concurrent_orders_cannot_oversell(self):
        if server.KIND != 'store': self.skipTest('Outro projeto')
        with server.database() as db:
            db.execute('UPDATE products SET stock=1 WHERE id=?', ('fone',))
        def checkout(_):
            try:
                server.action('/api/orders', {'items': [{'id': 'fone', 'quantity': 1}]})
                return True
            except server.ValidationError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sum(pool.map(checkout, range(2))), 1)
        with server.database() as db:
            self.assertEqual(db.execute('SELECT stock FROM products WHERE id=?', ('fone',)).fetchone()[0], 0)

    def test_http_assets_json_and_origin(self):
        httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:' + str(httpd.server_port)
        try:
            for path in ('/', '/style.css', '/app.js', '/api/health', '/api/state'):
                with urllib.request.urlopen(base + path) as response:
                    self.assertEqual(response.status, 200)
                    self.assertTrue(response.read())
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(base + '/server.py')
            self.assertEqual(error.exception.code, 404)
            request = urllib.request.Request(base + '/api/chat', data=b'{"message":"Oi"}', headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(json.load(response)['mode'], 'demo')
            request.add_header('Origin', 'https://foreign.example')
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 403)
            request = urllib.request.Request(base + '/api/chat', data=b'[]', headers={'Content-Type': 'application/json'})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 400)
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join()

if __name__ == '__main__':
    unittest.main()
