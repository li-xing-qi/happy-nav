#!/usr/bin/env python3
"""edge-tts 命令行包装：给万象和聊天室调用。

为什么单独写（2026-11-11）：
  edge-tts 是 Python 包，Node 那边调不了，只能起子进程。
  这个脚本被 Node 用 execFile 调，stdin 传 JSON，stdout 出 JSON。

输入（stdin）：
  {"text": "要念的话", "voice": "zh-CN-XiaoxiaoNeural", "rate": "+0%", "out": "/tmp/x.mp3"}

输出（stdout）：
  {"ok": true, "file": "/tmp/x.mp3", "bytes": 14976}
  或 {"ok": false, "error": "..."}

用法：
  echo '{"text":"你好","out":"/tmp/a.mp3"}' | python3 scripts/tts.py

支持的音色（常用）：
  zh-CN-XiaoxiaoNeural   女声，活泼（默认，最适合小鱼）
  zh-CN-YunxiNeural      男声，年轻
  zh-CN-XiaoyiNeural     女声，可爱
  zh-CN-YunjianNeural    男声，沉稳
  zh-CN-liaoning-XiaobeiNeural  东北话女声
"""
import asyncio
import json
import os
import sys

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
MAX_CHARS = 800          # 一次最多念这么多字，防止超时
TIMEOUT_SEC = 25


async def synth(text, voice, rate, out_path):
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate=rate)
    await asyncio.wait_for(comm.save(out_path), timeout=TIMEOUT_SEC)


def main():
    try:
        raw = sys.stdin.read()
        req = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"入参解析失败: {e}"}))
        return

    text = str(req.get("text") or "").strip()
    if not text:
        print(json.dumps({"ok": False, "error": "text 不能为空"}))
        return
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]

    voice = str(req.get("voice") or DEFAULT_VOICE)
    rate = str(req.get("rate") or "+0%")
    out_path = str(req.get("out") or "/tmp/tts-out.mp3")

    # 确保目录存在
    os.makedirs(os.path.dirname(out_path) or "/tmp", exist_ok=True)

    try:
        asyncio.run(synth(text, voice, rate, out_path))
    except asyncio.TimeoutError:
        print(json.dumps({"ok": False, "error": f"合成超时（>{TIMEOUT_SEC}秒）"}))
        return
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"合成失败: {str(e)[:200]}"}))
        return

    if not os.path.exists(out_path):
        print(json.dumps({"ok": False, "error": "合成后文件不存在"}))
        return

    print(json.dumps({
        "ok": True,
        "file": out_path,
        "bytes": os.path.getsize(out_path),
        "voice": voice,
        "chars": len(text),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
