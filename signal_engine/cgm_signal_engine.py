import json
import math
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.append(str(Path(__file__).resolve().parent.parent))

from signal_engine.anomalies import build_anomalies
from signal_engine.helpers import parse_timestamp, safe_mean, to_float
from signal_engine.profiles import build_daily_patterns, build_meal_signals, build_window_profiles
from signal_engine.storyline import build_suggested_questions, choose_storyline
from signal_engine.workflow_blueprint import build_workflow_hints


def normalize_points(data):
    points = []
    for item in data:
        dt = parse_timestamp(item.get("timestamp") or item.get("time") or item.get("date"))
        glucose = to_float(item.get("glucose"))
        if dt is None or math.isnan(glucose):
            continue
        points.append({"dt": dt, "glucose": round(glucose, 2)})
    points.sort(key=lambda item: item["dt"])
    return points


def build_summary(points, metrics, anomalies):
    values = [point["glucose"] for point in points]
    overall_risk, dominant_pattern, narrative = choose_storyline(metrics, anomalies)
    coverage_hours = round((points[-1]["dt"] - points[0]["dt"]).total_seconds() / 3600, 1) if len(points) > 1 else 0

    return {
        "overallRisk": overall_risk,
        "dominantPattern": dominant_pattern,
        "narrative": narrative,
        "coverageHours": coverage_hours,
        "meanGlucose": safe_mean(values),
        "samples": len(points),
        "estimatedDays": len({point["dt"].date().isoformat() for point in points}),
    }


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    data = payload.get("data") or []
    metrics = payload.get("metrics") or {}

    points = normalize_points(data)
    window_profiles = build_window_profiles(points)
    meal_signals = build_meal_signals(points)
    daily_patterns = build_daily_patterns(points)
    anomalies = build_anomalies(points, metrics, window_profiles, meal_signals)
    summary = build_summary(points, metrics, anomalies)
    workflow_hints = build_workflow_hints(summary, anomalies)

    output = {
        "engine": "cgm-signal-engine",
        "generated": True,
        "summary": summary,
        "windowProfiles": window_profiles,
        "mealSignals": meal_signals,
        "dailyPatterns": daily_patterns,
        "anomalyCards": anomalies,
        "suggestedQuestions": build_suggested_questions(anomalies),
        "workflowHints": workflow_hints,
    }
    sys.stdout.write(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
