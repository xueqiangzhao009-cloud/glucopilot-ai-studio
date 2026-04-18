import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Bot,
    Brain,
    CalendarRange,
    CheckCircle2,
    ChevronRight,
    Eye,
    FileText,
    FlaskConical,
    HeartPulse,
    Image as ImageIcon,
    Loader2,
    MessageSquare,
    Play,
    RefreshCw,
    Sparkles,
    Upload,
    Wand2,
    Zap
} from 'lucide-react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

const TARGET_RANGE = { min: 3.9, max: 10.0 };
const HYPO_LEVEL_1 = 3.9;
const HYPO_LEVEL_2 = 3.0;
const HYPER_LEVEL_1 = 10.0;
const HYPER_LEVEL_2 = 13.9;

const CHART_COLORS = {
    primary: '#0f766e',
    secondary: '#0ea5e9',
    danger: '#ef4444',
    warning: '#f59e0b',
    success: '#10b981'
};

const statusStyles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    positive: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    neutral: 'border-slate-200 bg-slate-50 text-slate-800'
};

const formatDisplayTime = (date) => `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const generateCGMData = () => {
    const days = 14;
    const pointsPerDay = 24 * 4;
    const totalPoints = days * pointsPerDay;
    const data = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);

    let currentGlucose = 6.2;

    for (let index = 0; index < totalPoints; index += 1) {
        const time = new Date(now.getTime() - (totalPoints - 1 - index) * 15 * 60 * 1000);
        const hour = time.getHours();
        const weekdayFactor = time.getDay() === 0 || time.getDay() === 6 ? 0.2 : 0;

        let trend = 0;
        if (hour >= 6 && hour < 9) trend += 0.6;
        if (hour >= 12 && hour < 14) trend += 0.9;
        if (hour >= 18 && hour < 21) trend += 0.8;
        if (hour >= 0 && hour < 4) trend -= 0.15;
        if (hour >= 4 && hour < 6) trend += 0.25;

        const mealSpike = [8, 13, 19].includes(hour) ? Math.random() * 0.8 : 0;
        const exerciseDip = hour >= 21 && hour <= 22 ? -(Math.random() * 0.5) : 0;
        const noise = (Math.random() - 0.5) * 0.65;

        currentGlucose += trend * 0.28 + mealSpike + exerciseDip + weekdayFactor + noise;
        currentGlucose = Math.min(18.5, Math.max(2.8, currentGlucose));

        data.push({
            timestamp: time.toISOString(),
            displayTime: formatDisplayTime(time),
            glucose: Number(currentGlucose.toFixed(1))
        });
    }

    return data;
};

const calculateMetrics = (data) => {
    if (!data?.length) return null;

    const values = data.map((item) => item.glucose);
    const total = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / total;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / total;
    const sd = Math.sqrt(variance);
    const cv = mean > 0 ? (sd / mean) * 100 : 0;
    const veryLow = values.filter((value) => value < HYPO_LEVEL_2).length;
    const low = values.filter((value) => value >= HYPO_LEVEL_2 && value < HYPO_LEVEL_1).length;
    const inRange = values.filter((value) => value >= TARGET_RANGE.min && value <= TARGET_RANGE.max).length;
    const high = values.filter((value) => value > HYPER_LEVEL_1 && value <= HYPER_LEVEL_2).length;
    const veryHigh = values.filter((value) => value > HYPER_LEVEL_2).length;
    const tir = (inRange / total) * 100;
    const tbr = ((veryLow + low) / total) * 100;
    const tar = ((veryHigh + high) / total) * 100;
    const gmi = 3.31 + 0.02392 * (mean * 18.0182);
    const gri = ((veryLow * 3.0) + (low * 2.4) + (veryHigh * 1.6) + (high * 0.8)) / total * 100;

    return {
        mean: mean.toFixed(1),
        cv: cv.toFixed(1),
        tir: tir.toFixed(1),
        tbr: tbr.toFixed(1),
        tar: tar.toFixed(1),
        gmi: gmi.toFixed(1),
        gri: gri.toFixed(1)
    };
};

const parseLocalTimestamp = (value, index) => {
    const trimmed = String(value || '').trim();
    const timeOnlyMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

    if (timeOnlyMatch) {
        const date = new Date();
        date.setHours(Number(timeOnlyMatch[1]), Number(timeOnlyMatch[2]), Number(timeOnlyMatch[3] || 0), 0);
        return date;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    const fallback = new Date();
    fallback.setMinutes(0, 0, 0);
    fallback.setTime(fallback.getTime() - Math.max(0, index) * 15 * 60 * 1000);
    return fallback;
};

const getMetricStatus = (metric, rawValue) => {
    const value = Number(rawValue);
    switch (metric) {
        case 'tir':
            return value >= 70 ? 'success' : value >= 55 ? 'warning' : 'danger';
        case 'tar':
            return value < 25 ? 'success' : value < 35 ? 'warning' : 'danger';
        case 'tbr':
            return value < 4 ? 'success' : value < 8 ? 'warning' : 'danger';
        case 'cv':
            return value <= 36 ? 'success' : 'danger';
        default:
            return 'neutral';
    }
};

const buildLocalPythonInsights = (data, metrics) => {
    const recent = data.slice(-96);
    const windows = [
        { key: 'overnight', label: '夜间恢复窗口', start: 0, end: 6 },
        { key: 'morning', label: '晨间响应窗口', start: 6, end: 12 },
        { key: 'afternoon', label: '午后稳定窗口', start: 12, end: 18 },
        { key: 'evening', label: '晚间收敛窗口', start: 18, end: 24 }
    ];

    const windowProfiles = windows.map((window) => {
        const values = data
            .filter((item) => {
                const hour = new Date(item.timestamp).getHours();
                return hour >= window.start && hour < window.end;
            })
            .map((item) => item.glucose);

        const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        return {
            key: window.key,
            label: window.label,
            avg: avg ? Number(avg.toFixed(1)) : null,
            min: values.length ? Number(Math.min(...values).toFixed(1)) : null,
            max: values.length ? Number(Math.max(...values).toFixed(1)) : null,
            status: avg == null ? 'neutral' : avg > TARGET_RANGE.max ? 'danger' : avg < TARGET_RANGE.min ? 'warning' : 'success'
        };
    });

    const anomalies = [];
    if (Number(metrics.cv) > 36) {
        anomalies.push({
            id: 'variability',
            title: '整体波动偏大',
            severity: 'high',
            evidence: `CV ${metrics.cv}%`,
            nextStep: '优先排查餐后峰值与夜间波动。'
        });
    }

    if (Number(metrics.tar) > 25) {
        anomalies.push({
            id: 'tar',
            title: '高血糖暴露偏长',
            severity: 'high',
            evidence: `TAR ${metrics.tar}%`,
            nextStep: '建议把高峰识别做成主动提醒。'
        });
    }

    if (!anomalies.length) {
        anomalies.push({
            id: 'stable',
            title: '整体控制接近目标',
            severity: 'positive',
            evidence: `TIR ${metrics.tir}% / CV ${metrics.cv}%`,
            nextStep: '适合强化长期趋势追踪和个体化解释。'
        });
    }

    return {
        engine: 'local-signal-engine',
        generated: false,
        summary: {
            overallRisk: Number(metrics.cv) > 36 || Number(metrics.tar) > 25 ? 'high' : 'moderate',
            dominantPattern: anomalies[0].title,
            narrative: '当前使用浏览器内回退分析，建议启动后端以获得完整 Signal Engine 结果。',
            coverageHours: 24,
            meanGlucose: metrics.mean,
            samples: data.length,
            estimatedDays: Math.max(1, Math.round(data.length / 96))
        },
        windowProfiles,
        mealSignals: [
            {
                label: '早餐后',
                peak: recent.length >= 36 ? Number(Math.max(...recent.slice(20, 36).map((item) => item.glucose)).toFixed(1)) : null,
                status: 'warning',
                insight: '早餐后有轻度抬升，适合做成主动解释卡片。'
            },
            {
                label: '午餐后',
                peak: recent.length >= 60 ? Number(Math.max(...recent.slice(44, 60).map((item) => item.glucose)).toFixed(1)) : null,
                status: 'warning',
                insight: '午后是重点观察窗口。'
            },
            {
                label: '晚餐后',
                peak: recent.length >= 84 ? Number(Math.max(...recent.slice(68, 84).map((item) => item.glucose)).toFixed(1)) : null,
                status: 'success',
                insight: '晚间整体回落较平稳。'
            }
        ],
        dailyPatterns: [],
        anomalyCards: anomalies,
        suggestedQuestions: [
            '最值得优先解释的风险是什么？',
            '这个作品最能体现 AI 能力的点是什么？',
            '这份结果应该如何接进协作工作流？'
        ]
    };
};

const buildLocalAnalysis = (metrics, pythonInsights) => {
    const highRisk = Number(metrics.cv) > 36 || Number(metrics.tar) > 25;
    return {
        risk_level: highRisk ? 'high' : 'medium',
        pathology_summary: highRisk
            ? `当前数据表现出较明显的波动与高血糖暴露。系统会优先把“${pythonInsights?.summary?.dominantPattern || '整体波动偏大'}”解释为需要主动关注的主模式，并适合做成 AI 主动服务能力。`
            : '当前数据整体接近目标，但仍存在可以优化的局部时段。更适合围绕“持续追踪 + 关键时段解释 + 下一步建议”来呈现 AI 能力。',
        video_generation_prompt: highRisk
            ? 'Cinematic medical animation inside retinal microvessels with visible oxidative stress, vessel wall leakage, and inflammatory red blood cell clustering.'
            : 'Cinematic medical animation of a mostly stable capillary system with brief stress pulses and clinical lighting.',
        recommendations: highRisk
            ? ['把高峰识别做成主动提醒', '补充按时段解释能力', '增加下一步行动建议']
            : ['强化趋势解释', '补充日维度复盘', '支持自然语言追问'],
        clinical_focus: pythonInsights?.summary?.dominantPattern || '关键时段优化',
        product_story: pythonInsights?.summary?.narrative || '适合做成具备解释、提醒和复盘闭环的 AI Copilot。'
    };
};

const buildLocalWorkflow = ({ metrics, analysis, pythonInsights }) => ({
    title: 'GlucoPilot Agent Workflow',
    summary: `围绕“${pythonInsights?.summary?.dominantPattern || analysis?.clinical_focus || '关键时段优化'}”构建一条从数据洞察到协作平台执行的 Agent 闭环。`,
    positioning: '把健康数据分析从一次性报告升级成可持续协作的办公场景智能体。',
    workflow_steps: [
        {
            id: 'ingest',
            title: '接收 CGM 数据',
            owner: '数据入口 Agent',
            goal: '解析 CSV / 截图并标准化指标',
            automation: '自动写入结构化上下文'
        },
        {
            id: 'signals',
            title: '信号引擎分析',
            owner: 'CGM Signal Engine',
            goal: '生成时段画像、异常卡片和餐后峰值',
            automation: '作为 Copilot 的结构化 grounding'
        },
        {
            id: 'copilot',
            title: '多轮 Copilot 解释',
            owner: 'AI Copilot',
            goal: '支持追问、连续对话和方案解释',
            automation: '保留对话历史并生成下一步建议'
        },
        {
            id: 'lark',
            title: '协作平台执行',
            owner: 'Workflow Agent',
            goal: '推送到消息、表格、文档与待办',
            automation: '形成提醒、记录、复盘和协作闭环'
        }
    ],
    feishu_surfaces: [
        {
            surface: '消息入口',
            fit: '适合主动提醒和多轮问答入口',
            action: '推送异常摘要和继续追问按钮'
        },
        {
            surface: '多维表格',
            fit: '适合沉淀每日信号与风险标签',
            action: '写入日维度指标、风险等级和处理状态'
        },
        {
            surface: '文档空间',
            fit: '适合生成答辩材料与病例摘要',
            action: '自动生成项目说明与结果复盘'
        },
        {
            surface: '待办 / 日历',
            fit: '适合把风险转成下一步动作',
            action: '自动创建复查、追踪和提醒任务'
        }
    ],
    demo_script: [
        '上传数据，10 秒内跑完指标、信号引擎分析与 AI 结果。',
        '进入 Copilot 面板，连续追问两到三轮，展示真实多轮问答。',
        '切到 Workflow 页面，说明如何接进消息、表格和文档系统。',
        Number(metrics?.cv) > 36 || Number(metrics?.tar) > 25
            ? '强调系统如何把高风险信号转成主动提醒和复盘任务。'
            : '强调系统如何把长期稳定跟踪做成持续协作工作流。'
    ],
    source: 'rules'
});

const requestBackendPipeline = async (data) => {
    const response = await fetch('/api/pipeline/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data,
            unit: 'auto',
            locale: 'zh-CN'
        })
    });

    if (!response.ok) throw new Error(await response.text());
    return response.json();
};

const requestBackendCsvParse = async (csvText) => {
    const response = await fetch('/api/cgm/parse-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            csvText,
            unit: 'auto'
        })
    });

    if (!response.ok) throw new Error(await response.text());
    return response.json();
};

const requestCopilotAnswer = async ({ question, metrics, analysis, pythonInsights, history }) => {
    const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question,
            metrics,
            analysis,
            signalInsights: pythonInsights,
            history,
            locale: 'zh-CN'
        })
    });

    if (!response.ok) throw new Error(await response.text());
    return response.json();
};

const requestWorkflowPlan = async ({ metrics, analysis, pythonInsights }) => {
    const response = await fetch('/api/agent/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            metrics,
            analysis,
            signalInsights: pythonInsights,
            locale: 'zh-CN'
        })
    });

    if (!response.ok) throw new Error(await response.text());
    return response.json();
};

const Pill = ({ children, tone = 'neutral' }) => (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusStyles[tone] || statusStyles.neutral}`}>
        {children}
    </span>
);

const MetricCard = ({ label, value, unit, description, status }) => (
    <div className={`rounded-[24px] border p-5 shadow-sm ${statusStyles[status] || statusStyles.neutral}`}>
        <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] opacity-70">{label}</p>
            <div className="h-2.5 w-2.5 rounded-full bg-current opacity-50" />
        </div>
        <div className="flex items-end gap-1">
            <span className="text-3xl font-black tracking-tight">{value}</span>
            <span className="pb-1 text-xs font-semibold opacity-70">{unit}</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed opacity-80">{description}</p>
    </div>
);

const SignalCard = ({ title, evidence, nextStep, severity }) => (
    <div className={`rounded-[22px] border p-5 ${statusStyles[severity] || statusStyles.neutral}`}>
        <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <h4 className="text-sm font-bold">{title}</h4>
        </div>
        <p className="text-xs leading-6 opacity-80">{evidence}</p>
        <div className="mt-4 rounded-2xl bg-white/60 px-3 py-2 text-xs font-medium">下一步：{nextStep}</div>
    </div>
);

const AskChip = ({ text, onClick }) => (
    <button
        type="button"
        onClick={() => onClick(text)}
        className="rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-900 transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-sm"
    >
        {text}
    </button>
);

const TabButton = ({ active, onClick, icon: Icon, label, helper }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex min-w-[200px] items-start gap-3 rounded-[22px] border px-4 py-3 text-left transition ${
            active
                ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-300'
                : 'border-slate-200 bg-white text-slate-800 hover:border-sky-300'
        }`}
    >
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
            <div className="text-sm font-black">{label}</div>
            <div className={`mt-1 text-xs ${active ? 'text-white/70' : 'text-slate-500'}`}>{helper}</div>
        </div>
    </button>
);

const DataUploadCard = ({ onDataLoaded }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('idle');
    const [previewImage, setPreviewImage] = useState(null);
    const fileInputRef = useRef(null);
    const imageInputRef = useRef(null);

    const parseCsvLocally = (text) => {
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = (lines[0] || '').toLowerCase().split(',').map((item) => item.trim());
        const glucoseIndex = headers.findIndex((item) => item.includes('glucose') || item.includes('value') || item.includes('sgv'));
        const timeIndex = headers.findIndex((item) => item.includes('time') || item.includes('date') || item.includes('timestamp'));

        if (glucoseIndex === -1) throw new Error('CSV 中缺少 glucose/value 列');

        return lines.slice(1).map((line, index) => {
            const cols = line.split(',');
            const glucose = Number(cols[glucoseIndex]);
            if (!Number.isFinite(glucose)) return null;
            const time = parseLocalTimestamp(cols[timeIndex], index);
            return {
                timestamp: time.toISOString(),
                displayTime: formatDisplayTime(time),
                glucose
            };
        }).filter(Boolean);
    };

    const processFile = (file) => {
        setUploadStatus('processing');

        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const text = String(event.target?.result || '');

                try {
                    const backendResult = await requestBackendCsvParse(text);
                    onDataLoaded(backendResult.data);
                    setUploadStatus('success');
                    return;
                } catch (error) {
                    console.warn('Backend CSV parse unavailable, using local parser.', error);
                }

                try {
                    onDataLoaded(parseCsvLocally(text));
                    setUploadStatus('success');
                } catch (error) {
                    setUploadStatus('idle');
                    alert(`CSV 解析失败：${error.message}`);
                }
            };
            reader.readAsText(file);
            return;
        }

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = () => {
                setPreviewImage(URL.createObjectURL(file));
                window.setTimeout(() => {
                    onDataLoaded(generateCGMData());
                    setUploadStatus('success');
                }, 1200);
            };
            reader.readAsDataURL(file);
            return;
        }

        setUploadStatus('idle');
        alert('请上传 CSV 或图片文件');
    };

    return (
        <div
            className={`rounded-[28px] border-2 border-dashed p-6 transition ${isDragging ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white/80'}`}
            onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (event.dataTransfer.files?.[0]) processFile(event.dataTransfer.files[0]);
            }}
        >
            {uploadStatus === 'idle' && (
                <div className="flex flex-col items-center justify-center gap-5 py-4 text-center">
                    <div className="grid w-full max-w-xl gap-4 md:grid-cols-2">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-[24px] border border-slate-200 bg-slate-50 px-6 py-6 text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50"
                        >
                            <Upload className="mb-4 h-6 w-6 text-sky-600" />
                            <div className="font-bold text-slate-900">上传 CGM CSV</div>
                            <p className="mt-2 text-sm text-slate-500">自动识别单位，直接进入 Signal Engine + AI 分析链路。</p>
                        </button>
                        <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className="rounded-[24px] border border-slate-200 bg-slate-50 px-6 py-6 text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50"
                        >
                            <ImageIcon className="mb-4 h-6 w-6 text-violet-600" />
                            <div className="font-bold text-slate-900">上传血糖截图</div>
                            <p className="mt-2 text-sm text-slate-500">当前为 Demo 级视觉入口，适合比赛演示。</p>
                        </button>
                    </div>
                    <p className="text-sm font-medium text-slate-500">拖拽文件到这里也可以，推荐先用 CSV 走完整链路。</p>
                </div>
            )}

            {uploadStatus === 'processing' && (
                <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
                    <div>
                        <p className="font-semibold text-slate-900">正在载入数据并准备 AI 上下文</p>
                        <p className="mt-1 text-sm text-slate-500">{previewImage ? '已识别图片入口，正在生成演示数据' : '正在解析 CSV 内容'}</p>
                    </div>
                </div>
            )}

            {uploadStatus === 'success' && (
                <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                    <div className="rounded-full bg-emerald-100 p-4 text-emerald-700">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div>
                        <p className="font-semibold text-slate-900">数据已载入</p>
                        <p className="mt-1 text-sm text-slate-500">可以直接运行 AI 分析、Copilot 多轮问答和 Workflow 生成。</p>
                    </div>
                    <button type="button" onClick={() => setUploadStatus('idle')} className="text-sm font-semibold text-sky-700">
                        继续上传其他文件
                    </button>
                </div>
            )}

            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(event) => event.target.files?.[0] && processFile(event.target.files[0])} />
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && processFile(event.target.files[0])} />
        </div>
    );
};

function App() {
    const [activePage, setActivePage] = useState('copilot');
    const [cgmData, setCgmData] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [pythonInsights, setPythonInsights] = useState(null);
    const [workflowPlan, setWorkflowPlan] = useState(null);
    const [videoUrl, setVideoUrl] = useState('/video_placeholder.svg');
    const [status, setStatus] = useState('idle');
    const [workflowStatus, setWorkflowStatus] = useState('idle');
    const [copilotQuestion, setCopilotQuestion] = useState('');
    const [copilotStatus, setCopilotStatus] = useState('idle');
    const [copilotMessages, setCopilotMessages] = useState([]);
    const [showUpload, setShowUpload] = useState(true);

    useEffect(() => {
        const initialData = generateCGMData();
        setCgmData(initialData);
        setMetrics(calculateMetrics(initialData));
    }, []);

    const chartData = useMemo(() => cgmData.slice(-96), [cgmData]);
    const deferredChartData = useDeferredValue(chartData);
    const suggestedQuestions = pythonInsights?.suggestedQuestions || [];

    const resetDerivedState = () => {
        setAnalysis(null);
        setPythonInsights(null);
        setWorkflowPlan(null);
        setVideoUrl('/video_placeholder.svg');
        setCopilotMessages([]);
        setCopilotQuestion('');
        setStatus('idle');
        setWorkflowStatus('idle');
        setCopilotStatus('idle');
    };

    const updateDataset = (nextData) => {
        const nextMetrics = calculateMetrics(nextData);
        startTransition(() => {
            setCgmData(nextData);
            setMetrics(nextMetrics);
            resetDerivedState();
        });
    };

    const handleRunAnalysis = async () => {
        if (!metrics) return;
        setStatus('analyzing');

        try {
            const result = await requestBackendPipeline(cgmData);
            startTransition(() => {
                setCgmData(result.data || cgmData);
                setMetrics(result.metrics || metrics);
                setAnalysis(result.analysis || null);
                setPythonInsights(result.signalInsights || result.pythonInsights || null);
                setVideoUrl(result.video?.videoUrl || '/video_placeholder.svg');
                setWorkflowPlan(null);
                setCopilotMessages([]);
                setStatus('complete');
            });
            return;
        } catch (error) {
            console.warn('Backend unavailable, switching to local analysis.', error);
        }

        const localInsights = buildLocalPythonInsights(cgmData, metrics);
        const localAnalysis = buildLocalAnalysis(metrics, localInsights);

        startTransition(() => {
            setPythonInsights(localInsights);
            setAnalysis(localAnalysis);
            setVideoUrl('/video_placeholder.svg');
            setWorkflowPlan(null);
            setCopilotMessages([]);
            setStatus('complete');
        });
    };

    const handleAskCopilot = async (presetQuestion = '') => {
        const question = String(presetQuestion || copilotQuestion).trim();
        if (!question || !metrics || !analysis) return;

        const nextMessages = [...copilotMessages, { role: 'user', content: question }];
        setCopilotMessages(nextMessages);
        setCopilotQuestion('');
        setCopilotStatus('loading');

        try {
            const result = await requestCopilotAnswer({
                question,
                metrics,
                analysis,
                pythonInsights,
                history: nextMessages.slice(0, -1).map((message) => ({
                    role: message.role,
                    content: message.content
                }))
            });

            setCopilotMessages([
                ...nextMessages,
                {
                    role: 'assistant',
                    content: result.answer.answer,
                    meta: {
                        follow_up: result.answer.follow_up,
                        confidence: result.answer.confidence,
                        highlights: result.answer.highlights || [],
                        source: result.answer.source
                    }
                }
            ]);
            setCopilotStatus('done');
            return;
        } catch (error) {
            console.warn('Copilot backend unavailable, using local answer.', error);
        }

        const fallbackText = `我会优先把“${pythonInsights?.summary?.dominantPattern || analysis?.clinical_focus || '关键时段优化'}”讲成这份作品的核心亮点。更强的表达方式，是让 AI 不只给出结论，还能结合信号引擎结果做多轮追问与工作流落地。`;
        setCopilotMessages([
            ...nextMessages,
            {
                role: 'assistant',
                content: fallbackText,
                meta: {
                    follow_up: '你可以继续追问某个异常卡片，或者让系统把它翻译成协作平台里的执行流程。',
                    confidence: 'medium',
                    highlights: ['支持多轮对话', '能结合结构化信号解释', '适合演示工作流闭环'],
                    source: 'rules'
                }
            }
        ]);
        setCopilotStatus('done');
    };

    const handleGenerateWorkflow = async () => {
        if (!metrics || !analysis) return;
        setWorkflowStatus('loading');

        try {
            const result = await requestWorkflowPlan({
                metrics,
                analysis,
                pythonInsights
            });
            setWorkflowPlan(result.workflow);
            setWorkflowStatus('done');
            return;
        } catch (error) {
            console.warn('Workflow backend unavailable, using local workflow.', error);
        }

        setWorkflowPlan(buildLocalWorkflow({ metrics, analysis, pythonInsights }));
        setWorkflowStatus('done');
    };

    return (
        <div className="min-h-screen px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl space-y-8">
                <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white/85 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.35)] backdrop-blur">
                    <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.3fr_0.9fr] lg:px-8">
                        <div className="space-y-6">
                            <Pill tone="info">
                                <Sparkles className="h-3.5 w-3.5" />
                                Product Demo Ready
                            </Pill>
                            <div className="space-y-4">
                                <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight text-slate-950 md:text-5xl">
                                    GlucoPilot AI Studio
                                </h1>
                                <p className="max-w-3xl text-base leading-8 text-slate-600 md:text-lg">
                                    把糖尿病数据可视化 Demo 升级成更完整的 AI 产品原型：
                                    前端负责交互与讲述，后端负责编排，CGM Signal Engine 负责结构化洞察，Copilot 负责多轮问答，
                                    Agent Workflow 页负责说明如何接进消息、表格、文档和待办系统。
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <Pill tone="neutral"><Brain className="h-3.5 w-3.5" />AI Narrative</Pill>
                                <Pill tone="neutral"><FlaskConical className="h-3.5 w-3.5" />CGM Signal Engine</Pill>
                                <Pill tone="neutral"><Bot className="h-3.5 w-3.5" />Multi-turn Copilot</Pill>
                                <Pill tone="neutral"><Activity className="h-3.5 w-3.5" />Workflow Story</Pill>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                            <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
                                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Upload className="h-4 w-4 text-sky-600" />数据入口</div>
                                <div className="text-3xl font-black">{cgmData.length}</div>
                                <p className="mt-2 text-sm text-slate-500">当前载入点位，默认覆盖 14 天，每 15 分钟一条。</p>
                            </div>
                            <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
                                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><FlaskConical className="h-4 w-4 text-emerald-600" />Signal Engine</div>
                                <div className="text-3xl font-black">{pythonInsights?.generated ? 'ON' : 'READY'}</div>
                                <p className="mt-2 text-sm text-slate-500">产出时段画像、异常卡片和建议问题。</p>
                            </div>
                            <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
                                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Bot className="h-4 w-4 text-violet-600" />Copilot</div>
                                <div className="text-3xl font-black">{copilotMessages.length > 0 ? 'LIVE' : 'WAIT'}</div>
                                <p className="mt-2 text-sm text-slate-500">支持真实多轮上下文，会话历史会带入下一次回答。</p>
                            </div>
                        </div>
                    </div>
                </section>

                <nav className="sticky top-4 z-20 rounded-[24px] border border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-sky-500 p-2 text-white shadow-lg shadow-sky-200">
                                <Activity className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="text-sm font-black text-slate-900">GlucoPilot AI Studio</div>
                                <div className="text-xs text-slate-500">AI Copilot + Signal Engine Workflow Demo</div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setShowUpload((value) => !value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">
                                {showUpload ? '收起上传面板' : '打开上传面板'}
                            </button>
                            <button type="button" onClick={() => updateDataset(generateCGMData())} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">
                                <RefreshCw className="h-4 w-4" />
                                生成新数据
                            </button>
                            <button type="button" onClick={handleRunAnalysis} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-slate-800">
                                {status === 'analyzing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                                运行 AI 分析
                            </button>
                        </div>
                    </div>
                </nav>

                <section className="flex flex-wrap gap-3">
                    <TabButton
                        active={activePage === 'copilot'}
                        onClick={() => setActivePage('copilot')}
                        icon={MessageSquare}
                        label="Copilot 演示页"
                        helper="多轮问答、指标解释、信号引擎展示"
                    />
                    <TabButton
                        active={activePage === 'workflow'}
                        onClick={() => setActivePage('workflow')}
                        icon={CalendarRange}
                        label="Agent Workflow 页"
                        helper="协作工作流接入、Agent 流程和执行方案"
                    />
                </section>

                {showUpload && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-sky-600" />
                            <h2 className="text-lg font-black text-slate-900">数据入口</h2>
                        </div>
                        <DataUploadCard onDataLoaded={updateDataset} />
                    </section>
                )}

                <section className="space-y-5">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-sky-600" />
                        <h2 className="text-lg font-black text-slate-900">临床指标总览</h2>
                    </div>
                    {metrics && (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                            <MetricCard label="TIR" value={metrics.tir} unit="%" description="目标 > 70%，体现目标区间内停留时间。" status={getMetricStatus('tir', metrics.tir)} />
                            <MetricCard label="TAR" value={metrics.tar} unit="%" description="目标 < 25%，衡量高血糖暴露。" status={getMetricStatus('tar', metrics.tar)} />
                            <MetricCard label="TBR" value={metrics.tbr} unit="%" description="目标 < 4%，关注低血糖风险。" status={getMetricStatus('tbr', metrics.tbr)} />
                            <MetricCard label="CV" value={metrics.cv} unit="%" description="目标 ≤ 36%，衡量整体波动程度。" status={getMetricStatus('cv', metrics.cv)} />
                            <MetricCard label="GMI" value={metrics.gmi} unit="%" description="估算长期糖代谢水平。" status="neutral" />
                            <MetricCard label="GRI" value={metrics.gri} unit="" description="复合风险指数，可做评分展示。" status={Number(metrics.gri) < 40 ? 'success' : 'warning'} />
                        </div>
                    )}
                </section>

                {activePage === 'copilot' && (
                    <>
                        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
                            <div className="rounded-[30px] border border-slate-200 bg-white/85 p-6 shadow-sm">
                                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900">24 小时血糖曲线</h3>
                                        <p className="mt-1 text-sm text-slate-500">用于演示趋势、阈值和异常波段。</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Pill tone="success">目标区间 3.9 - 10.0 mmol/L</Pill>
                                        <Pill tone="warning">支持 CSV / 图片入口</Pill>
                                    </div>
                                </div>
                                <div className="h-[360px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={deferredChartData}>
                                            <defs>
                                                <linearGradient id="glucoseFill" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={CHART_COLORS.secondary} stopOpacity={0.28} />
                                                    <stop offset="95%" stopColor={CHART_COLORS.secondary} stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                            <XAxis dataKey="displayTime" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} interval={11} />
                                            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} domain={[0, 18]} unit=" mmol/L" />
                                            <Tooltip
                                                contentStyle={{ borderRadius: 18, border: '1px solid #e2e8f0', boxShadow: '0 18px 40px -18px rgba(15, 23, 42, 0.35)' }}
                                                labelStyle={{ color: '#475569', fontWeight: 600 }}
                                                itemStyle={{ color: '#0f172a', fontWeight: 700 }}
                                            />
                                            <ReferenceLine y={TARGET_RANGE.max} stroke={CHART_COLORS.success} strokeDasharray="4 4" />
                                            <ReferenceLine y={TARGET_RANGE.min} stroke={CHART_COLORS.success} strokeDasharray="4 4" />
                                            <Area type="monotone" dataKey="glucose" stroke={CHART_COLORS.primary} strokeWidth={3} fill="url(#glucoseFill)" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="rounded-[30px] border border-slate-200 bg-white/85 p-6 shadow-sm">
                                <div className="mb-6 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900">AI 结果总览</h3>
                                        <p className="mt-1 text-sm text-slate-500">分析、视频提示词和产品表达都在这里收敛。</p>
                                    </div>
                                    <Pill tone={analysis?.risk_level === 'high' ? 'danger' : analysis ? 'warning' : 'neutral'}>
                                        {analysis ? `风险等级 ${analysis.risk_level}` : '等待分析'}
                                    </Pill>
                                </div>

                                {!analysis && (
                                    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                        <Brain className="mb-4 h-10 w-10 text-slate-300" />
                                        <h4 className="text-lg font-bold text-slate-900">准备好做一次完整演示</h4>
                                        <p className="mt-2 max-w-sm text-sm leading-7 text-slate-500">
                                            点击“运行 AI 分析”后，系统会联动临床指标、信号引擎结果、AI 分析文本和多轮 Copilot。
                                        </p>
                                    </div>
                                )}

                                {analysis && (
                                    <div className="space-y-5">
                                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                                            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                                                <Wand2 className="h-4 w-4 text-violet-600" />
                                                Pathology Summary
                                            </div>
                                            <p className="text-sm leading-7 text-slate-600">{analysis.pathology_summary}</p>
                                        </div>

                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                                                <div className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Clinical Focus</div>
                                                <div className="text-base font-bold text-slate-900">{analysis.clinical_focus || pythonInsights?.summary?.dominantPattern || '关键时段优化'}</div>
                                                <p className="mt-2 text-sm leading-6 text-slate-500">{analysis.product_story}</p>
                                            </div>
                                            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950">
                                                <div className="relative aspect-video">
                                                    <img src={videoUrl || '/video_placeholder.svg'} alt="AI visualization" className="h-full w-full object-cover opacity-90" />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/10 to-transparent" />
                                                    <div className="absolute bottom-0 left-0 right-0 p-4">
                                                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                                                            <Play className="h-3.5 w-3.5 fill-current" />
                                                            AI Generated Preview
                                                        </div>
                                                        <p className="text-xs leading-6 text-white/80">{analysis.video_generation_prompt}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="rounded-[20px] border border-rose-100 bg-rose-50 p-4 text-center">
                                                <Eye className="mx-auto mb-2 h-5 w-5 text-rose-500" />
                                                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-700">Retinopathy</div>
                                            </div>
                                            <div className="rounded-[20px] border border-amber-100 bg-amber-50 p-4 text-center">
                                                <HeartPulse className="mx-auto mb-2 h-5 w-5 text-amber-500" />
                                                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">CV Risk</div>
                                            </div>
                                            <div className="rounded-[20px] border border-sky-100 bg-sky-50 p-4 text-center">
                                                <Zap className="mx-auto mb-2 h-5 w-5 text-sky-500" />
                                                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Agent Action</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="space-y-5">
                            <div className="flex items-center gap-2">
                                <FlaskConical className="h-5 w-5 text-emerald-600" />
                                <h2 className="text-lg font-black text-slate-900">CGM Signal Engine</h2>
                            </div>

                            {!pythonInsights && (
                                <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500">
                                    运行分析后，这里会出现信号引擎生成的时段信号、异常卡片、餐后峰值和建议追问。
                                </div>
                            )}

                            {pythonInsights && (
                                <div className="space-y-5">
                                    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                                        <div className="rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="text-lg font-black text-slate-900">结构化摘要</h3>
                                                    <p className="mt-1 text-sm text-slate-500">这部分就是你在比赛里可以重点讲的信号引擎能力。</p>
                                                </div>
                                                <Pill tone={pythonInsights.generated ? 'success' : 'warning'}>
                                                    {pythonInsights.generated ? 'Engine Active' : 'Fallback Snapshot'}
                                                </Pill>
                                            </div>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                                                    <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">主模式</div>
                                                    <div className="mt-2 text-xl font-black text-slate-900">{pythonInsights.summary?.dominantPattern || '等待生成'}</div>
                                                </div>
                                                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                                                    <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">总体风险</div>
                                                    <div className="mt-2 text-xl font-black text-slate-900">{pythonInsights.summary?.overallRisk || 'unknown'}</div>
                                                </div>
                                            </div>
                                            <p className="mt-4 text-sm leading-7 text-slate-600">{pythonInsights.summary?.narrative}</p>
                                        </div>

                                        <div className="rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm">
                                            <div className="mb-4 flex items-center gap-2">
                                                <CalendarRange className="h-4 w-4 text-slate-500" />
                                                <h3 className="text-lg font-black text-slate-900">时段画像</h3>
                                            </div>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                {(pythonInsights.windowProfiles || []).map((profile) => (
                                                    <div key={profile.key} className={`rounded-[22px] border p-4 ${statusStyles[profile.status] || statusStyles.neutral}`}>
                                                        <div className="text-sm font-bold">{profile.label}</div>
                                                        <div className="mt-3 flex items-end gap-1">
                                                            <span className="text-3xl font-black">{profile.avg ?? '--'}</span>
                                                            <span className="pb-1 text-xs font-semibold opacity-70">mmol/L</span>
                                                        </div>
                                                        <p className="mt-2 text-xs opacity-80">范围 {profile.min ?? '--'} - {profile.max ?? '--'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-3">
                                        {(pythonInsights.anomalyCards || []).map((item) => (
                                            <SignalCard key={item.id} title={item.title} evidence={item.evidence} nextStep={item.nextStep} severity={item.severity} />
                                        ))}
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-3">
                                        {(pythonInsights.mealSignals || []).map((signal) => (
                                            <div key={signal.label} className={`rounded-[24px] border p-5 ${statusStyles[signal.status] || statusStyles.neutral}`}>
                                                <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                                                    <Sparkles className="h-4 w-4" />
                                                    {signal.label}
                                                </div>
                                                <div className="flex items-end gap-1">
                                                    <span className="text-3xl font-black">{signal.peak ?? '--'}</span>
                                                    <span className="pb-1 text-xs font-semibold opacity-70">mmol/L 峰值</span>
                                                </div>
                                                <p className="mt-3 text-sm leading-6 opacity-80">{signal.insight}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="rounded-[30px] border border-slate-200 bg-white/85 p-6 shadow-sm">
                            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-black text-slate-900">AI Copilot 多轮问答</h2>
                                    <p className="mt-1 text-sm text-slate-500">支持真实多轮上下文，适合直接做产品演示和交互讲解。</p>
                                </div>
                                <Pill tone={copilotMessages.length ? 'success' : 'neutral'}>
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    {copilotMessages.length ? `${copilotMessages.length} 条消息` : '等待提问'}
                                </Pill>
                            </div>

                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    {suggestedQuestions.map((question) => (
                                        <AskChip key={question} text={question} onClick={handleAskCopilot} />
                                    ))}
                                </div>

                                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                                    {copilotMessages.length === 0 && (
                                        <div className="py-10 text-center text-sm text-slate-500">先运行一次分析，再发起多轮追问。</div>
                                    )}
                                    {copilotMessages.length > 0 && (
                                        <div className="space-y-4">
                                            {copilotMessages.map((message, index) => (
                                                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[85%] rounded-[22px] px-4 py-3 text-sm leading-7 ${
                                                        message.role === 'user'
                                                            ? 'bg-slate-950 text-white'
                                                            : 'border border-sky-200 bg-white text-slate-700'
                                                    }`}>
                                                        <p>{message.content}</p>
                                                        {message.role === 'assistant' && message.meta && (
                                                            <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                                                                <div className="flex flex-wrap gap-2">
                                                                    <Pill tone="info">置信度 {message.meta.confidence || 'medium'}</Pill>
                                                                    <Pill tone="neutral">来源 {message.meta.source || 'unknown'}</Pill>
                                                                </div>
                                                                {message.meta.highlights?.length > 0 && (
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {message.meta.highlights.map((item) => (
                                                                            <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                                                                {item}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <div className="rounded-[18px] bg-sky-50 px-3 py-2 text-xs text-slate-600">
                                                                    下一步建议：{message.meta.follow_up}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                                    <textarea
                                        value={copilotQuestion}
                                        onChange={(event) => setCopilotQuestion(event.target.value)}
                                        placeholder="比如：这个作品最能体现 AI 能力的地方是什么？"
                                        className="min-h-[108px] rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAskCopilot()}
                                        disabled={!analysis || copilotStatus === 'loading'}
                                        className="inline-flex min-w-[148px] items-center justify-center gap-2 rounded-[24px] bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {copilotStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                                        发送提问
                                    </button>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {activePage === 'workflow' && (
                    <section className="space-y-6">
                        <div className="rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm lg:p-8">
                            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                                <div className="space-y-4">
                                    <Pill tone="info">
                                        <CalendarRange className="h-3.5 w-3.5" />
                                        Agent Workflow Showcase
                                    </Pill>
                                    <h2 className="text-3xl font-black tracking-tight text-slate-950">从 CGM 分析到协作平台执行的 Agent 闭环</h2>
                                    <p className="text-base leading-8 text-slate-600">
                                        这一页不是单纯讲技术栈，而是帮你把作品说成“能接进真实办公场景”的 Agent 方案：
                                        数据进来之后如何被信号引擎挖掘、如何进入 Copilot 多轮对话、最后如何落在消息、表格、文档和待办系统里。
                                    </p>
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={handleGenerateWorkflow}
                                            disabled={!analysis || workflowStatus === 'loading'}
                                            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {workflowStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                            生成 Agent Workflow
                                        </button>
                                        <Pill tone={workflowPlan?.source === 'ai' ? 'success' : 'warning'}>
                                            {workflowPlan ? `当前来源 ${workflowPlan.source}` : '等待生成'}
                                        </Pill>
                                    </div>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                                        <div className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">作品定位</div>
                                        <div className="text-lg font-black text-slate-900">{workflowPlan?.title || 'AI Health Workflow Agent'}</div>
                                        <p className="mt-2 text-sm leading-6 text-slate-500">{workflowPlan?.summary || '运行生成后，这里会展示这套工作流的产品定位。'}</p>
                                    </div>
                                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                                        <div className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">当前主模式</div>
                                        <div className="text-lg font-black text-slate-900">{pythonInsights?.summary?.dominantPattern || analysis?.clinical_focus || '待分析'}</div>
                                        <p className="mt-2 text-sm leading-6 text-slate-500">{analysis?.product_story || '建议先运行 AI 分析，再生成完整 Workflow。'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {!workflowPlan && (
                            <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500">
                                先运行 AI 分析，再点击“生成 Agent Workflow”。这会把当前数据结果翻译成协作平台接入方案。
                            </div>
                        )}

                        {workflowPlan && (
                            <>
                                <section className="grid gap-4 lg:grid-cols-4">
                                    {(workflowPlan.workflow_steps || []).map((step, index) => (
                                        <div key={step.id || index} className="rounded-[26px] border border-slate-200 bg-white/85 p-5 shadow-sm">
                                            <div className="mb-4 flex items-center justify-between">
                                                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Step {index + 1}</span>
                                                <ChevronRight className="h-4 w-4 text-slate-300" />
                                            </div>
                                            <h3 className="text-base font-black text-slate-900">{step.title}</h3>
                                            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{step.owner}</p>
                                            <p className="mt-3 text-sm leading-7 text-slate-600">{step.goal}</p>
                                            <div className="mt-4 rounded-[18px] bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                                                自动化动作：{step.automation}
                                            </div>
                                        </div>
                                    ))}
                                </section>

                                <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                                    <div className="rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm">
                                        <div className="mb-5 flex items-center gap-2">
                                            <Bot className="h-5 w-5 text-sky-600" />
                                            <h3 className="text-lg font-black text-slate-900">协作平台接入建议</h3>
                                        </div>
                                        <div className="space-y-4">
                                            {(workflowPlan.feishu_surfaces || []).map((surface) => (
                                                <div key={surface.surface} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                                                    <div className="text-sm font-black text-slate-900">{surface.surface}</div>
                                                    <p className="mt-2 text-sm leading-6 text-slate-600">{surface.fit}</p>
                                                    <div className="mt-3 rounded-[18px] bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                                        推荐动作：{surface.action}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm">
                                        <div className="mb-5 flex items-center gap-2">
                                            <Sparkles className="h-5 w-5 text-violet-600" />
                                            <h3 className="text-lg font-black text-slate-900">答辩 Demo Script</h3>
                                        </div>
                                        <div className="space-y-4">
                                            {(workflowPlan.demo_script || []).map((line, index) => (
                                                <div key={`${index}-${line}`} className="flex gap-3 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">{index + 1}</div>
                                                    <p className="text-sm leading-7 text-slate-600">{line}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-5 rounded-[24px] border border-sky-200 bg-sky-50 p-4">
                                            <div className="text-sm font-black text-sky-900">作品讲法</div>
                                            <p className="mt-2 text-sm leading-7 text-slate-700">{workflowPlan.positioning}</p>
                                        </div>
                                    </div>
                                </section>
                            </>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}

export default App;
