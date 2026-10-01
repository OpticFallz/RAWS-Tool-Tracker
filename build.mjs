// Build script for RAWS Tools Tracker.
//
// Bundles src/app.jsx (React + Firebase compat SDKs + QR lib) with esbuild and
// inlines everything into a single self-contained HTML file.
//
// Outputs:
//   index.html                              — live build (Dusty's SHOP_CONFIG), served by GitHub Pages
//   dist/raws-tools-tracker-v<VERSION>.html — pristine build (template config, wizard enabled), for Releases
//
// The distributed files make ZERO network requests except to the shop's own
// Firebase project. There are no CDN scripts, no external APIs.
//
// Usage: npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const VERSION = '2.0.0';

const result = await build({
  entryPoints: ['src/app.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  jsx: 'transform',
  write: false,
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const bundleJs = result.outputFiles[0].text;
console.log('bundle bytes:', bundleJs.length);

const designSystem = readFileSync('src/design-system.css', 'utf8');
// The pristine template config is also injected (as TEMPLATE_CONFIG) so the
// setup wizard can detect "still template values" in any build.
const templateAsGlobal = readFileSync('src/config.template.js', 'utf8')
  .replace('const SHOP_CONFIG =', 'const TEMPLATE_CONFIG =');
const appMeta = `const APP_VERSION = '${VERSION}';\n${templateAsGlobal}`;

function assemble(configPath, outPath) {
  let shell = readFileSync('src/shell.html', 'utf8');
  shell = shell.replace('/*__DESIGN_SYSTEM__*/', () => designSystem);
  shell = shell.replace('/*__SHOP_CONFIG__*/', () => readFileSync(configPath, 'utf8'));
  shell = shell.replace('/*__APP_META__*/', () => appMeta);
  shell = shell.replace('/*__APP_BUNDLE__*/', () => bundleJs);
  // Generated-file banner so nobody edits the artifact by hand
  shell = shell.replace(
    '<!DOCTYPE html>',
    `<!DOCTYPE html>\n<!-- GENERATED FILE — do not edit by hand. Edit src/ and run: npm run build -->`
  );
  writeFileSync(outPath, shell);
  console.log('wrote', outPath, `(${(shell.length / 1024).toFixed(0)} KB)`);
}

mkdirSync('dist', { recursive: true });
assemble('src/config.live.js', 'index.html');
assemble('src/config.template.js', `dist/raws-tools-tracker-v${VERSION}.html`);
console.log('build complete — version', VERSION);
