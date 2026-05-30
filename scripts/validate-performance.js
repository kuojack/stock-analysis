const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const chartJs = fs.readFileSync(path.join(root, 'chart.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(!/<script\b[^>]*\bsrc=["']https?:\/\//i.test(indexHtml), 'third-party scripts can block startup and are not allowed');
assert(chartJs.includes('requestAnimationFrame'), 'chart rendering should be batched with requestAnimationFrame');
assert(chartJs.includes('requestRender()'), 'chart should expose requestRender for throttled redraws');

const genericCardBlock = stylesCss.match(/\.card\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert(!/backdrop-filter\s*:/.test(genericCardBlock), 'generic cards should not use backdrop-filter because many blurred cards can lag');
assert(/--bg-card:\s*#[0-9a-fA-F]{6}/.test(stylesCss), 'card background should be an opaque color for cheaper compositing');

console.log('performance validation passed');
