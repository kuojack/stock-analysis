const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const externalScriptPattern = /<script\b[^>]*\bsrc=["']https?:\/\//i;
const inlineEventPattern = /\son[a-z]+\s*=/i;
const cspMetaPattern = /http-equiv=["']Content-Security-Policy["']/i;

assert(!externalScriptPattern.test(indexHtml), 'index.html must not load third-party scripts while API keys are handled client-side');
assert(!inlineEventPattern.test(indexHtml), 'index.html must not use inline event handlers under the local-only script CSP');
assert(cspMetaPattern.test(indexHtml), 'index.html must declare a Content-Security-Policy meta tag');
assert(indexHtml.includes("script-src 'self'"), 'CSP must restrict scripts to self');
assert(indexHtml.includes('https://api.finmindtrade.com'), 'CSP must explicitly allow FinMind API connections');
assert(indexHtml.includes('https://generativelanguage.googleapis.com'), 'CSP must explicitly allow Gemini API connections');

console.log('security validation passed');
