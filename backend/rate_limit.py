"""Lightweight in-memory rate limiter for sensitive endpoints (login).

Sliding window: tracks attempts per (ip, action) key. Resets entries older
than the window automatically on each call. Good enough for a single backend
process; if scaled horizontally, swap with Redis.
"""
from collections import defaultdict, deque
from time import monotonic
from fastapi import Request, HTTPException


class SlidingWindowLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._store: dict[str, deque] = defaultdict(deque)

    def hit(self, key: str) -> None:
        now = monotonic()
        bucket = self._store[key]
        # Drop entries older than window
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.max_attempts:
            retry = int(self.window - (now - bucket[0]))
            raise HTTPException(
                status_code=429,
                detail=f"Zbyt wiele prob. Sprobuj ponownie za {max(retry, 1)} sek.",
                headers={"Retry-After": str(max(retry, 1))},
            )
        bucket.append(now)


# 8 attempts per 60s window per (IP, action) - generous for typos but blocks brute force
login_limiter = SlidingWindowLimiter(max_attempts=8, window_seconds=60)


def check_login_rate(request: Request, action: str) -> None:
    # request.client may be None in tests
    ip = (request.client.host if request.client else "unknown") or "unknown"
    # Trust X-Forwarded-For only if we're behind a known proxy (we are, k8s ingress)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip() or ip
    login_limiter.hit(f"{ip}:{action}")
