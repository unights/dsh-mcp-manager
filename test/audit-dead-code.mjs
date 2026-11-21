// Ask TypeScript about unused private declarations/imports instead of parsing generated JS.
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = ts.readConfigFile(fileURLToPath(new URL('../tsconfig.json', import.meta.url)), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { noUnusedLocals: true, noUnusedParameters: true });
const program = ts.createProgram(parsed.fileNames, parsed.options);
const unused = ts.getPreEmitDiagnostics(program).filter(item => [6133, 6192, 6196].includes(item.code));
for (const item of unused) {
  const position = item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : 0;
  console.log(`${item.file?.fileName ?? 'config'}:${position}: ${ts.flattenDiagnosticMessageText(item.messageText, ' ')}`);
}
console.log(`Unused private declarations/imports: ${unused.length}; public exports are checked by their consumers and tests.`);
