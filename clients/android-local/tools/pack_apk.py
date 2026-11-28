#!/usr/bin/env python
# 把 base.apk (manifest/resources/assets) + classes.dex + jniLibs 合成一个 APK
# 关键点：lib/**.so 与 resources.arsc 必须以 ZIP_STORED（不压缩）写入，
#        否则 Android 6+ 无法直接 mmap，且 zipalign 无法对齐。
import argparse
import os
import zipfile

# .mp3 必须 store：AssetFileDescriptor 读压缩资产会有大小/偏移限制，
# Node 侧播放也走直接读取，压缩会导致 startOffset/len 出错。
STORED = {'.so', '.arsc', '.dex', '.mp3'}


def should_store(name: str) -> bool:
    if name == 'resources.arsc':
        return True
    return os.path.splitext(name)[1].lower() in STORED


def add(zout: zipfile.ZipFile, name: str, data: bytes):
    zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
    zi.external_attr = 0o644 << 16
    if should_store(name):
        zi.compress_type = zipfile.ZIP_STORED
    else:
        zi.compress_type = zipfile.ZIP_DEFLATED
    zout.writestr(zi, data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True)
    ap.add_argument('--dex', required=True)
    ap.add_argument('--libs', required=True, help='jniLibs/<abi> 目录')
    ap.add_argument('--assets', required=False, help='assets 源目录（aapt2 在 Windows 会把路径写成反斜杠，故自行打包）')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    abi = os.path.basename(os.path.normpath(a.libs))
    libdir = os.path.dirname(os.path.normpath(a.libs))

    with zipfile.ZipFile(a.base) as zin, zipfile.ZipFile(a.out, 'w') as zout:
        names = zin.namelist()
        # 顺序：manifest → resources.arsc → 其它资源/assets
        ordered = [n for n in ('AndroidManifest.xml', 'resources.arsc') if n in names]
        ordered += [n for n in names if n not in ordered]
        for n in ordered:
            add(zout, n, zin.read(n))

        with open(a.dex, 'rb') as f:
            add(zout, 'classes.dex', f.read())

        n_assets = 0
        if a.assets and os.path.isdir(a.assets):
            for root, _dirs, files in os.walk(a.assets):
                for fn in sorted(files):
                    p = os.path.join(root, fn)
                    rel = os.path.relpath(p, a.assets).replace('\\', '/')
                    with open(p, 'rb') as f:
                        add(zout, 'assets/' + rel, f.read())
                    n_assets += 1
        print('assets 文件数: %d' % n_assets)

        for fn in sorted(os.listdir(a.libs)):
            p = os.path.join(a.libs, fn)
            if os.path.isfile(p):
                with open(p, 'rb') as f:
                    add(zout, 'lib/%s/%s' % (abi, fn), f.read())

    print('wrote %s (%d bytes)' % (a.out, os.path.getsize(a.out)))
    with zipfile.ZipFile(a.out) as z:
        for i in z.infolist():
            if i.filename.startswith('lib/') or i.filename.endswith(('.dex', '.arsc')):
                print('  %-32s %10d store=%s' % (i.filename, i.file_size, i.compress_type == zipfile.ZIP_STORED))


if __name__ == '__main__':
    main()
