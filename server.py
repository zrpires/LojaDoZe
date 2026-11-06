import json
import os
import sqlite3
import urllib.request
import urllib.error
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).parent
DB = os.environ.get('DATABASE_PATH', str(ROOT / 'data.sqlite3'))
KIND = json.loads((ROOT / 'project.json').read_text())['kind']
PRODUCTS = [
    {'id': 'fone', 'name': 'Fone sem fio', 'category': 'Áudio', 'price': 18990, 'stock': 12, 'icon': '🎧', 'description': 'Conforto para estudar, trabalhar e ouvir música.'},
    {'id': 'mochila', 'name': 'Mochila urbana', 'category': 'Rotina', 'price': 14990, 'stock': 8, 'icon': '🎒', 'description': 'Organize notebook e acessórios na sua rotina.'},
    {'id': 'luminaria', 'name': 'Luminária de mesa', 'category': 'Casa', 'price': 8990, 'stock': 15, 'icon': '💡', 'description': 'Luz ajustável para seu espaço de estudo.'},
    {'id': 'garrafa', 'name': 'Garrafa térmica', 'category': 'Rotina', 'price': 6990, 'stock': 20, 'icon': '🥤', 'description': 'Hidratação em movimento, capacidade de 750 ml.'},
    {'id': 'teclado', 'name': 'Teclado compacto', 'category': 'Tecnologia', 'price': 21990, 'stock': 6, 'icon': '⌨️', 'description': 'Mais espaço na mesa e conforto ao digitar.'},
    {'id': 'organizador', 'name': 'Organizador de mesa', 'category': 'Casa', 'price': 4990, 'stock': 18, 'icon': '🗂️', 'description': 'Um lugar para cada item do seu escritório.'},
]

@contextmanager
def database():
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()

def init_db():
    with database() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER DEFAULT 0, due TEXT);
        CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY, title TEXT NOT NULL, cents INTEGER NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, name TEXT, category TEXT, price INTEGER, stock INTEGER, icon TEXT, description TEXT);
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, total INTEGER, items TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP);
        """)
        db.executemany('INSERT OR IGNORE INTO products VALUES(:id,:name,:category,:price,:stock,:icon,:description)', PRODUCTS)

class ValidationError(Exception):
    pass

def required_text(data, key, maximum=2000):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValidationError(f'Informe {key} com até {maximum} caracteres.')
    return value.strip()

def ai_reply(message, context):
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        if KIND == 'store':
            return 'Para estudar, considere a luminária e o organizador. Para trabalhar com áudio, veja o fone. Compare preços e estoque no catálogo. Diga seu orçamento para receber uma recomendação personalizada ao ativar a IA.', 'demo'
        if KIND == 'voice':
            return 'Ouvi sua mensagem: “' + message + '”. Posso ajudar a organizar ideias e planejar próximos passos. Esta é uma resposta demonstrativa; configure OPENAI_API_KEY para conversar com a IA.', 'demo'
        return 'Comece identificando o resultado desejado, escolha uma ação pequena e reserve um horário para executá-la. Confira suas tarefas e despesas no painel. Configure OPENAI_API_KEY para um plano personalizado.', 'demo'
    body = {'model': os.environ.get('OPENAI_MODEL', 'gpt-4.1-mini'), 'messages': [
        {'role': 'system', 'content': 'Responda em português brasileiro, de forma prática e breve. Você é um assistente de ' + KIND + '. Use apenas os dados fornecidos. Não afirme ter realizado ações; você apenas aconselha. Para loja, não invente produtos, preços ou descontos. Contexto: ' + json.dumps(context, ensure_ascii=False)},
        {'role': 'user', 'content': message}], 'max_tokens': 650}
    request = urllib.request.Request('https://api.openai.com/v1/chat/completions', data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            result = json.load(response)
        return result['choices'][0]['message']['content'], 'openai'
    except (urllib.error.URLError, KeyError, ValueError, IndexError):
        raise ValidationError('Não foi possível consultar a IA. Verifique a chave, o modelo e a conexão.')

def get_state():
    with database() as db:
        if KIND == 'store':
            return {'products': [dict(r) for r in db.execute('SELECT * FROM products')]}
        if KIND == 'personal':
            return {'tasks': [dict(r) for r in db.execute('SELECT * FROM tasks ORDER BY rowid DESC')], 'expenses': [dict(r) for r in db.execute('SELECT * FROM expenses ORDER BY rowid DESC')]}
        return {}

def action(path, data):
    if path == '/api/chat':
        reply, mode = ai_reply(required_text(data, 'message'), get_state())
        return {'reply': reply, 'mode': mode}
    if KIND == 'personal':
        with database() as db:
            if path == '/api/tasks':
                title = required_text(data, 'title', 200)
                due = data.get('due', '')
                if not isinstance(due, str):
                    raise ValidationError('Data inválida.')
                if due:
                    from datetime import date
                    try:
                        date.fromisoformat(due)
                    except ValueError:
                        raise ValidationError('Data inválida.')
                db.execute('INSERT INTO tasks(id,title,due) VALUES(?,?,?)', (uuid4().hex, title, due))
            elif path == '/api/tasks/toggle':
                if db.execute('UPDATE tasks SET done=1-done WHERE id=?', (required_text(data, 'id'),)).rowcount != 1:
                    raise ValidationError('Tarefa não encontrada.')
            elif path == '/api/tasks/delete':
                db.execute('DELETE FROM tasks WHERE id=?', (required_text(data, 'id'),))
            elif path == '/api/expenses':
                cents = data.get('cents')
                if type(cents) is not int or not 0 < cents <= 100000000:
                    raise ValidationError('Valor deve ser positivo, em centavos.')
                db.execute('INSERT INTO expenses(id,title,cents) VALUES(?,?,?)', (uuid4().hex, required_text(data, 'title', 200), cents))
            elif path == '/api/expenses/delete':
                db.execute('DELETE FROM expenses WHERE id=?', (required_text(data, 'id'),))
            else:
                raise ValidationError('Ação desconhecida.')
        return get_state()
    if KIND == 'store' and path == '/api/orders':
        items = data.get('items')
        if not isinstance(items, list) or not 1 <= len(items) <= 30:
            raise ValidationError('Carrinho inválido.')
        with database() as db:
            db.execute('BEGIN IMMEDIATE')
            total, receipt, seen = 0, [], set()
            for item in items:
                if not isinstance(item, dict):
                    raise ValidationError('Item inválido.')
                product_id, quantity = item.get('id'), item.get('quantity')
                if not isinstance(product_id, str) or product_id in seen or type(quantity) is not int or not 1 <= quantity <= 99:
                    raise ValidationError('Produto ou quantidade inválida.')
                seen.add(product_id)
                row = db.execute('SELECT * FROM products WHERE id=?', (product_id,)).fetchone()
                if not row or row['stock'] < quantity:
                    raise ValidationError('Produto sem estoque suficiente.')
                total += row['price'] * quantity
                receipt.append({'id': product_id, 'name': row['name'], 'quantity': quantity, 'unit_price': row['price']})
                db.execute('UPDATE products SET stock=stock-? WHERE id=?', (quantity, product_id))
            order_id = uuid4().hex
            db.execute('INSERT INTO orders(id,total,items) VALUES(?,?,?)', (order_id, total, json.dumps(receipt)))
        return {'id': order_id, 'total': total, 'items': receipt, 'status': 'demonstrativo — sem cobrança'}
    raise ValidationError('Ação desconhecida.')

class Handler(BaseHTTPRequestHandler):
    def respond(self, status, data, content_type='application/json; charset=utf-8'):
        payload = json.dumps(data, ensure_ascii=False).encode() if isinstance(data, dict) else data
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/state':
            self.respond(200, get_state())
        elif path == '/api/health':
            self.respond(200, {'ok': True, 'kind': KIND, 'mode': 'openai' if os.environ.get('OPENAI_API_KEY') else 'demo'})
        elif path in ('/', '/app.js', '/style.css'):
            name = 'index.html' if path == '/' else path[1:]
            mime = {'index.html': 'text/html', 'app.js': 'text/javascript', 'style.css': 'text/css'}[name]
            self.respond(200, (ROOT / 'static' / name).read_bytes(), mime + '; charset=utf-8')
        else:
            self.respond(404, {'error': 'Não encontrado.'})

    def do_POST(self):
        # Local apps accept mutations only from the same origin (also blocks form CSRF).
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.respond(403, {'error': 'Origem não permitida.'})
        try:
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.respond(415, {'error': 'Envie JSON.'})
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16384:
                return self.respond(413, {'error': 'Corpo inválido ou muito grande.'})
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValidationError('Envie um objeto JSON.')
            self.respond(200, action(self.path, data))
        except (ValidationError, ValueError) as exc:
            self.respond(400, {'error': str(exc)})
        except Exception:
            self.respond(500, {'error': 'Erro interno. Tente novamente.'})

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', '8000'))
    print(f'Abra http://localhost:{port} — modo local', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
