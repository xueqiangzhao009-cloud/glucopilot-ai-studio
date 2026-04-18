def build_action_plan(summary, anomalies, meal_signals, daily_patterns, forecast):
    top_anomaly = anomalies[0] if anomalies else None
    highest_meal = max(meal_signals, key=lambda item: item.get("peak") or 0) if meal_signals else None
    weakest_day = min(daily_patterns, key=lambda item: item.get("tir") or 0) if daily_patterns else None

    priority_actions = []
    if top_anomaly:
        priority_actions.append(
            {
                "title": top_anomaly["title"],
                "reason": top_anomaly["evidence"],
                "action": top_anomaly["nextStep"],
            }
        )

    if highest_meal and highest_meal.get("peak") is not None:
        priority_actions.append(
            {
                "title": f"{highest_meal['label']}管理",
                "reason": f"当前观察到峰值 {highest_meal['peak']} mmol/L。",
                "action": highest_meal["insight"],
            }
        )

    if forecast.get("trajectory") != "stable":
        priority_actions.append(
            {
                "title": "短时趋势预警",
                "reason": forecast["summary"],
                "action": "适合把未来 2 小时预测接入消息提醒或工作流分发。",
            }
        )

    monitoring_focus = []
    if weakest_day:
        monitoring_focus.append(f"重点复盘 {weakest_day['date']}，当日 TIR 为 {weakest_day['tir']}%。")
    monitoring_focus.append(f"当前主模式为“{summary.get('dominantPattern') or '关键波动模式'}”。")
    monitoring_focus.append("建议把时段画像、异常卡片和趋势预测一起展示，形成解释闭环。")

    product_opportunities = [
        "把餐后峰值识别做成主动提醒卡片。",
        "把未来 2 小时预测接入协作平台消息入口。",
        "把日级 pattern 与风险评分沉淀到表格或文档系统中。",
    ]

    return {
        "priorityActions": priority_actions[:3],
        "monitoringFocus": monitoring_focus[:3],
        "productOpportunities": product_opportunities,
    }
