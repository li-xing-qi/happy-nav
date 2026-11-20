#!/usr/bin/env python3
"""与鱼语音转写：本地 whisper.cpp（pywhispercpp），不联网、不调任何 API。

用法：
    stt.py <音频文件>
输出：
    一行中文（识别不出来就是空行），错误写 stderr，退出码非 0

两个坑：
  1. whisper.cpp 底层是 C++ 直接 printf，日志全进 **stdout**，
     会和识别结果混在一起。所以跑模型那段把 fd 1 临时接到 fd 2 上，
     结果留到恢复之后再 print。
  2. 手机录的是 m4a（AAC in MP4），whisper.cpp 只吃 16kHz 单声道 PCM，
     先过一遍 ffmpeg，顺带把 webm/ogg/mp3 都统一掉。
"""
import os
import subprocess
import sys
import tempfile

MODEL = os.environ.get('YU_STT_MODEL', '/root/models/ggml-base.bin')
THREADS = int(os.environ.get('YU_STT_THREADS', '2'))
# 给模型一点语境，中文标点和口语化结果会稳定一些
PROMPT = os.environ.get('YU_STT_PROMPT', '以下是普通话日常对话。')


def to_wav(src):
    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    tmp.close()
    try:
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-i', src,
             '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', tmp.name],
            check=True, timeout=60,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
    except Exception:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise
    return tmp.name


def transcribe(wav):
    """跑模型。期间 stdout 指向 stderr，避免 C++ 日志污染结果。"""
    sys.stdout.flush()
    saved = os.dup(1)
    os.dup2(2, 1)
    try:
        from pywhispercpp.model import Model

        model = Model(
            MODEL,
            n_threads=THREADS,
            language='zh',
            print_realtime=False,
            print_progress=False,
            print_timestamps=False,
        )
        try:
            segs = model.transcribe(wav, language='zh', initial_prompt=PROMPT)
        except TypeError:
            segs = model.transcribe(wav, language='zh')
        return ''.join(getattr(s, 'text', '') for s in segs)
    finally:
        sys.stdout.flush()
        os.dup2(saved, 1)
        os.close(saved)


def main():
    if len(sys.argv) < 2:
        print('用法：stt.py <音频文件>', file=sys.stderr)
        return 2
    src = sys.argv[1]
    if not os.path.exists(src):
        print('文件不存在：' + src, file=sys.stderr)
        return 2
    if not os.path.exists(MODEL):
        print('模型不存在：' + MODEL, file=sys.stderr)
        return 3

    try:
        wav = to_wav(src)
    except Exception as e:
        print('转码失败：%s' % e, file=sys.stderr)
        return 4

    try:
        text = transcribe(wav)
    except Exception as e:
        print('转写失败：%s' % e, file=sys.stderr)
        return 5
    finally:
        try:
            os.unlink(wav)
        except OSError:
            pass

    # 中文里 whisper 有时会用空格断词，去掉更好读；英文单词之间本来有空格，保留不做处理
    text = text.strip()
    if text and all(ord(c) > 127 or c in '，。！？、；：""''（）…—' for c in text if not c.isspace()):
        text = ''.join(text.split())
    print(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
