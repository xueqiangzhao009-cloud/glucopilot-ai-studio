import { config } from '../config.js';
import { buildFallbackAnalysis } from './fallbackAnalysis.js';

const buildPrompt = ({ metrics, recentData, locale, pythonInsights }) => {
    const language = locale.toLowerCase().startsWith('zh') ? 'Chinese' : 'English';
    return [
        'You are a clinical decision-support assistant for a diabetes CGM visualization demo.',
        'Return only a JSON object with these keys: risk_level, pathology_summary, video_generation_prompt, recommendations, clinical_focus, product_story.',
        `Use ${language}. Do not diagnose. Mention that findings should be reviewed with clinical context.`,
        `Metrics: ${JSON.stringify(metrics)}`,
        `Recent CGM data, mmol/L: ${JSON.stringify((recentData || []).slice(-96))}`,
        `Python signal summary: ${JSON.stringify({
            summary: pythonInsights?.summary,
            anomalyCards: pythonInsights?.anomalyCards,
            mealSignals: pythonInsights?.mealSignals
        })}`
    ].join('\n');
};

const buildCopilotContextMessage = ({ metrics, analysis, pythonInsights, locale }) => {
    const language = locale.toLowerCase().startsWith('zh') ? 'Chinese' : 'English';
    return [
        `Conversation language: ${language}.`,
        'You are a product-minded AI copilot for a CGM analytics demo.',
        'Only answer from the structured signals below.',
        `Metrics: ${JSON.stringify(metrics)}`,
        `Analysis: ${JSON.stringify(analysis)}`,
        `Python insights: ${JSON.stringify({
            summary: pythonInsights?.summary,
            anomalyCards: pythonInsights?.anomalyCards,
            mealSignals: pythonInsights?.mealSignals,
            suggestedQuestions: pythonInsights?.suggestedQuestions
        })}`
    ].join('\n');
};

const buildCopilotReplyInstruction = (question, locale) => {
    const language = locale.toLowerCase().startsWith('zh') ? 'Chinese' : 'English';
    return [
        `User question: ${question}`,
        `Reply in ${language}.`,
        'Return only a JSON object containing: answer, follow_up, confidence, highlights.',
        'answer should be concise but specific.',
        'follow_up should suggest the next useful question.',
        'confidence must be one of: low, medium, high.',
        'highlights must be an array of 2-4 short bullets.'
    ].join('\n');
};

const extractJsonObject = (text) => {
    if (!text || typeof text !== 'string') return null;

    const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
};

const withTimeout = async (promiseFactory, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await promiseFactory(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
};

const getChatCompletionsUrl = () => {
    if (config.ai.chatCompletionsUrl) return config.ai.chatCompletionsUrl;
    return `${config.ai.baseUrl}/chat/completions`;
};

export const requestStructuredJsonCompletion = async ({ systemPrompt, messages = [], userPrompt }) => {
    const finalMessages = messages.length > 0
        ? messages
        : [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

    const responsePayload = await withTimeout(async (signal) => {
        const response = await fetch(getChatCompletionsUrl(), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.ai.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.ai.model,
                messages: finalMessages
            }),
            signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI request failed with ${response.status}: ${errorText.slice(0, 500)}`);
        }

        return response.json();
    }, config.ai.timeoutMs);

    const content = responsePayload.choices?.[0]?.message?.content || responsePayload.output_text || '';
    const parsed = extractJsonObject(content);

    if (!parsed) {
        throw new Error('AI response did not contain a JSON object');
    }

    return parsed;
};

export const analyzePathology = async ({ metrics, recentData = [], locale = 'en', requireAI = false, pythonInsights = null }) => {
    const fallback = buildFallbackAnalysis(metrics, locale, pythonInsights);

    if (!config.ai.apiKey) {
        if (requireAI) throw new Error('AI_API_KEY or OPENAI_API_KEY is required');
        return {
            ...fallback,
            source: 'rules',
            model: null
        };
    }

    try {
        const parsed = await requestStructuredJsonCompletion({
            systemPrompt: 'You produce concise clinical visualization support JSON for a diabetes CGM application.',
            userPrompt: buildPrompt({ metrics, recentData, locale, pythonInsights })
        });

        return {
            ...fallback,
            ...parsed,
            source: 'ai',
            provider: config.ai.provider,
            model: config.ai.model
        };
    } catch (error) {
        if (requireAI) throw error;
        return {
            ...fallback,
            source: 'rules',
            model: null,
            ai_error: error.message
        };
    }
};

const buildFallbackCopilotAnswer = ({ metrics, analysis, pythonInsights, locale, history = [] }) => {
    const isChinese = locale.toLowerCase().startsWith('zh');
    const anomaly = pythonInsights?.anomalyCards?.[0];
    const dominantPattern = pythonInsights?.summary?.dominantPattern || analysis?.clinical_focus || (isChinese ? '当前数据模式' : 'current signal pattern');
    const answer = isChinese
        ? `我会优先把“${dominantPattern}”讲成这份作品的核心亮点。${anomaly ? `当前最值得展示的是“${anomaly.title}”，证据是：${anomaly.evidence}。` : `当前核心指标为 TIR ${metrics?.tir}%、TAR ${metrics?.tar}%、CV ${metrics?.cv}%。`} 如果从比赛表达看，更强的方式是把它包装成一个会主动发现异常、解释原因、并推动下一步动作的 AI Copilot。${history.length > 1 ? '你现在已经进入多轮对话场景，这本身就是一个很好的演示点。' : ''}`
        : `I would frame "${dominantPattern}" as the main strength of the project. ${anomaly ? `The best signal to demo is "${anomaly.title}" because ${anomaly.evidence}.` : `The core metrics are TIR ${metrics?.tir}%, TAR ${metrics?.tar}%, and CV ${metrics?.cv}%.`} For a competition demo, the stronger framing is an AI copilot that detects anomalies, explains causes, and drives the next action.${history.length > 1 ? ' The multi-turn flow itself is also a useful demo point.' : ''}`;

    return {
        answer,
        follow_up: isChinese ? '你可以继续追问某个异常卡片、某个时段，或者让系统把它翻译成飞书里的工作流动作。' : 'You can next ask about an anomaly card, a time window, or how this should map into a workflow.',
        confidence: anomaly ? 'high' : 'medium',
        highlights: isChinese
            ? ['多轮对话上下文已接入', '可基于 Python 信号做追问', '适合演示主动式 Copilot']
            : ['Multi-turn context is active', 'Signals can ground follow-up answers', 'Good fit for proactive copilot demos'],
        source: 'rules'
    };
};

export const answerCopilotQuestion = async ({
    question,
    metrics,
    analysis,
    pythonInsights,
    locale = 'en',
    requireAI = false,
    history = []
}) => {
    if (!question || !String(question).trim()) {
        throw new Error('A copilot question is required');
    }

    if (!config.ai.apiKey) {
        if (requireAI) throw new Error('AI_API_KEY or OPENAI_API_KEY is required');
        return buildFallbackCopilotAnswer({ question, metrics, analysis, pythonInsights, locale, history });
    }

    try {
        const historyMessages = Array.isArray(history)
            ? history
                .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && item.content)
                .slice(-8)
                .map((item) => ({
                    role: item.role,
                    content: String(item.content)
                }))
            : [];

        const parsed = await requestStructuredJsonCompletion({
            systemPrompt: 'You are a grounded AI analytics copilot. Answer only from the supplied structured signals.',
            messages: [
                {
                    role: 'system',
                    content: 'You are a grounded AI analytics copilot. Return only valid JSON and stay tied to the supplied signals.'
                },
                {
                    role: 'user',
                    content: buildCopilotContextMessage({ metrics, analysis, pythonInsights, locale })
                },
                ...historyMessages,
                {
                    role: 'user',
                    content: buildCopilotReplyInstruction(question, locale)
                }
            ]
        });

        return {
            ...parsed,
            source: 'ai',
            model: config.ai.model
        };
    } catch (error) {
        if (requireAI) throw error;
        return {
            ...buildFallbackCopilotAnswer({ question, metrics, analysis, pythonInsights, locale, history }),
            ai_error: error.message
        };
    }
};
