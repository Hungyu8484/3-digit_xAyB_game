#!/usr/bin/env node

// Simple Node.js experiment runner for the septagon physics project
// - Runs linear vs septagon prompts against an LLM (optional)
// - Measures latency and correctness
// - Supports a dry-run mode to synthesize plausible data without an API key

const fs = require('fs');
const path = require('path');

// -----------------------------
// Configurable settings
// -----------------------------
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Problems definition: id, topic, statement, expected, tolerance, units
const problems = [
  {
    id: 'mechanics_a',
    topic: 'Classical Mechanics',
    statement:
      'A 2 kg object is pulled with a horizontal force of 10 N on a frictionless surface. Calculate its acceleration.',
    expectedValue: 5.0, // m/s^2
    toleranceRatio: 0.05, // 5%
    units: 'm/s^2',
    septagonNodes: [
      'mass m = 2 kg',
      'horizontal force F = 10 N',
      'frictionless surface',
      'target: acceleration a',
    ],
  },
  {
    id: 'em_bfield',
    topic: 'Electromagnetism',
    statement:
      'A long straight wire carries a current of 3 A. What is the magnetic field strength at a distance of 5 cm from the wire in vacuum?',
    expectedValue: 1.2e-5, // Tesla
    toleranceRatio: 0.1, // 10%
    units: 'T',
    septagonNodes: [
      'current I = 3 A',
      'distance r = 0.05 m',
      'constant mu0 = 4π × 10^-7 H/m',
      'target: magnetic field B',
    ],
  },
  {
    id: 'thermo_work',
    topic: 'Thermodynamics',
    statement:
      'In a closed system, 1 mol ideal gas undergoes isothermal expansion at T = 300 K from V1 = 2 L to V2 = 4 L. Compute the work done by the gas.',
    expectedValue: 1728.5, // Joules (approx)
    toleranceRatio: 0.05, // 5%
    units: 'J',
    septagonNodes: [
      'amount n = 1 mol',
      'temperature T = 300 K',
      'initial volume V1 = 2 L',
      'final volume V2 = 4 L',
      'process: isothermal',
      'target: work W',
    ],
  },
];

// -----------------------------
// Prompt templates
// -----------------------------
function buildLinearPrompt(problem) {
  return (
    'You are given a physics problem. Solve it with step-by-step reasoning and provide the final numeric answer with units.\n' +
    `Problem: ${problem.statement}\n` +
    'Output format: first show key formulas and steps, then a single final line starting with "Final Answer:" followed by the numeric value and units.'
  );
}

function buildSeptagonPrompt(problem) {
  const nodes = problem.septagonNodes.map(n => `- ${n}`).join('\n');
  return (
    'You are given the following non-linear septagon diagram nodes that encode the problem context. Use the relationships between nodes to reason and solve. Provide the final numeric answer with units.\n' +
    'Nodes:\n' +
    `${nodes}\n` +
    'Output format: first map nodes to formulas, then show reasoning steps, then a single final line starting with "Final Answer:" followed by the numeric value and units.'
  );
}

// -----------------------------
// Evaluation helpers
// -----------------------------
function extractFinalNumeric(answerText) {
  // Find the line that starts with "Final Answer:" and extract the first number
  if (!answerText) return null;
  const lines = String(answerText).split(/\r?\n/);
  const finalLine = lines.find(l => /^\s*Final Answer\s*:/i.test(l));
  const target = finalLine || answerText;
  const match = String(target).replace(/,/g, '').match(/(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function isWithinTolerance(actual, expected, toleranceRatio) {
  if (actual == null) return false;
  const allowed = Math.abs(expected) * toleranceRatio;
  return Math.abs(actual - expected) <= allowed;
}

// -----------------------------
// LLM call (optional)
// -----------------------------
async function callOpenAIChat(model, prompt) {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a careful physics tutor. Show reasoning succinctly and then provide a single final numeric answer with units.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

// -----------------------------
// Dry-run synthesis
// -----------------------------
function synthesizeTrial(problemId, representation) {
  // Means derived from the report table; add small noise
  const means = {
    mechanics_a: { linear: { t: 21.3, err: 0.28 }, septagon: { t: 18.0, err: 0.22 } },
    em_bfield: { linear: { t: 25.5, err: 0.31 }, septagon: { t: 21.7, err: 0.25 } },
    thermo_work: { linear: { t: 23.4, err: 0.29 }, septagon: { t: 19.6, err: 0.23 } },
  };
  const m = means[problemId]?.[representation] || { t: 22.0, err: 0.3 };
  const timeSec = Math.max(5, m.t + randn() * 1.2); // add noise
  const isError = Math.random() < m.err;
  return { timeSec: round(timeSec, 2), correct: !isError };
}

function randn() {
  // Box-Muller
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function round(x, digits) {
  const p = Math.pow(10, digits);
  return Math.round(x * p) / p;
}

// -----------------------------
// Experiment loop
// -----------------------------
async function runTrials({ representation, trials, dryRun, model }) {
  const rows = [];
  for (const problem of problems) {
    for (let i = 0; i < trials; i++) {
      const id = `${problem.id}`;
      const prompt = representation === 'linear' ? buildLinearPrompt(problem) : buildSeptagonPrompt(problem);
      let start = Date.now();
      let answerText = '';
      let latencySec = 0;
      let numeric = null;
      let correct = false;

      if (dryRun) {
        const synth = synthesizeTrial(problem.id, representation);
        latencySec = synth.timeSec;
        correct = synth.correct;
        answerText = correct
          ? `...\nFinal Answer: ${problem.expectedValue} ${problem.units}`
          : `...\nFinal Answer: ${round(problem.expectedValue * 1.25, 3)} ${problem.units}`;
        numeric = extractFinalNumeric(answerText);
      } else {
        try {
          answerText = await callOpenAIChat(model, prompt);
        } catch (e) {
          answerText = String(e.message || e);
        }
        latencySec = (Date.now() - start) / 1000;
        numeric = extractFinalNumeric(answerText);
        correct = isWithinTolerance(numeric, problem.expectedValue, problem.toleranceRatio);
      }

      rows.push({
        timestamp: new Date().toISOString(),
        problem_id: id,
        topic: problem.topic,
        representation,
        trial_index: i + 1,
        latency_sec: round(latencySec, 2),
        numeric_answer: numeric,
        expected_value: problem.expectedValue,
        units: problem.units,
        correct,
      });
    }
  }
  return rows;
}

function aggregate(rows) {
  const key = r => `${r.problem_id}__${r.representation}`;
  const groups = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const aggregates = [];
  for (const [k, arr] of groups.entries()) {
    const [problem_id, representation] = k.split('__');
    const latency = arr.map(x => x.latency_sec);
    const meanLatency = round(latency.reduce((a, b) => a + b, 0) / latency.length, 2);
    const errRate = round(1 - arr.filter(x => x.correct).length / arr.length, 3);
    const topic = arr[0]?.topic || '';
    aggregates.push({ problem_id, topic, representation, trials: arr.length, mean_latency_sec: meanLatency, error_rate: errRate });
  }
  return aggregates;
}

function toCSV(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    const line = headers.map(h => String(r[h] ?? '').replace(/,/g, '')).join(',');
    lines.push(line);
  }
  return lines.join('\n');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  // CLI args
  const args = process.argv.slice(2);
  const modeBoth = args.includes('--both');
  const modeLinear = args.includes('--linear');
  const modeSeptagon = args.includes('--septagon');
  const dryRun = args.includes('--dry-run');
  const trialsArg = args.find(a => a.startsWith('--trials='));
  const trials = trialsArg ? parseInt(trialsArg.split('=')[1], 10) : 10;
  const modelArg = args.find(a => a.startsWith('--model='));
  const model = modelArg ? modelArg.split('=')[1] : DEFAULT_MODEL;

  const chosen = [];
  if (modeBoth || (!modeLinear && !modeSeptagon)) {
    chosen.push('linear', 'septagon');
  } else {
    if (modeLinear) chosen.push('linear');
    if (modeSeptagon) chosen.push('septagon');
  }

  const allRows = [];
  for (const rep of chosen) {
    const rows = await runTrials({ representation: rep, trials, dryRun, model });
    allRows.push(...rows);
  }

  // Output
  const outDir = path.join(process.cwd(), 'results');
  ensureDir(outDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.join(outDir, `results_${stamp}.csv`);
  const aggPath = path.join(outDir, `summary_${stamp}.json`);
  fs.writeFileSync(csvPath, toCSV(allRows));
  fs.writeFileSync(aggPath, JSON.stringify({ model, dryRun, trials, aggregates: aggregate(allRows) }, null, 2));

  console.log(`Saved trial-level CSV: ${csvPath}`);
  console.log(`Saved summary JSON:   ${aggPath}`);
}

if (require.main === module) {
  // Node 18+ has global fetch; if missing, advise user
  if (typeof fetch === 'undefined') {
    global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  }
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}


