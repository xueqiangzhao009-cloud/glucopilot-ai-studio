import json
import math
import statistics
import sys
from collections import defaultdict
from datetime import datetime


TARGET_MIN = 3.9
TARGET_MAX = 10.0
SEVERE_LOW = 3.0
SEVERE_HIGH = 13.9


def parse_timestamp(value):
    if not value:
        return None

    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def safe_mean(values):
    valid = [value for value in values if not math.isnan(value)]
    return round(statistics.fmean(valid), 2) if valid else None


def safe_std(values):
    valid = [value for value in values if not math.isnan(value)]
    if len(valid) < 2:
        return 0.0
    return round(statistics.pstdev(valid), 2)


def calc_tir(values):
    valid = [value for value in values if not math.isnan(value)]
    if not valid:
        return 0.0
    in_range = sum(1 for value in valid if TARGET_MIN <= value <= TARGET_MAX)
    return round(in_range / len(valid) * 100, 1)


def status_for_window(avg_glucose):
    if avg_glucose is None:
        return "neutral"
    if avg_glucose < TARGET_MIN:
        return "warning"
    if avg_glucose > TARGET_MAX:
        return "danger"
    return "success"


def build_window_profiles(points):
    windows = {
        "overnight": {"label": "夜间恢复窗口", "hours": set(range(0, 6))},
        "morning": {"label": "晨间响应窗口", "hours": set(range(6, 12))},
        "afternoon": {"label": "午后稳定窗口", "hours": set(range(12, 18))},
        "evening": {"label": "晚间收敛窗口", "hours": set(range(18, 24))},
    }
    profiles = []

    for key, config in windows.items():
        values = [point["glucose"] for point in points if point["dt"].hour in config["hours"]]
        avg = safe_mean(values)
        profiles.append(
            {
                "key": key,
                "label": config["label"],
                "avg": avg,
                "min": round(min(values), 1) if values else None,
                "max": round(max(values), 1) if values else None,
                "cv": round((safe_std(values) / avg) * 100, 1) if values and avg else 0.0,
                "status": status_for_window(avg),
            }
        )

    return profiles


def build_daily_patterns(points):
    by_day = defaultdict(list)
    for point in points:
        by_day[point["dt"].date().isoformat()].append(point["glucose"])

    daily_patterns = []
    for date, values in sorted(by_day.items()):
        avg = safe_mean(values)
        daily_patterns.append(
            {
                "date": date,
                "avg": avg,
                "min": round(min(values), 1),
                "max": round(max(values), 1),
                "tir": calc_tir(values),
                "rangeWidth": round(max(values) - min(values), 1),
                "label": "稳态" if calc_tir(values) >= 70 else "波动日",
            }
        )

    return daily_patterns[-7:]


def build_meal_signals(points):
    meal_windows = [
        ("早餐后", range(7, 11)),
        ("午餐后", range(12, 16)),
        ("晚餐后", range(18, 22)),
    ]
    meal_signals = []
    for label, hours in meal_windows:
        values = [point["glucose"] for point in points if point["dt"].hour in hours]
        avg = safe_mean(values)
        peak = round(max(values), 1) if values else None
        status = "success"
        if peak is not None and peak > SEVERE_HIGH:
            status = "danger"
        elif peak is not None and peak > TARGET_MAX:
            status = "warning"

        if peak is None:
            insight = "暂无足够数据"
        elif peak > SEVERE_HIGH:
            insight = f"{label}峰值达到 {peak} mmol/L，存在明显餐后高峰。"
        elif peak > TARGET_MAX:
            insight = f"{label}峰值约 {peak} mmol/L，建议关注餐后回落速度。"
        else:
            insight = f"{label}峰值约 {peak} mmol/L，整体处于较可控区间。"

        meal_signals.append(
            {
                "label": label,
                "avg": avg,
                "peak": peak,
                "status": status,
                "insight": insight,
            }
        )

    return meal_signals


def detect_excursions(values, predicate):
    excursions = 0
    active = False
    for value in values:
        hit = predicate(value)
        if hit and not active:
            excursions += 1
            active = True
        elif not hit:
            active = False
    return excursions


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
                "evidence": f"CV {metrics.get('cv')}%，高于 36% 建议阈值。",
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
                "nextStep": "适合把餐后曲线、食物结构和响应动作做成智能提示闭环。",
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
            "nextStep": "适合做成 Agent 的主动提醒与复盘任务。",
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


def choose_storyline(metrics, anomalies):
    risk = "high" if to_float(metrics.get("tar")) > 25 or to_float(metrics.get("cv")) > 36 else "moderate"
    if any(item["id"] == "stability" for item in anomalies):
        risk = "low"

    if risk == "high":
        dominant = "高波动 + 高血糖暴露"
        narrative = "适合将作品定位为可主动发现异常、解释风险来源、联动建议动作的 AI 健康 Agent。"
    elif risk == "moderate":
        dominant = "局部时段波动"
        narrative = "适合将作品定位为能够识别关键时段、给出针对性追问与优化建议的智能助手。"
    else:
        dominant = "整体稳定但仍需持续观察"
        narrative = "适合将作品定位为长期追踪和个体化管理的可解释 AI 伴侣。"

    return risk, dominant, narrative


def build_suggested_questions(anomalies):
    defaults = [
        "这组数据最值得优先解释的风险是什么？",
        "如果我是产品评委，最能体现 AI 能力的亮点在哪里？",
        "基于这些曲线，我应该做哪三项功能迭代？",
    ]

    mapping = {
        "variability": "为什么这份数据的波动这么大？可能由哪些时段驱动？",
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


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    data = payload.get("data") or []
    metrics = payload.get("metrics") or {}

    points = []
    for item in data:
        dt = parse_timestamp(item.get("timestamp") or item.get("time") or item.get("date"))
        glucose = to_float(item.get("glucose"))
        if dt is None or math.isnan(glucose):
            continue
        points.append({"dt": dt, "glucose": round(glucose, 2)})

    points.sort(key=lambda item: item["dt"])
    values = [point["glucose"] for point in points]
    coverage_hours = round((points[-1]["dt"] - points[0]["dt"]).total_seconds() / 3600, 1) if len(points) > 1 else 0

    window_profiles = build_window_profiles(points)
    meal_signals = build_meal_signals(points)
    daily_patterns = build_daily_patterns(points)
    anomalies = build_anomalies(points, metrics, window_profiles, meal_signals)
    overall_risk, dominant_pattern, narrative = choose_storyline(metrics, anomalies)

    summary = {
        "overallRisk": overall_risk,
        "dominantPattern": dominant_pattern,
        "narrative": narrative,
        "coverageHours": coverage_hours,
        "meanGlucose": safe_mean(values),
        "samples": len(points),
        "estimatedDays": len({point["dt"].date().isoformat() for point in points}),
    }

    output = {
        "engine": "python-signal-engine",
        "generated": True,
        "summary": summary,
        "windowProfiles": window_profiles,
        "mealSignals": meal_signals,
        "dailyPatterns": daily_patterns,
        "anomalyCards": anomalies,
        "suggestedQuestions": build_suggested_questions(anomalies),
    }
    sys.stdout.write(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
