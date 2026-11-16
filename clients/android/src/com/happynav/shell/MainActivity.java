package com.happynav.shell;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * 「与鱼」手机壳：一个不带广告、不带开屏的 WebView 容器。
 *
 * 它不做任何后端的事——页面、AI、记忆都在你自己的服务器上。
 * 这里只负责：记住地址、全屏打开、把「返回键 / 上传 / 下载 / 外链 / 权限」这些
 * 浏览器本来会做的事接好。
 *
 * 为什么不用 TWA（Bubblewrap）：TWA 依赖系统装有 Chrome，国产 ROM 很多没有，
 * 装上去直接打不开。系统自带 WebView 则一定有，哪怕版本旧一点。
 */
public class MainActivity extends Activity {

    private static final String PREFS = "shell";
    private static final String KEY_URL = "url";
    private static final String UA_SUFFIX = " HappyNavShell/1.0";
    private static final int REQ_FILE = 1001;
    private static final int REQ_AUDIO = 1002;

    private WebView web;
    private View gear;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingAudioRequest;
    private long lastBackAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(true);   // 方便 chrome://inspect 排查
        }
        CookieManager.getInstance().setAcceptCookie(true);

        String url = prefs().getString(KEY_URL, "");
        if (url == null || url.length() == 0) showSetup(null);
        else openSite(url);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    /* ---------------- 首次设置 / 改地址 ---------------- */

    /** @param current 传 null 表示首次进入；否则是「改地址」，输入框里预填当前值 */
    private void showSetup(String current) {
        final LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(28), dp(24), dp(8));

        TextView title = new TextView(this);
        title.setText(current == null ? "连上你的站点" : "修改地址");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        title.setTextColor(Color.parseColor("#243230"));
        box.addView(title);

        TextView tip = new TextView(this);
        tip.setText("填你自己那台的地址，例如 http://192.168.1.10:3000 或 https://yu.example.com\n"
                + "· 语音录制只在 https 地址下可用（浏览器安全限制）\n"
                + "· 这个 App 不连接任何第三方服务器，地址只存在本机");
        tip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        tip.setTextColor(Color.parseColor("#7C8F8C"));
        tip.setPadding(0, dp(8), 0, dp(14));
        box.addView(tip);

        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("http://192.168.1.10:3000");
        if (current != null) input.setText(current);
        box.addView(input);

        Button go = new Button(this);
        go.setText(current == null ? "进入" : "保存并重开");
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(16);
        box.addView(go, lp);

        final AlertDialog dialog = new AlertDialog.Builder(this)
                .setView(box)
                .setCancelable(current != null)
                .create();

        go.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                String u = normalize(input.getText().toString());
                if (u == null) {
                    input.setError("地址要形如 http://主机:端口 或 https://域名");
                    return;
                }
                prefs().edit().putString(KEY_URL, u).apply();
                dialog.dismiss();
                openSite(u);
            }
        });

        dialog.show();
        input.requestFocus();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        }
    }

    /** 补 scheme、去空格、校验；不合法返回 null */
    private static String normalize(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.length() == 0) return null;
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        try {
            Uri u = Uri.parse(s);
            if (u.getHost() == null || u.getHost().length() == 0) return null;
            if (!"http".equals(u.getScheme()) && !"https".equals(u.getScheme())) return null;
            return s;
        } catch (Exception e) {
            return null;
        }
    }

    /* ---------------- 主界面 ---------------- */

    private void openSite(String url) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F7F7F5"));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);   // 语音/TTS 不想每次点
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + UA_SUFFIX);

        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setBackgroundColor(Color.parseColor("#F7F7F5"));
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame()) showOffline(view.getUrl());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = cb;

                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                if (params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(i, "选择文件"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "找不到文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }

            /** 录音权限：https 页面的 getUserMedia 会走到这里 */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                boolean wantsAudio = false;
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsAudio = true;
                }
                if (!wantsAudio) { request.deny(); return; }
                /* WebView 给麦克风之前，App 自己得先有 RECORD_AUDIO。
                 * 没有就现要一次，用户同意后再放行——不要在启动时就弹权限框。 */
                if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                        == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    pendingAudioRequest = request;
                    requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, REQ_AUDIO);
                }
            }
        });

        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String contentDisposition,
                                        String mimeType, long contentLength) {
                try {
                    android.app.DownloadManager.Request r = new android.app.DownloadManager.Request(Uri.parse(url));
                    String name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType);
                    r.setMimeType(mimeType);
                    r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                    r.addRequestHeader("User-Agent", ua);
                    r.setNotificationVisibility(
                            android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    r.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, name);
                    android.app.DownloadManager dm =
                            (android.app.DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) dm.enqueue(r);
                    Toast.makeText(MainActivity.this, "开始下载：" + name, Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "下载失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        gear = buildGear();
        FrameLayout.LayoutParams glp = new FrameLayout.LayoutParams(dp(38), dp(38));
        glp.gravity = Gravity.BOTTOM | Gravity.END;
        glp.setMargins(0, 0, dp(8), dp(8));
        root.addView(gear, glp);

        setContentView(root);
        web.loadUrl(url);
    }

    /** 右下角那个小齿轮：刷新 / 改地址 / 清缓存 / 关于。半透明，不挡内容。 */
    private View buildGear() {
        TextView t = new TextView(this);
        t.setText("⚙");
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        t.setTextColor(Color.parseColor("#243230"));
        t.setGravity(Gravity.CENTER);
        t.setAlpha(0.38f);
        t.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showMenu(); }
        });
        return t;
    }

    private void showMenu() {
        final String[] items = {"刷新", "修改地址", "清空缓存并重载", "关于"};
        new AlertDialog.Builder(this)
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        if (which == 0) {
                            if (web != null) web.reload();
                        } else if (which == 1) {
                            showSetup(prefs().getString(KEY_URL, ""));
                        } else if (which == 2) {
                            if (web != null) {
                                web.clearCache(true);
                                web.clearFormData();
                                CookieManager.getInstance().removeAllCookies(null);
                                CookieManager.getInstance().flush();
                                web.reload();
                            }
                        } else {
                            new AlertDialog.Builder(MainActivity.this)
                                    .setTitle("与鱼 · 手机壳 1.0")
                                    .setMessage("这不是另一个网站，只是把你的站点装进一个干净的壳里："
                                            + "没有开屏广告、没有推荐流，地址只存在本机。\n\n"
                                            + "AI、记忆、聊天记录都在你自己那台服务器上，"
                                            + "手机丢了只需改个地址重装。\n\n"
                                            + "语音录制需要 https 地址；http 下页面会提示「这个环境不给录音」。")
                                    .setPositiveButton("知道了", null)
                                    .show();
                        }
                    }
                })
                .show();
    }

    /** 同域在壳里开，外链交给系统浏览器；非 http(s) 一律外抛 */
    private boolean handleUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null) return false;
        if (!scheme.equals("http") && !scheme.equals("https")) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
            return true;
        }
        String base = prefs().getString(KEY_URL, "");
        String baseHost = Uri.parse(base).getHost();
        String host = uri.getHost();
        if (host != null && baseHost != null && host.equalsIgnoreCase(baseHost)) return false;   // 壳内继续
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
        return true;
    }

    /** 连不上时不要白屏：给个能点的页面 */
    private void showOffline(String failedUrl) {
        if (web == null) return;
        String target = failedUrl == null ? prefs().getString(KEY_URL, "") : failedUrl;
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;font:15px/1.7 -apple-system,system-ui,sans-serif;"
                + "background:#F7F7F5;color:#243230;display:flex;align-items:center;justify-content:center;height:100vh'>"
                + "<div style='text-align:center;padding:24px'>"
                + "<div style='font-size:34px'>🐟</div>"
                + "<p style='margin:12px 0 4px;font-weight:600'>连不上服务器</p>"
                + "<p style='color:#7C8F8C;font-size:13px;margin:0 0 18px'>"
                + (target == null ? "" : target) + "</p>"
                + "<a href='" + target + "' style='display:inline-block;padding:10px 22px;border-radius:999px;"
                + "background:#4FA3A5;color:#fff;text-decoration:none'>重新连接</a>"
                + "<p style='color:#A9B6B4;font-size:12px;margin-top:20px'>"
                + "服务器开着吗？地址对吗？右下角 ⚙ 可以改地址</p>"
                + "</div></body>";
        web.loadDataWithBaseURL(target, html, "text/html", "utf-8", null);
    }

    /* ---------------- 生命周期 / 返回键 / 权限 ---------------- */

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        if (req == REQ_FILE) {
            if (fileCallback == null) return;
            Uri[] out = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    List<Uri> list = new ArrayList<Uri>();
                    for (int i = 0; i < n; i++) list.add(data.getClipData().getItemAt(i).getUri());
                    out = list.toArray(new Uri[0]);
                } else if (data.getData() != null) {
                    out = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(out);
            fileCallback = null;
            return;
        }
        super.onActivityResult(req, result, data);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        if (req == REQ_AUDIO) {
            PermissionRequest pr = pendingAudioRequest;
            pendingAudioRequest = null;
            if (pr == null) return;
            boolean granted = results.length > 0
                    && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
            if (granted) pr.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else {
                pr.deny();
                Toast.makeText(this, "没给麦克风权限，语音发不了（可以用「文件」发音频）", Toast.LENGTH_LONG).show();
            }
            return;
        }
        super.onRequestPermissionsResult(req, perms, results);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackAt < 2000) {
            super.onBackPressed();
        } else {
            lastBackAt = now;
            Toast.makeText(this, "再按一次退出", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_MENU) { showMenu(); return true; }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
