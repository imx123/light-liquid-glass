// 演示服务器：只读白名单文件，只监听本机，无需 npm install。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  md: 'text/plain; charset=utf-8', png: 'image/png' };
const names = ['index.html', 'glass.css', 'glass.js', 'demo.css', 'demo.js', 'checks.js', 'lifecycle-checks.js', 'parameters-checks.js', 'quality-checks.js', 'integration-checks.js', 'background.png', 'README.md', 'README.zh-CN.md', 'VALIDATION.md'];
const files = new Map(names.map(name => ['/' + name, name])); files.set('/', 'index.html');
files.set('/glass.js', '../glass.js');
files.set('/glass.css', '../glass.css');
const port = Number(process.env.PORT || 4178);
createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const name = files.get(req.url);
  if (!name) { res.writeHead(404); res.end('Not Found'); return; }
  try {
    const content = await readFile(new URL(name, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[name.split('.').pop()], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(500); res.end('Cannot read demo file'); }
}).listen(port, '127.0.0.1', () => console.log('Liquid Glass v2: http://localhost:' + port));
