from datetime import timedelta

from .constants import TARGET_MAX, TARGET_MIN
from .helpers import clamp, safe_mean


def build_forecast(points, steps=8):
    if len(points) < 6:
        return {
            "trajectory": "insufficient-data",
            "confidence": "low",
            "summary": "数据点较少，暂时无法生成可靠的短时预测。",
            "points": [],
        }

    recent = points[-12:]
    values = [point["glucose"] for point in recent]
    deltas = [values[index] - values[index - 1] for index in range(1, len(values))]
    avg_delta = safe_mean(deltas) or 0
    base_interval = recent[-1]["dt"] - recent[-2]["dt"]
    interval = base_interval if base_interval.total_seconds() > 0 else timedelta(minutes=15)
    forecast_points = []
    current = values[-1]

    for step in range(1, steps + 1):
        drift_weight = min(1.0, step / 4)
        current = clamp(current + avg_delta * drift_weight, 2.8, 18.5)
        forecast_points.append(
            {
                "timestamp": (recent[-1]["dt"] + interval * step).isoformat(),
                "glucose": round(current, 1),
            }
        )

    avg_future = safe_mean([point["glucose"] for point in forecast_points]) or current
    if avg_future > TARGET_MAX:
        trajectory = "rising-risk"
        summary = "未来 2 小时整体仍偏高，适合提前触发高血糖观察与提醒。"
    elif avg_future < TARGET_MIN:
        trajectory = "falling-risk"
        summary = "未来 2 小时有进一步下探趋势，适合优先提示低血糖风险。"
    else:
        trajectory = "stable"
        summary = "未来 2 小时整体保持在相对可控区间，可作为稳态追踪参考。"

    confidence = "high" if len(points) >= 96 else "medium"

    return {
        "trajectory": trajectory,
        "confidence": confidence,
        "summary": summary,
        "points": forecast_points,
    }
