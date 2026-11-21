// Exercise exported model and draft interfaces without inspecting source text.
import * as t from '../src/client/model.ts';
import { buildEntry, draftFromRow, emptyDraft, validateDraft } from '../src/client/draft.ts';
import { configuredRow } from './helpers/fixtures.mjs';

function editEntry(entry) {
  return draftFromRow(configuredRow({ name: 'demo', entry }));
}
const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail: detail === undefined ? '' : JSON.stringify(detail) });
}

// 1. Claude-style mcpServers
const claude = t.parseImport(JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 'x' } } } }));
check('claude: one entry', claude.entries.length === 1 && claude.skipped.length === 0, claude);
check('claude: stdio shape', claude.entries[0].name === 'github' && claude.entries[0].entry.transport === 'stdio' && claude.entries[0].entry.command === 'npx' && claude.entries[0].entry.args.length === 2 && claude.entries[0].entry.env.TOKEN === 'x', claude.entries[0]);

// 2. snake_case with http type
const snake = t.parseImport(JSON.stringify({ mcp_servers: { web: { type: 'http', url: 'https://x/mcp', headers: { A: 'b' } } } }));
check('snake: http entry', snake.entries.length === 1 && snake.entries[0].entry.transport === 'streamable-http' && snake.entries[0].entry.url === 'https://x/mcp' && snake.entries[0].entry.headers.A === 'b', snake.entries[0]);

// 3. DSH servers shape
const dsh = t.parseImport(JSON.stringify({ servers: { chart: { transport: 'stdio', command: 'npx', args: ['-y', 'm'] } } }));
check('servers: dsh entry', dsh.entries.length === 1 && dsh.entries[0].entry.transport === 'stdio', dsh.entries[0]);

// 4. SSE mapping + warning
const sse = t.parseImport(JSON.stringify({ mcpServers: { s: { type: 'sse', url: 'https://e' } } }));
check('sse: mapped with warning', sse.entries[0].entry.transport === 'streamable-http' && sse.entries[0].warning === 'sse', sse.entries[0]);

// 5. bare url implies http
const bare = t.parseImport(JSON.stringify({ mcpServers: { b: { url: 'https://b' } } }));
check('bare url: http', bare.entries[0].entry.transport === 'streamable-http', bare.entries[0]);

// 6. array form
const arr = t.parseImport(JSON.stringify([{ name: 'a', command: 'node' }]));
check('array form', arr.entries.length === 1 && arr.entries[0].name === 'a', arr.entries[0]);

// 7. name normalization
const messy = t.parseImport(JSON.stringify({ mcpServers: { 'my server!': { command: 'x' } } }));
check('name sanitized', messy.entries[0].name === 'my-server' && messy.entries[0].changed === true, messy.entries[0]);

// 8. invalid JSON
check('invalid json', t.parseImport('{nope').error === 'json', t.parseImport('{nope').message);

// 9. unusable entry skipped
const skipped = t.parseImport(JSON.stringify({ mcpServers: { bad: { note: 'nothing' } } }));
check('unusable skipped', skipped.entries.length === 0 && skipped.skipped.length === 1 && skipped.skipped[0].reason === 'entry', skipped);

// 10. the four portable conventions
const original = {
  chart: { transport: 'stdio', command: 'npx', args: ['-y', 'm'], enabled: false, startupTimeoutMs: 5000 },
  web: { transport: 'streamable-http', url: 'https://w', headers: { Z: '1' } },
};
const entries = Object.keys(original).map((name) => ({ name, entry: original[name] }));

const camel = JSON.parse(t.buildExport(entries, 'mcp_servers_camel'));
check('camel top key', Object.keys(camel).join(',') === 'mcpServers', Object.keys(camel));
check('camel local has no type', camel.mcpServers.chart.type === undefined, camel.mcpServers.chart);
check('camel local command and args', camel.mcpServers.chart.command === 'npx' && camel.mcpServers.chart.args.join(',') === '-y,m', camel.mcpServers.chart);
check('camel local omits empty env', camel.mcpServers.chart.env === undefined, camel.mcpServers.chart);
check('camel remote is typed http', camel.mcpServers.web.type === 'http' && camel.mcpServers.web.url === 'https://w' && camel.mcpServers.web.headers.Z === '1', camel.mcpServers.web);
check('camel drops tuning and enabled', camel.mcpServers.chart.startupTimeoutMs === undefined && camel.mcpServers.chart.enabled === undefined, camel.mcpServers.chart);

const typed = JSON.parse(t.buildExport(entries, 'servers_typed'));
check('typed top key', Object.keys(typed).join(',') === 'servers', Object.keys(typed));
check('typed local is stdio', typed.servers.chart.type === 'stdio' && typed.servers.chart.command === 'npx', typed.servers.chart);
check('typed remote is http', typed.servers.web.type === 'http' && typed.servers.web.url === 'https://w', typed.servers.web);

const snakeShape = JSON.parse(t.buildExport(entries, 'mcp_servers_snake'));
check('snake top key', Object.keys(snakeShape).join(',') === 'mcp_servers', Object.keys(snakeShape));
check('snake uses transport', snakeShape.mcp_servers.chart.transport === 'stdio' && snakeShape.mcp_servers.chart.type === undefined, snakeShape.mcp_servers.chart);
check('snake remote transport value', snakeShape.mcp_servers.web.transport === 'streamable_http', snakeShape.mcp_servers.web);

const compact = JSON.parse(t.buildExport(entries, 'mcp_compact'));
check('compact top key', Object.keys(compact).join(',') === 'mcp', Object.keys(compact));
check('compact local merges command', compact.mcp.chart.type === 'local' && compact.mcp.chart.command.join(',') === 'npx,-y,m', compact.mcp.chart);
check('compact remote type', compact.mcp.web.type === 'remote' && compact.mcp.web.url === 'https://w', compact.mcp.web);

// 11. every convention imports back losslessly for the fields it carries
for (const format of ['mcp_servers_camel', 'servers_typed', 'mcp_servers_snake', 'mcp_compact']) {
  const parsed = t.parseImport(t.buildExport(entries, format));
  check('round-trip names ' + format, parsed.entries.map((e) => e.name).sort().join(',') === 'chart,web', parsed.entries.map((e) => e.name));
  const c = parsed.entries.find((e) => e.name === 'chart');
  check('round-trip stdio ' + format, c && c.entry.transport === 'stdio' && c.entry.command === 'npx' && c.entry.args.join(',') === '-y,m', c && c.entry);
  const w = parsed.entries.find((e) => e.name === 'web');
  check('round-trip remote ' + format, w && w.entry.transport === 'streamable-http' && w.entry.url === 'https://w' && w.entry.headers.Z === '1', w && w.entry);
}

check('compact imports environment', (() => {
  const parsed = t.parseImport(JSON.stringify({ mcp: { one: { type: 'local', command: ['node', 'a.js'], environment: { A: '1' } } } }));
  return parsed.entries[0].entry.env.A === '1' && parsed.entries[0].entry.args.join(',') === 'a.js';
})(), null);
check('import keeps tuning in a native document', t.parseImport(JSON.stringify({ servers: { tuned: { transport: 'stdio', command: 'x', startupTimeoutMs: 5000 } } })).entries[0].entry.startupTimeoutMs === 5000, null);

// 12. pair parsing problems
const badEnv = t.parsePairs('TOKEN value', '=');
check('env format problem', badEnv.problem && badEnv.problem.kind === 'format' && badEnv.problem.line === 1, badEnv.problem);
const dup = t.parsePairs('A=1\nA=2', '=');
check('env duplicate problem', dup.problem && dup.problem.kind === 'duplicate' && dup.problem.key === 'A', dup.problem);
const good = t.parsePairs('A=1\nB=2', '=');
check('env good pairs', !good.problem && good.pairs.A === '1' && good.pairs.B === '2', good.pairs);

// Editor round trips preserve process data even when another field changes.
const literalEntry = {
  transport: 'stdio', command: 'node', args: ['', ' padded ', 'x\ny', ''],
  env: { TOKEN: ' secret ', EMPTY: '', PAD: '  ' }, cwd: 'D:/app', enabled: true,
};
const unchangedDraft = editEntry(literalEntry);
const unchanged = buildEntry(unchangedDraft);
check('editor preserves empty, padded and multiline args', JSON.stringify(unchanged.args) === JSON.stringify(literalEntry.args), unchanged.args);
check('editor preserves literal env values', JSON.stringify(unchanged.env) === JSON.stringify(literalEntry.env), unchanged.env);
const renamed = buildEntry({ ...unchangedDraft, name: 'renamed' });
check('unrelated edit preserves args and env', JSON.stringify([renamed.args, renamed.env]) === JSON.stringify([literalEntry.args, literalEntry.env]), renamed);
const changed = buildEntry({ ...unchangedDraft, args: '--new\nvalue', env: 'TOKEN= changed \nEMPTY=\nPAD=  ' });
check('edited args replace original args', JSON.stringify(changed.args) === JSON.stringify(['--new', 'value']), changed.args);
check('edited env preserves value whitespace and empty values', JSON.stringify(changed.env) === JSON.stringify({ TOKEN: ' changed ', EMPTY: '', PAD: '  ' }), changed.env);
const cleared = buildEntry({ ...unchangedDraft, args: '', env: '' });
check('clearing edited args and env removes values', cleared.args === undefined && cleared.env === undefined, cleared);
const crlfEnv = t.parsePairs('TOKEN= secret \r\nEMPTY=\r\nPAD=  \r\n', '=');
check('env CRLF separates lines without changing values', !crlfEnv.problem && JSON.stringify(crlfEnv.pairs) === JSON.stringify({ TOKEN: ' secret ', EMPTY: '', PAD: '  ' }), crlfEnv);
check('header optional whitespace still trimmed', t.parsePairs(' Authorization: Bearer token  ', ':').pairs.Authorization === 'Bearer token');
for (const format of ['mcp_servers_camel', 'servers_typed', 'mcp_servers_snake', 'mcp_compact']) {
  const roundTrip = t.parseImport(t.buildExport([{ name: 'demo', entry: literalEntry }], format)).entries[0].entry;
  check('cwd and process data round-trip ' + format, JSON.stringify([roundTrip.cwd, roundTrip.args, roundTrip.env]) === JSON.stringify([literalEntry.cwd, literalEntry.args, literalEntry.env]), roundTrip);
  const remoteExport = JSON.parse(t.buildExport([{ name: 'web', entry: { transport: 'streamable-http', url: 'https://w', cwd: 'D:/irrelevant' } }], format));
  check('HTTP export omits cwd ' + format, !Object.values(remoteExport)[0].web.cwd, remoteExport);
}

// 13. Draft validation and rename operations use the same public seam as the UI.
const translate = (key) => key;
check('new draft validation identifies required name', validateDraft(emptyDraft(), [], translate)?.field === 'name');
check('unchanged special process data remains valid', validateDraft(unchangedDraft, ['demo'], translate) === null);
check('rename collision is rejected', validateDraft({ ...unchangedDraft, name: 'taken' }, ['demo', 'taken'], translate)?.message === 'nameTaken');
check('inherited draft keeps its name fixed', draftFromRow(configuredRow({ inherited: true })).canRename === false);
const renameOps = t.saveOps({ ...unchangedDraft, name: 'renamed' }, literalEntry);
check('rename is one set and one unset', JSON.stringify(renameOps.map(op => [op.op, op.path])) === JSON.stringify([
  ['set', ['servers', 'renamed']], ['unset', ['servers', 'demo']],
]), renameOps);

let failures = 0;
for (const result of results) {
  if (!result.ok) failures += 1;
  console.log((result.ok ? 'PASS ' : 'FAIL ') + result.name + (result.ok ? '' : '  ' + result.detail));
}
console.log('---');
console.log(failures === 0 ? 'ALL PASS (' + results.length + ')' : failures + ' FAILURE(S) of ' + results.length);
process.exit(failures === 0 ? 0 : 1);
