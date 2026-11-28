package com.happynav.local;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

public class MainActivity extends Activity {

    private static final String TAG = "NodeSpike";
    private static final int PORT = 3000;
    private static final String ASSET_DIR = "nodejs-project";
    private static final String ASSET_VERSION = "1.1.0";

    private native void startNode(String scriptPath);

    private TextView statusView;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        statusView = new TextView(this);
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        statusView.setPadding(24, 24, 24, 24);
        statusView.setText("准备中…");
        root.addView(statusView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        webView = new WebView(this);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        webView.setWebViewClient(new WebViewClient());
        root.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);

        // 顺序不能反：nodejni 依赖 libnode.so 里的 node::Start 符号
        try {
            System.loadLibrary("node");
            Log.i(TAG, "libnode.so loaded");
            System.loadLibrary("nodejni");
            Log.i(TAG, "libnodejni.so loaded");
        } catch (Throwable t) {
            Log.e(TAG, "loadLibrary failed", t);
            setStatus("加载 native 库失败（ABI 需 arm64-v8a）: " + t);
            return;
        }

        final File projectDir = new File(getFilesDir(), ASSET_DIR);
        try {
            copyAssets(ASSET_DIR, projectDir);
        } catch (IOException e) {
            Log.e(TAG, "copy assets failed", e);
            setStatus("拷贝 assets 失败: " + e.getMessage());
            return;
        }

        final String script = new File(projectDir, "main.js").getAbsolutePath();
        setStatus("Node 启动中…  (" + script + ")");

        Thread nodeThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    startNode(script);
                } catch (Throwable t) {
                    Log.e(TAG, "startNode crashed", t);
                    postStatus("Node 崩溃: " + t);
                }
            }
        }, "node-main");
        nodeThread.start();

        Thread probeThread = new Thread(new Runnable() {
            @Override
            public void run() {
                for (int i = 0; i < 50; i++) {          // 50 * 200ms = 10s
                    if (probeServer()) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                setStatus("已连接 127.0.0.1:" + PORT);
                                webView.loadUrl("http://127.0.0.1:" + PORT + "/");
                            }
                        });
                        return;
                    }
                    try {
                        Thread.sleep(200);
                    } catch (InterruptedException ignored) {
                        return;
                    }
                }
                postStatus("连接失败：10 秒内 127.0.0.1:" + PORT + " 无响应");
            }
        }, "node-probe");
        probeThread.start();
    }

    private boolean probeServer() {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress("127.0.0.1", PORT), 300);
            return true;
        } catch (IOException e) {
            return false;
        } finally {
            try {
                s.close();
            } catch (IOException ignored) {
            }
        }
    }

    private void setStatus(String text) {
        Log.i(TAG, "status: " + text);
        statusView.setText(text);
    }

    private void postStatus(final String text) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                setStatus(text);
            }
        });
    }

    /** 递归拷贝 assets 目录；带版本标记，版本一致则跳过 */
    private void copyAssets(String assetPath, File destDir) throws IOException {
        File marker = new File(destDir, ".version");
        if (marker.isFile() && ASSET_VERSION.equals(readAll(marker))) {
            Log.i(TAG, "assets up-to-date, skip copy");
            return;
        }
        deleteRecursive(destDir);
        copyDir(assetPath, destDir);
        writeAll(marker, ASSET_VERSION);
    }

    private void copyDir(String assetPath, File destDir) throws IOException {
        String[] children = getAssets().list(assetPath);
        if (children == null || children.length == 0) {
            // 单个文件
            if (destDir.isDirectory()) {
                destDir = new File(destDir, new File(assetPath).getName());
            }
            copyFile(assetPath, destDir);
            return;
        }
        if (!destDir.exists() && !destDir.mkdirs()) {
            throw new IOException("mkdirs failed: " + destDir);
        }
        for (String child : children) {
            copyDir(assetPath + "/" + child, new File(destDir, child));
        }
    }

    private void copyFile(String assetPath, File dest) throws IOException {
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("mkdirs failed: " + parent);
        }
        InputStream in = getAssets().open(assetPath);
        OutputStream out = new FileOutputStream(dest);
        try {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
        } finally {
            try {
                in.close();
            } catch (IOException ignored) {
            }
            out.close();
        }
    }

    private String readAll(File f) {
        try {
            InputStream in = new java.io.FileInputStream(f);
            try {
                byte[] b = new byte[(int) f.length()];
                int n = in.read(b);
                return n > 0 ? new String(b, 0, n, "UTF-8").trim() : "";
            } finally {
                in.close();
            }
        } catch (IOException e) {
            return "";
        }
    }

    private void writeAll(File f, String text) throws IOException {
        OutputStream out = new FileOutputStream(f);
        try {
            out.write(text.getBytes("UTF-8"));
        } finally {
            out.close();
        }
    }

    private void deleteRecursive(File f) {
        File[] kids = f.listFiles();
        if (kids != null) {
            for (File k : kids) {
                deleteRecursive(k);
            }
        }
        f.delete();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
