// 演示服务器：只读白名单文件，默认监听本机；可用 HOST 指定局域网地址。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  md: 'text/plain; charset=utf-8', png: 'image/png' };
const names = ['index.html', 'glass.css', 'glass.js', 'demo.css', 'demo.js', 'checks.js', 'lifecycle-checks.js', 'parameters-checks.js', 'quality-checks.js', 'integration-checks.js', 'lens-checks.js', 'performance-checks.js', 'background-checks.js', 'background.png', 'README.md', 'README.zh-CN.md', 'VALIDATION.md'];
const files = new Map(names.map(name => ['/' + name, name])); files.set('/', 'index.html');
files.set('/glass.js', '../glass.js');
files.set('/glass.css', '../glass.css');
files.set('/README.md', '../README.md');
files.set('/README.zh-CN.md', '../README.zh-CN.md');
files.set('/demo/VALIDATION.md', 'VALIDATION.md');
files.set('/demo/preview.png', 'preview.png');
const port = Number(process.env.PORT || 4178);
const host = process.env.HOST || '127.0.0.1';
createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const name = files.get(req.url.split('?')[0]);
  if (!name) { res.writeHead(404); res.end('Not Found'); return; }
  try {
    const content = await readFile(new URL(name, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[name.split('.').pop()], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(500); res.end('Cannot read demo file'); }
}).listen(port, host, () => console.log('Liquid Glass v2: http://' + host + ':' + port));
