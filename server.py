import http.server
import json
import os
import mimetypes

TOKEN_FILE = '/home/ubuntu/inkify/token.json'
STATIC_DIR = '/home/ubuntu/inkify'

class InkifyHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/token':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                with open(TOKEN_FILE, 'w') as f:
                    json.dump(data, f)
                self.write_json({'ok': True})
            except Exception as e:
                self.write_json({'ok': False, 'error': str(e)}, 400)
        elif self.path == '/api/token/clear':
            if os.path.exists(TOKEN_FILE):
                os.remove(TOKEN_FILE)
            self.write_json({'ok': True})
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == '/api/token':
            if os.path.exists(TOKEN_FILE):
                with open(TOKEN_FILE) as f:
                    data = json.load(f)
                self.write_json(data)
            else:
                self.write_json({'token': None})
            return

        # Serve static files
        filepath = self.get_filepath()
        if filepath and os.path.isfile(filepath):
            self.send_response(200)
            mime, _ = mimetypes.guess_type(filepath)
            self.send_header('Content-Type', mime or 'application/octet-stream')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            with open(filepath, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404)

    def get_filepath(self):
        path = self.path.split('?')[0]  # strip query params
        if path == '/':
            path = '/index.html'
        # security: prevent directory traversal
        full = os.path.normpath(os.path.join(STATIC_DIR, path.lstrip('/')))
        if not full.startswith(STATIC_DIR):
            return None
        return full

    def write_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8766))
    server = http.server.HTTPServer(('0.0.0.0', port), InkifyHandler)
    print(f'Inkify server running on port {port}')
    server.serve_forever()
