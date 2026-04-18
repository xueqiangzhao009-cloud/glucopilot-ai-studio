# GlucoPilot AI Studio

GlucoPilot AI Studio 是一个面向连续血糖监测（CGM）数据的 AI 演示项目。它把数据输入、临床指标计算、Python 信号挖掘、AI 多轮问答、病理风险解释和飞书工作流落地方案串成一条完整链路，更适合做 AI 比赛作品、产品原型或课程展示。

> 本项目仅用于演示和研究，不构成医学诊断或治疗建议。

## 这版新增了什么

- 多轮 AI Copilot：支持带历史上下文的连续追问，适合现场答辩演示。
- Python Signal Engine：用 Python 生成时段画像、异常卡片、餐后峰值和建议问题。
- Agent Workflow 展示页：把分析结果翻译成可落到飞书 IM、多维表格、Docs、待办的工作流方案。
- OpenAI-compatible 接口接入：可直接配置真实模型做演示，也支持无 Key 时规则回退。
- 更完整的前端展示：包含 Copilot 演示页和 Workflow 展示页两种讲法。

## 核心能力

- 生成 14 天模拟 CGM 数据，每 15 分钟一个点。
- 支持上传 CSV 数据，自动识别 `mg/dL` / `mmol/L`。
- 支持图片入口做演示级模拟处理。
- 计算 TIR、TAR、TBR、CV、GMI、GRI 等核心血糖指标。
- 用 Recharts 展示最近 24 小时血糖曲线。
- 用 Python 对时段和异常模式做结构化分析。
- 用 AI 生成风险摘要、产品表达和下一步建议。
- 生成面向飞书场景的 Agent Workflow 方案。
- 使用 `vite-plugin-singlefile` 输出单文件静态演示版本。

## 技术栈

- Frontend: React 18, Vite, Tailwind CSS, Recharts, lucide-react
- Backend: Node.js 原生 HTTP Server
- Python: 标准库信号分析脚本
- AI API: OpenAI-compatible `/chat/completions`
- Build: vite-plugin-singlefile

## 项目结构

```text
.
├── public/
│   ├── demo.html
│   └── video_placeholder.svg
├── python/
│   └── cgm_insights.py
├── server/
│   ├── index.js
│   ├── config.js
│   ├── services/
│   │   ├── aiClient.js
│   │   ├── cgmMetrics.js
│   │   ├── fallbackAnalysis.js
│   │   ├── pythonInsights.js
│   │   ├── videoService.js
│   │   └── workflowService.js
│   └── utils/
│       └── http.js
├── src/
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .env.example
├── package.json
├── test_data.csv
└── vite.config.js
```

## 快速开始

安装依赖：

```bash
npm install
```

启动后端 API：

```bash
npm run api
```

启动前端开发服务：

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`

开发模式下，Vite 会把 `/api` 请求代理到后端。

## 环境变量

复制 `.env.example` 为 `.env`，按需填写：

```env
API_HOST=0.0.0.0
API_PORT=8787
CORS_ORIGIN=http://localhost:5173

AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=gpt-5.4-mini
AI_TIMEOUT_MS=30000

VIDEO_API_URL=
VIDEO_API_KEY=
VIDEO_TIMEOUT_MS=45000

PYTHON_BIN=python
PYTHON_TIMEOUT_MS=15000
```

说明：

- 如果不填写 `AI_API_KEY`，后端会自动回退到规则分析和规则 Copilot。
- 如果不填写 `VIDEO_API_URL`，视频结果会回退到占位图。
- `PYTHON_BIN` 用于指定 Python 可执行路径，默认直接使用 `python`。

## 常用命令

```bash
npm run dev
npm run api
npm run build
npm run preview
```

## 后端 API

### GET `/api/health`

检查服务状态、AI 配置状态和视频服务配置状态。

### POST `/api/cgm/metrics`

根据 CGM 数据计算指标。

### POST `/api/cgm/parse-csv`

解析 CSV 并计算指标。

### POST `/api/ai/analyze`

根据指标或原始 CGM 数据生成病理分析摘要。

### POST `/api/ai/copilot`

支持多轮追问的 Copilot 接口，可传 `history` 作为历史消息。

示例：

```json
{
  "locale": "zh-CN",
  "question": "如果我是评委，这个作品最能体现 AI 能力的点是什么？",
  "metrics": {
    "tir": "72.4",
    "tar": "21.1",
    "tbr": "2.0",
    "cv": "31.5",
    "gmi": "6.8",
    "gri": "18.2"
  },
  "analysis": {},
  "pythonInsights": {},
  "history": [
    { "role": "user", "content": "先总结一下这份数据" },
    { "role": "assistant", "content": "这份数据最值得关注的是餐后波动。" }
  ]
}
```

### POST `/api/agent/workflow`

根据当前分析结果生成一套更适合飞书比赛展示的 Agent Workflow 方案。

### POST `/api/video/generate`

根据 prompt 生成视频结果。未配置视频服务时返回占位图。

### POST `/api/pipeline/analyze`

完整流程接口：数据归一化、指标计算、Python 信号分析、AI 分析和视频结果。

## 数据格式说明

CSV 至少需要包含血糖列，列名可包含：

- `glucose`
- `value`
- `sgv`

时间列可包含：

- `time`
- `timestamp`
- `date`

`unit` 支持：

- `auto`
- `mg/dL`
- `mmol/L`

`auto` 会根据数据范围自动判断单位。

## 页面说明

### Copilot 演示页

- 展示血糖曲线和临床指标
- 展示 Python Signal Engine 输出
- 展示 AI 风险摘要
- 支持多轮追问，适合答辩现场演示

### Agent Workflow 展示页

- 展示从数据接入到 AI 推理再到飞书执行的闭环
- 输出 IM、多维表格、Docs、待办等接入建议
- 自带 Demo Script，更适合比赛答辩讲解

## 构建

```bash
npm run build
```

构建结果输出到 `dist/`，主要资源会被内联到单个 HTML，方便演示分发。

## 适合怎么讲这个作品

你可以把它讲成一套“从数据洞察到协作闭环”的 AI Agent 原型：

1. 先用 Python 做结构化信号挖掘，而不是只让模型自由发挥。
2. 再让 AI Copilot 基于结构化信号做多轮问答和解释。
3. 最后把结果翻译成飞书里的执行动作，体现真实业务落地能力。

## 说明

当前 AI 和视频生成都是可插拔接口：

- AI：默认兼容 OpenAI `/chat/completions`。
- 视频：预留 `VIDEO_API_URL`，可接第三方文生视频服务。

真实医疗场景中，还需要补充数据校验、权限认证、审计日志、模型安全评估、医学合规审查和临床验证。
