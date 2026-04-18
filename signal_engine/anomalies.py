from .constants import TARGET_MAX, TARGET_MIN
from .helpers import detect_excursions, to_float


def build_anomalies(points, metrics, window_profiles, meal_signals):
    values = [point["glucose"] for point in points]
    anomalies = []
    cv = to_float(metrics.get("cv"))
    tar = to_float(metrics.get("tar"))
    tbr = to_float(metrics.get("tbr"))
    tir = to_float(metrics.get("tir"))

    overnight = next((item for item in window_profiles if item["key"] == "overnight"), None)
    morning = next((item for item in window_profiles if item["key"] == "morning"), None)

    if cv > 36:
        anomalies.append(
            {
                "id": "variability",
                "title": "整体波动偏大",
                "severity": "high",
                "evidence": f"CV {metrics.get('cv')}%，高于 36% 参考阈值。",
                "nextStep": "优先排查餐后峰值和夜间波动来源。",
            }
        )

    if tar > 25:
        anomalies.append(
            {
                "id": "hyper",
                "title": "高血糖暴露时间偏长",
                "severity": "high",
                "evidence": f"TAR {metrics.get('tar')}%，提示较长时间处于目标范围上方。",
                "nextStep": "结合餐次、用药和活动记录查看高峰触发点。",
            }
        )

    if tbr >= 4:
        anomalies.append(
            {
                "id": "hypo",
                "title": "低血糖风险需要关注",
                "severity": "medium",
                "evidence": f"TBR {metrics.get('tbr')}%，已接近或超过建议上限。",
                "nextStep": "重点检查夜间与运动后时段。",
            }
        )

    if overnight and morning and overnight.get("avg") and morning.get("avg") and morning["avg"] - overnight["avg"] >= 1.5:
        anomalies.append(
            {
                "id": "dawn",
                "title": "疑似晨峰效应",
                "severity": "medium",
                "evidence": f"晨间均值较夜间高 {round(morning['avg'] - overnight['avg'], 1)} mmol/L。",
                "nextStep": "可在起床前后增加观察点，验证夜间到晨起的抬升路径。",
            }
        )

    meal_peak = max((signal["peak"] or 0) for signal in meal_signals) if meal_signals else 0
    if meal_peak > TARGET_MAX:
        anomalies.append(
            {
                "id": "meal-spike",
                "title": "餐后峰值明显",
                "severity": "medium",
                "evidence": f"最高餐后峰值达到 {meal_peak} mmol/L。",
                "nextStep": "适合把餐后曲线、饮食结构和响应动作做成智能提示闭环。",
            }
        )

    low_excursions = detect_excursions(values, lambda value: value < TARGET_MIN)
    high_excursions = detect_excursions(values, lambda value: value > TARGET_MAX)
    anomalies.append(
        {
            "id": "excursions",
            "title": "异常波段次数",
            "severity": "info",
            "evidence": f"检测到 {high_excursions} 次高血糖波段、{low_excursions} 次低血糖波段。",
            "nextStep": "适合做成系统的主动提醒与复盘任务。",
        }
    )

    if tir >= 70 and cv <= 36:
        anomalies.append(
            {
                "id": "stability",
                "title": "总体控制接近目标",
                "severity": "positive",
                "evidence": f"TIR {metrics.get('tir')}%，CV {metrics.get('cv')}%。",
                "nextStep": "可以把重点转向长期趋势追踪与解释性展示。",
            }
        )

    return anomalies[:6]
