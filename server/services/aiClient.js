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
            mealSignals: pythonInsights?.mealSignals,
            riskScores: pythonInsights?.riskScores,
            forecast: pythonInsights?.forecast,
            actionPlan: pythonInsights?.actionPlan
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
            riskScores: pythonInsights?.riskScores,
            forecast: pythonInsights?.forecast,
            actionPlan: pythonInsights?.actionPlan,
            suggestedQuestions: pythonInsights?.suggestedQuestions
        })}`
    ].join('\n');
};

const buildCopilotModeInstruction = (mode = 'general', locale = 'en') => {
    const isChinese = locale.toLowerCase().startsWith('zh');
    const presets = {
        general: isChinese ? '用平衡的产品化口径回答。' : 'Answer with a balanced product-minded tone.',
        clinical: isChinese ? '优先做临床解释，聚焦风险、证据和观察建议。' : 'Prioritize clinical explanation, focusing on risk, evidence, and observation advice.',
        product: isChinese ? '优先做产品表达，说明 AI 能力、交互价值和可演示亮点。' : 'Prioritize product framing, highlighting AI capability, UX value, and demo moments.',
        workflow: isChinese ? '优先转成执行方案，说明如何映射到协作流程、任务和自动化。' : 'Prioritize execution planning, mapping insights into workflow, tasks, and automation.'
    };
    return presets[mode] || presets.general;
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

const buildBriefPrompt = ({ metrics, analysis, pythonInsights, locale }) => {
    const language = locale.toLowerCase().startsWith('zh') ? 'Chinese' : 'English';
    return [
        'Return only a JSON object with keys: title, summary, talking_points, risk_callouts, suggested_demo_flow, next_actions.',
        `Use ${language}.`,
        'talking_points, risk_callouts, suggested_demo_flow, next_actions must each be arrays of 3 concise strings.',
        `Metrics: ${JSON.stringify(metrics)}`,
        `Analysis: ${JSON.stringify(analysis)}`,
        `Python insights: ${JSON.stringify({
            summary: pythonInsights?.summary,
            anomalyCards: pythonInsights?.anomalyCards,
            riskScores: pythonInsights?.riskScores,
            forecast: pythonInsights?.forecast,
            actionPlan: pythonInsights?.actionPlan
        })}`
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

const buildFallbackCopilotAnswer = ({ metrics, analysis, pythonInsights, locale, history = [], mode = 'general' }) => {
    const isChinese = locale.toLowerCase().startsWith('zh');
    const anomaly = pythonInsights?.anomalyCards?.[0];
    const dominantPattern = pythonInsights?.summary?.dominantPattern || analysis?.clinical_focus || (isChinese ? '当前数据模式' : 'current signal pattern');
    const variants = {
        clinical: isChinese
            ? `从临床解释看，当前主模式是“${dominantPattern}”。${anomaly ? `最需要优先说明的是“${anomaly.title}”，证据为：${anomaly.evidence}。` : `当前关键指标为 TIR ${metrics?.tir}%、TAR ${metrics?.tar}%、CV ${metrics?.cv}%。`} 建议把风险、证据和观察动作说清楚。`
            : `Clinically, the leading pattern is "${dominantPattern}". ${anomaly ? `The top issue to explain is "${anomaly.title}" because ${anomaly.evidence}.` : `Key metrics are TIR ${metrics?.tir}%, TAR ${metrics?.tar}%, and CV ${metrics?.cv}%.`} Keep the explanation grounded in risk, evidence, and next observation steps.`,
        product: isChinese
            ? `从产品表达看，“${dominantPattern}”最适合做成可演示亮点。${anomaly ? `“${anomaly.title}”可以作为首页重点卡片。` : ''} 更强的讲法是让 AI 不只给结论，还能生成评分、预测和行动建议。`
            : `From a product angle, "${dominantPattern}" is the strongest demo story. ${anomaly ? `"${anomaly.title}" can anchor the hero card.` : ''} A stronger framing is AI that goes beyond summaries into scoring, forecasting, and next-action guidance.`,
        workflow: isChinese
            ? `从工作流落地看，“${dominantPattern}”适合直接转成自动化动作。${anomaly ? `可以围绕“${anomaly.title}”生成提醒与复盘任务。` : ''} 建议把异常卡片、趋势预测和行动建议一起推给协作入口。`
            : `For workflow execution, "${dominantPattern}" maps well into automation. ${anomaly ? `Use "${anomaly.title}" to trigger alerts and review tasks.` : ''} Bundle anomaly cards, forecast, and action plan into the collaboration entry point.`,
        general: isChinese
            ? `我会优先把“${dominantPattern}”讲成这份作品的核心亮点。${anomaly ? `当前最值得展示的是“${anomaly.title}”，证据是：${anomaly.evidence}。` : `当前核心指标为 TIR ${metrics?.tir}%、TAR ${metrics?.tar}%、CV ${metrics?.cv}%。`} 更强的表达方式，是把它包装成一个会主动发现异常、解释原因、并推动下一步动作的 AI Copilot。${history.length > 1 ? '你现在已经进入多轮对话场景，这本身就是一个很好的演示点。' : ''}`
            : `I would frame "${dominantPattern}" as the main strength of the project. ${anomaly ? `The best signal to demo is "${anomaly.title}" because ${anomaly.evidence}.` : `The core metrics are TIR ${metrics?.tir}%, TAR ${metrics?.tar}%, and CV ${metrics?.cv}%.`} A stronger framing is an AI copilot that detects anomalies, explains causes, and drives the next action.${history.length > 1 ? ' The multi-turn flow itself is also a useful demo point.' : ''}`
    };
    const answer = variants[mode] || variants.general;

    return {
        answer,
        follow_up: isChinese ? '你可以继续追问某个异常卡片、某个时段，或者让系统把它翻译成协作平台里的工作流动作。' : 'You can next ask about an anomaly card, a time window, or how this should map into a workflow.',
        confidence: anomaly ? 'high' : 'medium',
        highlights: isChinese
            ? ['多轮对话上下文已接入', '可基于 Python 信号做追问', mode === 'workflow' ? '可直接转成工作流动作' : '适合演示主动式 Copilot']
            : ['Multi-turn context is active', 'Signals can ground follow-up answers', mode === 'workflow' ? 'Maps well to workflow actions' : 'Good fit for proactive copilot demos'],
        source: 'rules'
    };
};

const buildFallbackBrief = ({ metrics, analysis, pythonInsights, locale = 'en' }) => {
    const isChinese = locale.toLowerCase().startsWith('zh');
    const dominantPattern = pythonInsights?.summary?.dominantPattern || analysis?.clinical_focus || (isChinese ? '关键波动模式' : 'key signal pattern');
    const anomaly = pythonInsights?.anomalyCards?.[0];
    const forecast = pythonInsights?.forecast?.summary;
    return {
        title: isChinese ? 'AI Briefing Snapshot' : 'AI Briefing Snapshot',
        summary: isChinese
            ? `围绕“${dominantPattern}”组织一套适合演示的 AI 讲解结构。`
            : `Build a demo-ready AI narrative around "${dominantPattern}".`,
        talking_points: isChinese
            ? [
                `核心指标为 TIR ${metrics?.tir}%、TAR ${metrics?.tar}%、CV ${metrics?.cv}%。`,
                `Python 信号引擎已经识别出“${dominantPattern}”。`,
                'Copilot 可以继续把结果转成追问、解释和执行动作。'
            ]
            : [
                `Core metrics are TIR ${metrics?.tir}%, TAR ${metrics?.tar}%, and CV ${metrics?.cv}%.`,
                `The Python signal engine identified "${dominantPattern}".`,
                'The copilot can extend this into follow-up answers and workflow actions.'
            ],
        risk_callouts: isChinese
            ? [
                anomaly ? anomaly.title : '当前没有单一异常卡片',
                forecast || '可继续结合趋势预测做前瞻性提醒。',
                analysis?.pathology_summary || '可继续补充病理风险解释。'
            ]
            : [
                anomaly?.title || 'No single anomaly card stands out yet.',
                forecast || 'A short-term forecast can support proactive alerts.',
                analysis?.pathology_summary || 'Pathology framing can be expanded further.'
            ],
        suggested_demo_flow: isChinese
            ? ['先展示指标和异常卡片。', '再切到 Copilot 展示多轮问答。', '最后用 Workflow 页面承接执行动作。']
            : ['Start with metrics and anomaly cards.', 'Switch to the copilot for multi-turn Q&A.', 'Finish on the workflow page to show execution.'],
        next_actions: isChinese
            ? ['补充真实模型 key 后可直接演示真 AI。', '继续追问某个异常卡片。', '把 briefing 导出成答辩讲稿或产品说明。']
            : ['Add a real model key for live AI demos.', 'Drill into one anomaly card.', 'Export the briefing into a product or demo script.'],
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
    history = [],
    mode = 'general'
}) => {
    if (!question || !String(question).trim()) {
        throw new Error('A copilot question is required');
    }

    if (!config.ai.apiKey) {
        if (requireAI) throw new Error('AI_API_KEY or OPENAI_API_KEY is required');
        return buildFallbackCopilotAnswer({ question, metrics, analysis, pythonInsights, locale, history, mode });
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
                    content: `${buildCopilotContextMessage({ metrics, analysis, pythonInsights, locale })}\n${buildCopilotModeInstruction(mode, locale)}`
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
            ...buildFallbackCopilotAnswer({ question, metrics, analysis, pythonInsights, locale, history, mode }),
            ai_error: error.message
        };
    }
};

export const generateAIBriefing = async ({ metrics, analysis, pythonInsights, locale = 'en', requireAI = false }) => {
    const fallback = buildFallbackBrief({ metrics, analysis, pythonInsights, locale });

    if (!config.ai.apiKey) {
        if (requireAI) throw new Error('AI_API_KEY or OPENAI_API_KEY is required');
        return fallback;
    }

    try {
        const parsed = await requestStructuredJsonCompletion({
            systemPrompt: 'You create concise AI demo briefing cards. Return only JSON.',
            userPrompt: buildBriefPrompt({ metrics, analysis, pythonInsights, locale })
        });

        return {
            ...fallback,
            ...parsed,
            source: 'ai',
            model: config.ai.model
        };
    } catch (error) {
        if (requireAI) throw error;
        return {
            ...fallback,
            ai_error: error.message
        };
    }
};
