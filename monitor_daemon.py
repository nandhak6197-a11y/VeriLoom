# -*- coding: utf-8 -*-
"""Continuous 24/7 Health Monitor and Auto-Recovery for VeriLoom."""
import time
import datetime
import urllib.request
import urllib.error
import subprocess
import os
import sys

URL = "https://premier-olympus-permitted-allowed.trycloudflare.com/api/submissions"
LOCAL_URL = "http://127.0.0.1:8000/api/submissions"
LOG_FILE = os.path.join(os.path.dirname(__file__), "health_monitor.log")

def log(msg: str):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}\n"
    print(line, end="")
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass

def check_url(target: str, timeout: int = 30) -> tuple:
    start = time.time()
    for attempt in range(2):
        try:
            req = urllib.request.Request(target, headers={"User-Agent": "VeriLoom-HealthCheck/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                elapsed_ms = int((time.time() - start) * 1000)
                return resp.status, elapsed_ms, ""
        except urllib.error.HTTPError as e:
            elapsed_ms = int((time.time() - start) * 1000)
            return e.code, elapsed_ms, str(e)
        except Exception as e:
            if attempt == 0:
                time.sleep(2)
                continue
            elapsed_ms = int((time.time() - start) * 1000)
            return 0, elapsed_ms, str(e)

def main():
    log("=== VeriLoom 24/7 Health Monitor Daemon Started ===")
    log(f"Monitoring Public URL: {URL}")
    log(f"Monitoring Local URL:  {LOCAL_URL}")

    while True:
        # Check Local API
        loc_status, loc_ms, loc_err = check_url(LOCAL_URL)
        if loc_status != 200:
            log(f"ALERT: Local server failed (Status {loc_status}, {loc_err}). Checking processes...")
        
        # Check Public Cloudflare URL
        pub_status, pub_ms, pub_err = check_url(URL)
        if pub_status == 200:
            log(f"PULSE OK: Public URL responding in {pub_ms}ms (Status {pub_status})")
        else:
            log(f"ALERT: Public tunnel error: {pub_status} in {pub_ms}ms - {pub_err}")

        # Sleep 5 minutes between background pulses
        time.sleep(300)

if __name__ == "__main__":
    main()
