import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../signal_engine/cgm_signal_engine.py');

const buildFallbackInsights = ({ data = [], metrics = {} }, errorMessage = '') => ({
    engine: 'cgm-signal-engine',
    generated: false,
    error: errorMessage || null,
    summary: {
        overallRisk: Number(metrics.cv) > 36 || Number(metrics.tar) > 25 ? 'high' : 'moderate',
        dominantPattern: 'Signal engine runtime unavailable',
        narrative: 'The app fell back to a lightweight snapshot. Start the backend with the signal engine runtime available to unlock richer signals.',
        coverageHours: data.length ? Math.round((data.length / 4) * 10) / 10 : 0,
        meanGlucose: metrics.mean || null,
        samples: data.length,
        estimatedDays: Math.max(1, Math.round(data.length / 96))
    },
    windowProfiles: [],
    mealSignals: [],
    dailyPatterns: [],
    anomalyCards: [
        {
            id: 'signal-engine-runtime',
            title: 'Signal engine is offline',
            severity: 'warning',
            evidence: errorMessage || 'Signal engine analysis did not run successfully.',
            nextStep: 'Set SIGNAL_ENGINE_BIN if needed and restart the backend.'
        }
    ],
    suggestedQuestions: [
        '这组数据最值得优先解释的风险是什么？',
        '如果把信号引擎链路打开，还能得到哪些结构化洞察？'
    ]
});

const runSignalEngine = (payload) => new Promise((resolve, reject) => {
    const child = spawn(config.signalEngine.bin, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        child.kill();
        reject(new Error(`Signal engine timed out after ${config.signalEngine.timeoutMs}ms`));
    }, config.signalEngine.timeoutMs);

    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
        clearTimeout(timeout);
        if (finished) return;
        finished = true;
        reject(error);
    });

    child.on('close', (code) => {
        clearTimeout(timeout);
        if (finished) return;
        finished = true;

        if (code !== 0) {
            reject(new Error(stderr.trim() || `Signal engine process exited with code ${code}`));
            return;
        }

        try {
            resolve(JSON.parse(stdout || '{}'));
        } catch (error) {
            reject(new Error(`Invalid signal engine JSON output: ${error.message}`));
        }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
});

export const generateSignalEngineInsights = async ({ data = [], metrics = {} }) => {
    if (!Array.isArray(data) || data.length === 0) {
        return buildFallbackInsights({ data, metrics }, 'No CGM data available for signal engine analysis.');
    }

    try {
        const insights = await runSignalEngine({ data, metrics });
        return {
            ...insights,
            generated: true
        };
    } catch (error) {
        return buildFallbackInsights({ data, metrics }, error.message);
    }
};
