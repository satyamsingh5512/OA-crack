import YAML from 'yaml';
import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getRepository } from '../db/index.js';

function packageRoot(): string {
  // src/routes/ and dist/routes/ are both two levels below the backend package root,
  // so ../../ from this file already lands on the package root.
  return path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
}

let openapiCache: Record<string, unknown> | null = null;

async function loadOpenApi(): Promise<Record<string, unknown>> {
  if (openapiCache) return openapiCache;
  const raw = await readFile(path.join(packageRoot(), 'openapi.yml'), 'utf8');
  openapiCache = YAML.parse(raw) as Record<string, unknown>;
  return openapiCache;
}

export async function registerMetaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const db = await getRepository();
    return {
      ok: true,
      version: config.version,
      time: new Date().toISOString(),
      database: { driver: db.driver, healthy: await db.ping().catch(() => false) },
    };
  });

  app.get('/openapi.json', async (_req, reply) => {
    try {
      const doc = await loadOpenApi();
      return reply.code(200).send(doc);
    } catch {
      return reply.code(500).send({ error: 'OpenAPI document unavailable' });
    }
  });

  /** Dependency-free HTML doc page: fetch /openapi.json and render a readable reference. */
  app.get('/docs', async (_req, reply) => {
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AI Interview Assistant API</title><style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:0 auto;padding:24px;line-height:1.5}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #e2e8f0;padding:8px;text-align:left}details{margin:8px 0}
.get{color:#15803d}.post{color:#b45309}.delete{color:#b91c1c}.patch{color:#6d28d9}
</style></head><body>
<h1>AI Interview Assistant API</h1>
<p>Typed contract: <a href="/openapi.json">/openapi.json</a>. Authenticate with <code>Authorization: Bearer &lt;accessToken&gt;</code> on every protected route.</p>
<div id="routes" role="status">Loading…</div>
<script>
(function(){
  function el(tag, text){ var e=document.createElement(tag); if(text!=null)e.textContent=text; return e; }
  fetch('/openapi.json').then(function(r){return r.json();}).then(function(doc){
    var root=document.getElementById('routes'); root.textContent='';
    var t=el('table'); var head=el('tr'); head.appendChild(el('th','Method')); head.appendChild(el('th','Path')); head.appendChild(el('th','Description')); t.appendChild(head);
    Object.keys(doc.paths||{}).sort().forEach(function(p){
      Object.keys(doc.paths[p]).forEach(function(m){
        var tr=el('tr');
        var mcell=el('td',m.toUpperCase()); mcell.className=m.toLowerCase(); tr.appendChild(mcell);
        var pcell=el('td'); pcell.appendChild(el('code',p)); tr.appendChild(pcell);
        var d=doc.paths[p][m]||{}; tr.appendChild(el('td',d.description||(d.summary||'')));
        t.appendChild(tr);
      });
    });
    root.appendChild(t);
  }).catch(function(){ document.getElementById('routes').textContent='Could not load the API contract.'; });
})();
</script></body></html>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });
}