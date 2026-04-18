from .helpers import to_float


def choose_storyline(metrics, anomalies):
    risk = "high" if to_float(metrics.get("tar")) > 25 or to_float(metrics.get("cv")) > 36 else "moderate"
    if any(item["id"] == "stability" for item in anomalies):
        risk = "low"

    if risk == "high":
        dominant = "高波动与高血糖暴露"
        narrative = "更适合做成能主动发现异常、解释风险来源并推动下一步动作的智能分析系统。"
    elif risk == "moderate":
        dominant = "局部时段波动"
        narrative = "更适合围绕关键时段识别、原因解释和追问交互来做产品表达。"
    else:
        dominant = "整体稳定但仍需持续观察"
        narrative = "更适合做成长周期追踪和个体化解释的智能管理工具。"

    return risk, dominant, narrative


def build_suggested_questions(anomalies):
    defaults = [
        "这组数据最值得优先解释的风险是什么？",
        "如果从产品角度看，最有价值的能力点在哪里？",
        "基于这些曲线，下一版功能应该先做什么？",
    ]

    mapping = {
        "variability": "为什么这份数据的波动这么大？主要由哪些时段驱动？",
        "dawn": "晨峰效应主要体现在哪些时间段？应该怎么解释？",
        "meal-spike": "哪一餐后的峰值最突出？怎样做成主动提醒功能？",
        "hypo": "低血糖风险更像出现在夜间还是活动后？",
    }

    questions = []
    for anomaly in anomalies:
        if anomaly["id"] in mapping and mapping[anomaly["id"]] not in questions:
            questions.append(mapping[anomaly["id"]])

    questions.extend(item for item in defaults if item not in questions)
    return questions[:4]
