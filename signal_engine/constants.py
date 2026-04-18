TARGET_MIN = 3.9
TARGET_MAX = 10.0
SEVERE_LOW = 3.0
SEVERE_HIGH = 13.9

WINDOWS = {
    "overnight": {"label": "夜间恢复窗口", "hours": set(range(0, 6))},
    "morning": {"label": "晨间响应窗口", "hours": set(range(6, 12))},
    "afternoon": {"label": "午后稳定窗口", "hours": set(range(12, 18))},
    "evening": {"label": "晚间收敛窗口", "hours": set(range(18, 24))},
}

MEAL_WINDOWS = [
    ("早餐后", range(7, 11)),
    ("午餐后", range(12, 16)),
    ("晚餐后", range(18, 22)),
]
