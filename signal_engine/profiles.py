from collections import defaultdict

from .constants import MEAL_WINDOWS, SEVERE_HIGH, TARGET_MAX, WINDOWS
from .helpers import calc_tir, safe_mean, safe_std, status_for_window


def build_window_profiles(points):
    profiles = []

    for key, config in WINDOWS.items():
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
        tir = calc_tir(values)
        daily_patterns.append(
            {
                "date": date,
                "avg": safe_mean(values),
                "min": round(min(values), 1),
                "max": round(max(values), 1),
                "tir": tir,
                "rangeWidth": round(max(values) - min(values), 1),
                "label": "稳态" if tir >= 70 else "波动日",
            }
        )

    return daily_patterns[-7:]


def build_meal_signals(points):
    meal_signals = []

    for label, hours in MEAL_WINDOWS:
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
