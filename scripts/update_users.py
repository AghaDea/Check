#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
اسکریپت به‌روزرسانی داده از LemeHost
هر ساعت توسط GitHub Actions اجرا می‌شود.
"""

import os
import re
import json
import time
import random
import hashlib
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import requests
from bs4 import BeautifulSoup
import ddddocr

# ==================== تنظیمات ====================
EMAIL = os.environ.get("LEME_EMAIL", "").strip()
PASSWORD = os.environ.get("LEME_PASSWORD", "").strip()

BASE_URL = "https://lemehost.com"
OUTPUT_FILE = "data/users.json"

# لینک نمونه شما (پارامترهای دینامیک مثل c= و _pjax حذف می‌شوند)
# فقط directory و file مهم هستند
TARGET_DIRECTORY = "/.config/unity3d/MA/LAC"
TARGET_FILE = "ServerConfig.txt"
SERVER_ID = "10265022"   # ← اگر سرور دیگری دارید اینجا عوض کنید

# حداکثر تلاش برای لاگین
MAX_LOGIN_ATTEMPTS = 20

# ==================== ابزارها ====================
session = requests.Session()
session.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
})

ocr = ddddocr.DdddOcr(show_ad=False)


def log(msg: str):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


def clean_view_url(directory: str, filename: str, server_id: str) -> str:
    """ساخت لینک تمیز برای مشاهده فایل"""
    params = {
        "action": "view_file",
        "directory": directory,
        "file": filename,
    }
    query = urlencode(params)
    return f"{BASE_URL}/server/{server_id}/files?{query}"


def get_captcha_image(soup: BeautifulSoup) -> bytes | None:
    """تلاش برای پیدا کردن و دانلود تصویر کپچا"""
    # چند سلکتور رایج
    selectors = [
        "img[src*='captcha']",
        "img.captcha",
        "#captcha-image",
        "img[alt*='captcha' i]",
        ".captcha img",
        "img[src*='site/captcha']",
    ]
    for sel in selectors:
        img = soup.select_one(sel)
        if img and img.get("src"):
            src = img["src"]
            if not src.startswith("http"):
                src = BASE_URL + src if src.startswith("/") else BASE_URL + "/" + src
            try:
                r = session.get(src, timeout=15)
                if r.status_code == 200 and len(r.content) > 100:
                    return r.content
            except Exception:
                pass
    return None


def login() -> bool:
    if not EMAIL or not PASSWORD:
        log("❌ LEME_EMAIL یا LEME_PASSWORD تنظیم نشده است")
        return False

    log("شروع فرآیند ورود...")

    for attempt in range(1, MAX_LOGIN_ATTEMPTS + 1):
        try:
            log(f"تلاش ورود {attempt}/{MAX_LOGIN_ATTEMPTS}")

            # صفحه لاگین
            r = session.get(f"{BASE_URL}/site/login", timeout=25)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "lxml")

            # کپچا
            captcha_bytes = get_captcha_image(soup)
            if not captcha_bytes:
                log("  تصویر کپچا پیدا نشد، صبر و تلاش مجدد...")
                time.sleep(random.uniform(2, 4))
                continue

            captcha_text = ocr.classification(captcha_bytes)
            captcha_text = re.sub(r"[^a-zA-Z0-9]", "", captcha_text).strip()
            log(f"  کپچا تشخیص داده شد: {captcha_text}")

            if len(captcha_text) < 3:
                log("  کپچا خیلی کوتاه است، تلاش مجدد")
                time.sleep(1)
                continue

            # پیدا کردن CSRF و فیلدها
            csrf_input = soup.select_one("input[name='_csrf']") or soup.select_one("input[name='csrf']")
            csrf = csrf_input["value"] if csrf_input else ""

            # فیلدهای رایج فرم لاگین LemeHost
            payload = {
                "LoginForm[email]": EMAIL,
                "LoginForm[password]": PASSWORD,
                "LoginForm[captcha]": captcha_text,
                "LoginForm[rememberMe]": "0",
                "_csrf": csrf,
            }

            # گاهی نام فیلدها متفاوت است
            if not soup.select_one("input[name='LoginForm[email]']"):
                # fallback
                payload = {
                    "email": EMAIL,
                    "password": PASSWORD,
                    "captcha": captcha_text,
                    "_csrf": csrf,
                }

            post = session.post(
                f"{BASE_URL}/site/login",
                data=payload,
                timeout=25,
                allow_redirects=True,
            )

            # بررسی موفقیت لاگین
            text_lower = post.text.lower()
            if any(x in text_lower for x in ["logout", "خروج", "server/index", "my servers", "dashboard"]):
                log("✅ ورود موفق!")
                return True

            if "captcha" in text_lower and ("incorrect" in text_lower or "wrong" in text_lower or "اشتباه" in text_lower):
                log("  کپچا اشتباه بود")
            else:
                log("  ورود ناموفق (احتمالاً رمز یا ساختار صفحه تغییر کرده)")

            time.sleep(random.uniform(2.5, 5.0))

        except Exception as e:
            log(f"  خطا: {e}")
            time.sleep(random.uniform(2, 4))

    log("❌ ورود بعد از تمام تلاش‌ها ناموفق بود")
    return False


def fetch_file_content() -> str | None:
    """دانلود محتوای فایل هدف"""
    url = clean_view_url(TARGET_DIRECTORY, TARGET_FILE, SERVER_ID)
    log(f"درخواست فایل: {url}")

    try:
        r = session.get(url, timeout=30)
        r.raise_for_status()

        # گاهی محتوا داخل <pre> یا textarea یا div خاص است
        soup = BeautifulSoup(r.text, "lxml")

        # اولویت ۱: تگ pre (رایج در فایل‌منیجرها)
        pre = soup.select_one("pre")
        if pre and pre.get_text(strip=True):
            content = pre.get_text()
            log(f"محتوا از <pre> گرفته شد ({len(content)} کاراکتر)")
            return content

        # اولویت ۲: textarea
        textarea = soup.select_one("textarea")
        if textarea and textarea.get_text(strip=True):
            content = textarea.get_text()
            log(f"محتوا از <textarea> گرفته شد ({len(content)} کاراکتر)")
            return content

        # اولویت ۳: اگر پاسخ خام متنی باشد
        content_type = r.headers.get("Content-Type", "")
        if "text/plain" in content_type or "octet-stream" in content_type:
            log("پاسخ به صورت متن خام دریافت شد")
            return r.text

        # اولویت ۴: تلاش برای پیدا کردن بلوک اصلی محتوا
        content_div = soup.select_one("#file-content, .file-content, .file-view, #content")
        if content_div:
            content = content_div.get_text()
            if len(content) > 20:
                log(f"محتوا از div محتوا گرفته شد ({len(content)} کاراکتر)")
                return content

        # اگر هیچکدام نبود، کل متن صفحه را برمی‌گردانیم (برای دیباگ)
        log("⚠️ ساختار صفحه فایل ناشناخته است – کل HTML ذخیره می‌شود")
        return r.text

    except Exception as e:
        log(f"خطا در دریافت فایل: {e}")
        return None


def parse_users_from_content(content: str) -> list:
    """
    تلاش برای استخراج لیست کاربران از محتوای فایل.
    این بخش را باید بر اساس فرمت واقعی ServerConfig.txt خودتان تنظیم کنید.
    فعلاً یک پارس ساده برای فایل‌های متنی رایج می‌کند.
    """
    users = []

    # مثال ۱: اگر فایل JSON باشد
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "users" in data:
            return data["users"]
    except Exception:
        pass

    # مثال ۲: خطوط ساده مثل name=xxx یا name:xxx
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue

        # الگوهای رایج
        m = re.search(r"(?:name|player|user|nick)\s*[=:]\s*(.+)", line, re.I)
        if m:
            users.append({"name": m.group(1).strip(), "raw": line})

    # اگر هیچ کاربری پیدا نشد، کل محتوا را به عنوان یک رکورد نگه می‌داریم
    if not users and content.strip():
        users.append({
            "name": "(محتوای فایل)",
            "raw": content[:2000]  # محدود کردن طول
        })

    return users


def save_data(content: str, users: list):
    os.makedirs("data", exist_ok=True)

    payload = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "source_file": TARGET_FILE,
        "directory": TARGET_DIRECTORY,
        "server_id": SERVER_ID,
        "status": "ok",
        "content_length": len(content),
        "users": users,
        "raw_content": content[:50000],  # جلوگیری از فایل خیلی بزرگ
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    log(f"✅ داده در {OUTPUT_FILE} ذخیره شد | کاربران: {len(users)}")


def main():
    log("=" * 50)
    log("شروع به‌روزرسانی داده LemeHost")

    if not login():
        # حتی در صورت شکست لاگین، یک فایل خطا می‌نویسیم تا مشخص باشد
        save_data("", [{"name": "خطا در ورود", "raw": "Login failed"}])
        return

    content = fetch_file_content()
    if content is None:
        save_data("", [{"name": "خطا در دریافت فایل", "raw": "Download failed"}])
        return

    users = parse_users_from_content(content)
    save_data(content, users)
    log("پایان موفق")


if __name__ == "__main__":
    main()
