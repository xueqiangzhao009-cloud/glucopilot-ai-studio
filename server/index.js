import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { calculateMetrics, normalizeCGMData, parseCSV } from './services/cgmMetrics.js';
import { analyzePathology, answerCopilotQuestion } from './services/aiClient.js';
import { generateVideo } from './services/videoService.js';
import { generatePythonInsights } from './services/pythonInsights.js';
import { generateAgentWorkflow } from './services/workflowService.js';
import { HttpError, getErrorPayload, parseRequestUrl, readJsonBody, readRequestBody, sendJson, setCorsHeaders } from './utils/http.js';

const getPayloadData = (body) => body.data || body.cgmData || body.points || [];

const buildMetricsResponse = (data, unit) => {
    const normalizedData = normalizeCGMData(data, unit);
    const metrics = calculateMetrics(normalizedData);
    if (!metrics) throw new HttpError(422, 'No valid CGM values found');

    return {
        unit: 'mmol/L',
        sourceUnit: normalizedData[0]?.sourceUnit || 'mmol/L',
        data: normalizedData,
        metrics
    };
};

const handleHealth = () => ({
    ok: true,
    service: 'diabetes-evolution-api',
    ai: {
        provider: config.ai.provider,
        model: config.ai.model,
        configured: Boolean(config.ai.apiKey)
    },
    video: {
        configured: Boolean(config.video.apiUrl)
    }
});

export const handleRequest = async (req, res) => {
    setCorsHeaders(res, config.corsOrigin);

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    const url = parseRequestUrl(req);

    try {
        if (req.method === 'GET' && url.pathname === '/api/health') {
            sendJson(res, 200, handleHealth());
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/cgm/metrics') {
            const body = await readJsonBody(req, config.bodyLimitBytes);
            sendJson(res, 200, buildMetricsResponse(getPayloadData(body), body.unit || 'auto'));
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/cgm/parse-csv') {
            const contentType = req.headers['content-type'] || '';
            const body = contentType.includes('application/json')
                ? await readJsonBody(req, config.bodyLimitBytes)
                : { csvText: await readRequestBody(req, config.bodyLimitBytes) };
            const normalizedData = parseCSV(body.csvText || body.csv || '', body.unit || 'auto');
            const metrics = calculateMetrics(normalizedData);

            sendJson(res, 200, {
                unit: 'mmol/L',
                sourceUnit: normalizedData[0]?.sourceUnit || 'mmol/L',
                data: normalizedData,
                metrics
            });
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/ai/analyze') {
            const body = await readJsonBody(req, config.bodyLimitBytes);
            let metrics = body.metrics;
            let recentData = body.recentData || [];
            let pythonInsights = body.pythonInsights || null;

            if (!metrics && Array.isArray(getPayloadData(body)) && getPayloadData(body).length > 0) {
                const metricsResponse = buildMetricsResponse(getPayloadData(body), body.unit || 'auto');
                metrics = metricsResponse.metrics;
                recentData = metricsResponse.data.slice(-96);
                pythonInsights = await generatePythonInsights({
                    data: metricsResponse.data,
                    metrics
                });
            }

            if (!metrics) throw new HttpError(400, 'metrics or CGM data is required');

            const analysis = await analyzePathology({
                metrics,
                recentData,
                locale: body.locale || 'en',
                requireAI: Boolean(body.requireAI),
                pythonInsights
            });

            sendJson(res, 200, { analysis, pythonInsights });
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/ai/copilot') {
            const body = await readJsonBody(req, config.bodyLimitBytes);
            let metrics = body.metrics;
            let analysis = body.analysis || null;
            let pythonInsights = body.pythonInsights || null;

            if (!metrics && Array.isArray(getPayloadData(body)) && getPayloadData(body).length > 0) {
                const metricsResponse = buildMetricsResponse(getPayloadData(body), body.unit || 'auto');
                metrics = metricsResponse.metrics;
                pythonInsights = await generatePythonInsights({
                    data: metricsResponse.data,
                    metrics
                });
            }

            if (!metrics) throw new HttpError(400, 'metrics or CGM data is required');

            const answer = await answerCopilotQuestion({
                question: body.question,
                metrics,
                analysis,
                pythonInsights,
                locale: body.locale || 'en',
                requireAI: Boolean(body.requireAI),
                history: Array.isArray(body.history) ? body.history : []
            });

            sendJson(res, 200, { answer, pythonInsights });
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/agent/workflow') {
            const body = await readJsonBody(req, config.bodyLimitBytes);
            let metrics = body.metrics;
            let analysis = body.analysis || null;
            let pythonInsights = body.pythonInsights || null;

            if (!metrics && Array.isArray(getPayloadData(body)) && getPayloadData(body).length > 0) {
                const metricsResponse = buildMetricsResponse(getPayloadData(body), body.unit || 'auto');
                metrics = metricsResponse.metrics;
                pythonInsights = await generatePythonInsights({
                    data: metricsResponse.data,
                    metrics
                });
                analysis = await analyzePathology({
                    metrics,
                    recentData: metricsResponse.data.slice(-96),
                    locale: body.locale || 'en',
                    requireAI: Boolean(body.requireAI),
                    pythonInsights
                });
            }

            if (!metrics) throw new HttpError(400, 'metrics or CGM data is required');

            const workflow = await generateAgentWorkflow({
                metrics,
                analysis,
                pythonInsights,
                locale: body.locale || 'en',
                requireAI: Boolean(body.requireAI)
            });

            sendJson(res, 200, { workflow, pythonInsights, analysis });
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/video/generate') {
            const body = await readJsonBody(req, config.bodyLimitBytes);
            const video = await generateVideo({
                prompt: body.prompt,
                requireVideo: Boolean(body.requireVideo)
            });
            sendJson(res, 200, { video });
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/pipeline/analyze') {
            const body = await readJsonBody(req, config.bodyLimitBytes);
            const metricsResponse = buildMetricsResponse(getPayloadData(body), body.unit || 'auto');
            const pythonInsights = await generatePythonInsights({
                data: metricsResponse.data,
                metrics: metricsResponse.metrics
            });
            const analysis = await analyzePathology({
                metrics: metricsResponse.metrics,
                recentData: metricsResponse.data.slice(-96),
                locale: body.locale || 'en',
                requireAI: Boolean(body.requireAI),
                pythonInsights
            });
            const video = await generateVideo({
                prompt: analysis.video_generation_prompt,
                requireVideo: Boolean(body.requireVideo)
            });

            sendJson(res, 200, {
                ...metricsResponse,
                pythonInsights,
                analysis,
                video
            });
            return;
        }

        throw new HttpError(404, `Route not found: ${req.method} ${url.pathname}`);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode >= 500) {
            console.error(error);
        }
        sendJson(res, statusCode, getErrorPayload(error));
    }
};

export const createApiServer = () => createServer(handleRequest);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const server = createApiServer();
    server.listen(config.port, config.host, () => {
        console.log(`Diabetes Evolution API listening on http://${config.host}:${config.port}`);
    });
}
