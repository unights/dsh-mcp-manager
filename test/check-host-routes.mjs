// Host-half smoke test: imports index.js, captures the route it registers, checks
// the WebRoute contract, resolves the request path the page uses, and drives the
// handler with a fake request/response.
import { pathToFileURL, fileURLToPath } from 'node:url';

const moduleUrl = pathToFileURL(fileURLToPath(new URL('../dist/host.js', import.meta.url))).href;
const mod = await import(moduleUrl);

const failures = [];
const routes = [];
const tools = {
  definitions: () => [
    { name: 'mcp__github__search', description: 'Search things' },
    { name: 'mcp__github__fetch', description: 'Fetch one thing' },
    { name: 'mcp__other__x', description: 'Not ours' },
    { name: 'plain_tool', description: 'Unrelated' },
  ],
};

let serverNames = ['github', 'other'];
const serviceRegistry = new Map();

function makeCtx(rejection) {
  return {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        routes.push(route);
        return () => {};
      },
    },
    connection: { requestRejection: () => rejection },
    mcpManager: { list: () => serverNames.map(name => ({ name })) },
    tools,
    provide: (name, value) => {
      serviceRegistry.set(name, value);
    },
  };
}

/** The documented dispatch: 'exact' matches the pathname verbatim. */
function resolve(requestUrl) {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  return routes.find((route) => route.kind === 'exact' && pathname === route.path);
}

function call(route, url, method) {
  return new Promise((settle) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      settle(res);
    };
    const req = { method: method || 'GET', url, headers: {} };
    const res = {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      end(body) {
        if (body !== undefined) this.body = String(body);
        finish();
      },
    };
    const maybe = route.handler(req, res);
    if (maybe && typeof maybe.then === 'function') maybe.then(finish, finish);
    else finish();
  });
}

function check(label, condition, detail) {
  if (!condition) failures.push(label + (detail === undefined ? '' : ' → ' + JSON.stringify(detail)));
}

// ── the published service ───────────────────────────────────────────────
{
  serviceRegistry.clear();
  mod.apply(makeCtx(undefined));
  const catalog = serviceRegistry.get('mcpCatalog');
  check('publishes mcpCatalog', Boolean(catalog), [...serviceRegistry.keys()]);
  if (catalog) {
    check('servers() lists every server with tools', JSON.stringify(catalog.servers()) === JSON.stringify(['github', 'other']), catalog.servers());
    const github = catalog.tools('github');
    check('tools() strips the prefix and sorts', github.length === 2 && github[0].name === 'fetch' && github[1].name === 'search', github);
    check('tools() ignores unknown servers', catalog.tools('nope').length === 0);
    check('tools() ignores an empty name', catalog.tools('').length === 0);
    check('service reads the live runtime', catalog.servers().length === 2);

    const before = catalog.servers().length;
    const previous = tools.definitions;
    serverNames = ['late'];
    tools.definitions = () => [{ name: 'mcp__late__x', description: '' }];
    check('service is not cached', catalog.servers().length === 1, catalog.servers());
    tools.definitions = previous;
    serverNames = ['github', 'other'];
    check('service follows the runtime back', catalog.servers().length === before);
  }
}

// ── ownership cannot be inferred from an overlapping public namespace ──────
{
  const previous = tools.definitions;
  const previousNames = serverNames;
  try {
    serverNames = ['alpha', 'alpha__beta', 'independent__server'];
    tools.definitions = () => [
      { name: 'mcp__alpha__one', description: 'Unambiguous tool' },
      { name: 'mcp__alpha__beta__two', description: 'Ambiguous owner' },
      { name: 'mcp__independent__server__raw__name', description: 'Raw separators' },
      { name: 'mcp__unmanaged__tool', description: 'Outside manager inventory' },
    ];
    routes.length = 0;
    serviceRegistry.clear();
    mod.apply(makeCtx(undefined));
    const catalog = serviceRegistry.get('mcpCatalog');
    check('server list uses unique known owners only',
      JSON.stringify(catalog.servers()) === JSON.stringify(['alpha', 'independent__server']), catalog.servers());
    for (const name of ['alpha', 'alpha__beta']) {
      let problem;
      try { catalog.tools(name); } catch (error) { problem = error; }
      check('ambiguous catalogue refuses all results for ' + name,
        problem instanceof Error && problem.message.includes('namespace ambiguity'), problem?.message);
      const response = await call(routes[0], '/mcp-servers/tools?name=' + encodeURIComponent(name));
      const payload = JSON.parse(response.body);
      check('HTTP reports ambiguous ownership for ' + name,
        payload.tools.length === 0 && payload.error.includes('namespace ambiguity'), payload);
    }
    const raw = catalog.tools('independent__server');
    check('legal server and raw tool separators are preserved',
      raw.length === 1 && raw[0].name === 'raw__name', raw);
    check('unknown manager names are not inferred from tool strings', catalog.tools('unmanaged').length === 0);
    // A raw name containing separators is unambiguous once the longer server
    // is no longer in the live inventory. Do not cache a stale ownership guess.
    serverNames = ['alpha'];
    check('live inventory preserves a raw tool name containing double underscores',
      JSON.stringify(catalog.tools('alpha').map(tool => tool.name)) === JSON.stringify(['beta__two', 'one']));
  } finally {
    tools.definitions = previous;
    serverNames = previousNames;
  }
}

// ── registration and the WebRoute contract ──────────────────────────────
if (typeof mod.apply !== 'function') throw new Error('index.js exports no apply');
check('inject declares the services it uses', Array.isArray(mod.inject) && mod.inject.includes('webServer'), mod.inject);

routes.length = 0;
mod.apply(makeCtx(undefined));
check('catalogue and draft probe routes registered', routes.length === 2, routes.length);
check('draft probe route dispatches', resolve('/mcp-servers/probe')?.kind === 'exact');

const toolsRoute = routes[0];
check('tools route path', toolsRoute.path === '/mcp-servers/tools', toolsRoute.path);
check('tools route kind', toolsRoute.kind === 'exact', toolsRoute.kind);

for (const route of routes) {
  check('route path has no trailing slash: ' + route.path, !route.path.endsWith('/'), route.path);
  check('route path is absolute: ' + route.path, route.path.startsWith('/'), route.path);
}

check('GET /mcp-servers/tools?name=github dispatches to the route', resolve('/mcp-servers/tools?name=github') === toolsRoute);
check('a similar path is not swallowed', resolve('/mcp-servers/toolset') === undefined);
check('a nested path is not swallowed', resolve('/mcp-servers/tools/extra') === undefined);

// ── handler ─────────────────────────────────────────────────────────────
{
  const response = await call(toolsRoute, '/mcp-servers/tools?name=github');
  const payload = JSON.parse(response.body);
  check('tools 200', response.statusCode === 200, response.statusCode);
  check('tools content-type', String(response.headers['content-type']).includes('application/json'), response.headers['content-type']);
  check(
    'tools filtered, prefixed and sorted',
    payload.tools.length === 2 &&
      payload.tools[0].name === 'fetch' &&
      payload.tools[1].name === 'search' &&
      payload.tools[0].description === 'Fetch one thing',
    payload.tools,
  );
  const unknown = JSON.parse((await call(toolsRoute, '/mcp-servers/tools?name=nope')).body);
  check('unknown server yields no tools', Array.isArray(unknown.tools) && unknown.tools.length === 0, unknown);
  const missing = await call(toolsRoute, '/mcp-servers/tools');
  check('missing name is not an error', missing.statusCode === 200, missing.statusCode);
  const post = await call(toolsRoute, '/mcp-servers/tools', 'POST');
  check('rejects other methods', post.statusCode === 405 && post.headers.allow === 'GET', post.statusCode);
}

// ── trust fence ────────────────────────────────────────────────────────
{
  routes.length = 0;
  mod.apply(makeCtx(401));
  const blocked = await call(routes[0], '/mcp-servers/tools?name=github');
  check('refuses an untrusted request', blocked.statusCode === 401 && blocked.body === '', blocked.statusCode);
}

// ── a service that throws must not break the response ──────────────────
{
  routes.length = 0;
  const broken = makeCtx(undefined);
  broken.tools = {
    definitions: () => {
      throw new Error('tool runtime unavailable');
    },
  };
  mod.apply(broken);
  const response = await call(routes[0], '/mcp-servers/tools?name=github');
  check('tool runtime failure degrades to an empty list', response.statusCode === 200 && JSON.parse(response.body).tools.length === 0, response.body);
}

if (failures.length > 0) {
  console.error('FAIL (' + String(failures.length) + ')');
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}
console.log('OK: route registered, dispatched and answering');
