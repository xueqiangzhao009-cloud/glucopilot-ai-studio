import math
import statistics
from datetime import datetime

from .constants import TARGET_MAX, TARGET_MIN


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
