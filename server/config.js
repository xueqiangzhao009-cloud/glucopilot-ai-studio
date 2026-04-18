import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loadEnvFile = (filePath = resolve(process.cwd(), '.env')) => {
    if (!existsSync(filePath)) return;

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, '');

        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
};

loadEnvFile();

const numberFromEnv = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

export const config = {
    host: process.env.API_HOST || '0.0.0.0',
    port: numberFromEnv(process.env.API_PORT || process.env.PORT, 8787),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    bodyLimitBytes: numberFromEnv(process.env.API_BODY_LIMIT_BYTES, 2 * 1024 * 1024),
    ai: {
        provider: process.env.AI_PROVIDER || 'openai-compatible',
        baseUrl: trimTrailingSlash(process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
        chatCompletionsUrl: process.env.AI_CHAT_COMPLETIONS_URL || '',
        apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
        model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4-mini',
        timeoutMs: numberFromEnv(process.env.AI_TIMEOUT_MS, 30000)
    },
    video: {
        apiUrl: process.env.VIDEO_API_URL || '',
        apiKey: process.env.VIDEO_API_KEY || '',
        timeoutMs: numberFromEnv(process.env.VIDEO_TIMEOUT_MS, 45000)
    },
    python: {
        bin: process.env.PYTHON_BIN || 'python',
        timeoutMs: numberFromEnv(process.env.PYTHON_TIMEOUT_MS, 15000)
    }
};
