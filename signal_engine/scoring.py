from .helpers import clamp, to_float


def _bounded_score(value):
    return round(clamp(value, 0, 100), 1)


def build_risk_scores(metrics, window_profiles, meal_signals, anomalies):
    cv = to_float(metrics.get("cv"))
    tar = to_float(metrics.get("tar"))
    tbr = to_float(metrics.get("tbr"))
    tir = to_float(metrics.get("tir"))
    peak = max((signal.get("peak") or 0) for signal in meal_signals) if meal_signals else 0
    overnight = next((item for item in window_profiles if item["key"] == "overnight"), None)
    morning = next((item for item in window_profiles if item["key"] == "morning"), None)
    dawn_gap = 0
    if overnight and morning and overnight.get("avg") and morning.get("avg"):
        dawn_gap = max(0, morning["avg"] - overnight["avg"])

    variability = _bounded_score(cv * 1.8 + max(0, peak - 10) * 5)
    hyper = _bounded_score(tar * 2.2 + max(0, peak - 10) * 6)
    hypo = _bounded_score(tbr * 12 + max(0, 70 - tir) * 0.4)
    rhythm = _bounded_score(30 + dawn_gap * 16 + len(anomalies) * 4)
    stability = _bounded_score(100 - max(variability, hyper, hypo) * 0.75)

    def to_band(score):
        if score >= 75:
            return "high"
        if score >= 45:
            return "medium"
        return "low"

    return {
        "variability": {"score": variability, "band": to_band(variability)},
        "hyperExposure": {"score": hyper, "band": to_band(hyper)},
        "hypoExposure": {"score": hypo, "band": to_band(hypo)},
        "circadianDrift": {"score": rhythm, "band": to_band(rhythm)},
        "stability": {"score": stability, "band": "high" if stability >= 70 else "medium" if stability >= 45 else "low"},
    }
