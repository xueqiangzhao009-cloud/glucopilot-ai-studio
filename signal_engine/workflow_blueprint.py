def build_workflow_hints(summary, anomalies, action_plan=None, forecast=None):
    dominant = summary.get("dominantPattern") or "关键波动模式"
    top_anomaly = anomalies[0]["title"] if anomalies else "暂无突出异常"
    forecast_summary = (forecast or {}).get("summary") or "可根据短时趋势安排主动提醒。"
    priority = ((action_plan or {}).get("priorityActions") or [{}])[0].get("action") or "根据异常卡片生成下一步动作。"

    return {
        "positioning": f"围绕“{dominant}”构建从信号识别到动作闭环的智能流程。",
        "system_roles": [
            {"name": "Data Intake", "responsibility": "接收 CSV 或截图并标准化数据"},
            {"name": "Signal Engine", "responsibility": "识别时段模式、餐后峰值和异常卡片"},
            {"name": "Copilot", "responsibility": "解释信号并支持多轮追问"},
            {"name": "Workflow Agent", "responsibility": f"围绕“{top_anomaly}”生成提醒、记录和协作动作"},
        ],
        "delivery_targets": [
            "IM 主动提醒",
            "多维表格记录与追踪",
            "文档化分析摘要",
            "待办与复查动作",
        ],
        "automationIdeas": [
            forecast_summary,
            priority,
            "把风险评分同步到日报或病例追踪视图中。",
        ],
    }
