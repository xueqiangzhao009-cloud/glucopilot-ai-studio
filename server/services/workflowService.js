import { config } from '../config.js';
import { requestStructuredJsonCompletion } from './aiClient.js';

const buildFallbackWorkflow = ({ metrics, analysis, pythonInsights, locale = 'zh-CN' }) => {
    const isChinese = locale.toLowerCase().startsWith('zh');
    const dominantPattern = pythonInsights?.summary?.dominantPattern || analysis?.clinical_focus || (isChinese ? '关键时段优化' : 'targeted optimization');
    const highRisk = Number(metrics?.cv) > 36 || Number(metrics?.tar) > 25;

    return {
        title: isChinese ? 'GlucoPilot Agent Workflow' : 'GlucoPilot Agent Workflow',
        summary: isChinese
            ? `围绕“${dominantPattern}”构建一条从数据洞察到协作平台执行的 Agent 闭环。`
            : `Build an end-to-end agent loop around "${dominantPattern}".`,
        positioning: isChinese
            ? '把健康数据分析从一次性报告升级成可持续协作的办公场景智能体。'
            : 'Turn one-off analytics into a collaborative workflow agent.',
        workflow_steps: [
            {
                id: 'ingest',
                title: isChinese ? '接收 CGM 数据' : 'Ingest CGM Data',
                owner: isChinese ? '数据入口 Agent' : 'Ingestion Agent',
                goal: isChinese ? '解析 CSV / 截图并标准化指标' : 'Parse CSV / screenshot and normalize metrics',
                automation: isChinese ? '自动解析并写入结构化上下文' : 'Auto-parse and persist structured context'
            },
            {
                id: 'signals',
                title: isChinese ? 'Python 信号挖掘' : 'Python Signal Mining',
                owner: 'CGM Signal Engine',
                goal: isChinese ? '生成时段画像、餐后峰值和异常卡片' : 'Generate window profiles, meal peaks, and anomaly cards',
                automation: isChinese ? '作为下游 AI 的结构化 grounding' : 'Ground downstream AI with structured signals'
            },
            {
                id: 'copilot',
                title: isChinese ? '多轮 Copilot 解释' : 'Multi-turn Copilot',
                owner: isChinese ? '分析 Copilot' : 'Analytics Copilot',
                goal: isChinese ? '支持用户追问、连续追问与方案解释' : 'Support user follow-ups and plan explanations',
                automation: isChinese ? '保留对话历史，持续生成下一步建议' : 'Retain chat history and keep generating next actions'
            },
            {
                id: 'lark',
                title: isChinese ? '协作平台执行动作' : 'Collaboration Workflow',
                owner: isChinese ? 'Workflow Agent' : 'Workflow Agent',
                goal: isChinese ? '把风险信号推送到消息 / 表格 / 待办 / 文档' : 'Push signals into chat, tables, todo, and docs',
                automation: isChinese ? '形成提醒、记录、复盘和协作闭环' : 'Create an alert, logging, review, and collaboration loop'
            }
        ],
        feishu_surfaces: [
            {
                surface: isChinese ? '消息入口' : 'Chat',
                fit: isChinese ? '适合主动提醒和多轮问答入口' : 'Great for proactive nudges and chat entry',
                action: isChinese ? '推送“异常波段摘要 + 继续追问按钮”' : 'Send anomaly summary with follow-up actions'
            },
            {
                surface: '多维表格',
                fit: isChinese ? '适合沉淀每日曲线、风险评分和复盘记录' : 'Great for daily logs and risk scoring',
                action: isChinese ? '写入日维度信号和风险标签' : 'Write daily signals and risk labels'
            },
            {
                surface: isChinese ? '文档空间' : 'Docs',
                fit: isChinese ? '适合生成病例摘要、答辩材料和周报' : 'Great for reports and demo narratives',
                action: isChinese ? '生成结构化分析文档和答辩摘要' : 'Generate structured reports and demo notes'
            },
            {
                surface: '待办 / 日历',
                fit: isChinese ? '适合把风险转成下一步行动' : 'Good for converting risk into action',
                action: isChinese ? '自动生成复查、追踪和提醒任务' : 'Create follow-up tracking tasks'
            }
        ],
        demo_script: isChinese
            ? [
                '先上传一段 CGM 数据，让系统在 10 秒内跑完指标、Python 信号和 AI 分析。',
                '切到 Copilot 面板，连续追问两到三轮，展示真实多轮对话能力。',
                '切到 Agent Workflow 页面，说明这些结果如何映射到消息、表格和文档系统。',
                highRisk ? '重点强调系统如何把高风险信号转成主动提醒与复盘任务。' : '重点强调系统如何把长期稳定跟踪做成可持续的工作流。'
            ]
            : [
                'Upload a CGM dataset and run metrics, Python signals, and AI analysis.',
                'Switch to the copilot and demo a few follow-up turns.',
                'Switch to the workflow page and map results to IM, Bitable, and Docs.',
                highRisk ? 'Emphasize proactive alerts and reviews for high-risk signals.' : 'Emphasize longitudinal monitoring as an ongoing workflow.'
            ],
        source: 'rules',
        model: null
    };
};

export const generateAgentWorkflow = async ({
    metrics,
    analysis,
    pythonInsights,
    locale = 'zh-CN',
    requireAI = false
}) => {
    const fallback = buildFallbackWorkflow({ metrics, analysis, pythonInsights, locale });

    if (!config.ai.apiKey) {
        if (requireAI) throw new Error('AI_API_KEY or OPENAI_API_KEY is required');
        return fallback;
    }

    try {
        const language = locale.toLowerCase().startsWith('zh') ? 'Chinese' : 'English';
        const parsed = await requestStructuredJsonCompletion({
            systemPrompt: 'You design grounded AI agent workflows for product demos. Return only JSON.',
            userPrompt: [
                'Return only a JSON object with keys: title, summary, positioning, workflow_steps, feishu_surfaces, demo_script.',
                `Use ${language}.`,
                'workflow_steps must be an array of 4-6 objects with: id, title, owner, goal, automation.',
                'feishu_surfaces must be an array of 3-5 objects with: surface, fit, action.',
                'demo_script must be an array of concise steps.',
                `Metrics: ${JSON.stringify(metrics)}`,
                `Analysis: ${JSON.stringify(analysis)}`,
                `Python insights: ${JSON.stringify({
                    summary: pythonInsights?.summary,
                    anomalyCards: pythonInsights?.anomalyCards,
                    mealSignals: pythonInsights?.mealSignals
                })}`,
                'Focus on how this project should map into collaboration software scenarios.'
            ].join('\n')
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
            source: 'rules',
            model: null,
            ai_error: error.message
        };
    }
};
