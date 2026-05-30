const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const dataSource = fs.readFileSync(path.join(root, 'data.js'), 'utf8');

const sandbox = {
  console,
  window: {
    updateFinmindStatus: () => {}
  }
};
vm.createContext(sandbox);
vm.runInContext(dataSource, sandbox);

const DataEngine = sandbox.window.DataEngine;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeHistory({ start = 100, drift = 0, amplitude = 2, days = 60 } = {}) {
  const rows = [];
  let price = start;
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    price = price + drift + Math.sin(i / 3) * amplitude * 0.12;
    const open = price - 0.4;
    const close = price;
    rows.push({
      date,
      open,
      high: price + amplitude * 0.35,
      low: price - amplitude * 0.35,
      close,
      volume: 1000 + i * 5
    });
  }
  return DataEngine.computeIndicators(rows);
}

function makeChips({ buyDays = 12, total = 1200, estimated = false } = {}) {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const net = i < buyDays ? Math.round(total / buyDays) : -10;
    rows.push({
      date: new Date(Date.UTC(2026, 1, 1 + i)).toISOString().slice(0, 10),
      foreign: net,
      trust: 0,
      dealer: 0,
      total: net,
      estimated
    });
  }
  return rows;
}

function testEstimatedChipsCannotTriggerAccumulation() {
  const history = makeHistory({ start: 100, drift: -0.03, amplitude: 1.5 });
  const chips = makeChips({ buyDays: 16, total: 2000, estimated: true });
  const result = DataEngine.detectAccumulation(history, chips);
  assert(result.status === 'none', `estimated chips should not trigger accumulation, got ${result.status}`);
  assert(result.score <= 44, `estimated chips score should be capped, got ${result.score}`);
}

function testHighRangePositionBlocksAccumulation() {
  const history = makeHistory({ start: 100, drift: 0.8, amplitude: 2.0 });
  const chips = makeChips({ buyDays: 18, total: 4000, estimated: false });
  const result = DataEngine.detectAccumulation(history, chips);
  assert(result.rangePosition > 45, `fixture should be high in range, got ${result.rangePosition}`);
  assert(result.status !== 'high', `high range position should not be high accumulation, got ${result.status}`);
}

function testPatternDetailHasNoHardcodedNeckline() {
  const history = makeHistory({ start: 100, drift: 0.2, amplitude: 3.0 });
  const result = DataEngine.detectPatterns(history);
  assert(!String(result.wDetail).includes('2110'), `pattern detail should not contain hardcoded neckline: ${result.wDetail}`);
}

function testEtfAdvisoryIsClearlyEstimated() {
  const details = DataEngine.getETFDetails('0050', 100);
  const advisory = String(details.advisory);
  assert(details.estimated === true, 'ETF premium/discount details must be marked estimated');
  assert(String(details.source).includes('本地估算'), `ETF source must disclose local estimate, got ${details.source}`);
  assert(advisory.includes('非官方即時 NAV'), `ETF advisory must disclose non-official NAV, got ${advisory}`);
  assert(!/極佳|安全邊際|無須擔心|非常合理/.test(advisory), `ETF advisory is too strong: ${advisory}`);
}

testEstimatedChipsCannotTriggerAccumulation();
testHighRangePositionBlocksAccumulation();
testPatternDetailHasNoHardcodedNeckline();
testEtfAdvisoryIsClearlyEstimated();

console.log('logic validation passed');
