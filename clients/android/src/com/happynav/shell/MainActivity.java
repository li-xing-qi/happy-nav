package com.happynav.shell;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
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
    private static final String UA_SUFFIX = " HappyNavShell/1.3";
    private static final int REQ_FILE = 1001;
    private static final int REQ_AUDIO = 1002;
    private static final int REQ_NOTIF = 1003;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingAudioRequest;
    private long lastBackAt = 0L;
    /** 长按返回键已唤出改地址对话框时，把随后的 onKeyUp 消费掉，避免又走一次默认返回 */
    private boolean backLongHandled = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(true);   // 方便 chrome://inspect 排查
        }
        CookieManager.getInstance().setAcceptCookie(true);

        String url = prefs().getString(KEY_URL, "");
        if (url == null || url.length() == 0) showSetup(null);
        else if (wantsYu(getIntent())) openSite(yuUrl(url));   // 从通知点进来
        else openSite(url);
    }

    /** 通知带过来的意图：要直接进与鱼页（且得知道房间号） */
    private boolean wantsYu(Intent it) {
        if (it == null || !it.getBooleanExtra("openYu", false)) return false;
        String room = prefs().getString("roomCode", "");
        return room != null && room.length() > 0;
    }

    /** 把站点地址拼成「与鱼」页地址；地址栏里带了路径也只取根，免得拼出双斜杠 */
    private String yuUrl(String base) {
        String room = prefs().getString("roomCode", "");
        if (room == null || room.isEmpty()) return base;
        String root = base;
        try {
            Uri u = Uri.parse(base);
            if (u.getScheme() != null && u.getHost() != null) {
                root = u.getScheme() + "://" + u.getHost()
                        + (u.getPort() > 0 ? ":" + u.getPort() : "");
            }
        } catch (Exception ignored) { }
        return root + "/yu?room=" + Uri.encode(room);
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
        /* 改地址是整界面重建：先把旧 WebView 从视图树上摘下来销毁，
         * 否则连改几次地址会一层层累积 WebView（各自还占着 Cookie/缓存）。 */
        if (web != null) {
            if (web.getParent() instanceof ViewGroup) {
                ((ViewGroup) web.getParent()).removeView(web);
            }
            web.destroy();
            web = null;
        }
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

        /* 唯一的网页→原生通道。只暴露「守哪个房间」，见 JsBridge 的注释 */
        web.addJavascriptInterface(new JsBridge(), "HappyNav");

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

            /** 4xx/5xx 不走 onReceivedError：只认主框架，别让一张挂掉的图片把整页换成错误页 */
            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest req,
                                            WebResourceResponse err) {
                if (req != null && req.isForMainFrame() && err != null
                        && err.getStatusCode() >= 400) {
                    showOffline(view.getUrl());
                }
            }

            /** 证书不对就别硬连：取消加载，给错误页（里面有改地址入口） */
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError err) {
                if (handler != null) handler.cancel();
                showOffline(view.getUrl());
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

        setContentView(root);
        web.loadUrl(url);
    }

    /**
     * 网页 → 原生的唯一通道，只暴露一个方法：告诉通知服务守哪个房间。
     *
     * 权限边界：即使页面被换成别的站，能做的也只有「启停一个只读订阅」——
     * 碰不到文件、Cookie、也发不出消息。所以这里不用再做来源校验。
     */
    private class JsBridge {
        @JavascriptInterface
        public void watchRoom(final String code, final String pid, final int since) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (code == null || code.isEmpty()) return;
                    prefs().edit()
                            .putString("roomCode", code)
                            .putString("roomPid", pid == null ? "" : pid)
                            .apply();
                    askNotifyPermission();
                    NotifyService.start(MainActivity.this, code, pid, since);
                }
            });
        }
    }

    /**
     * 通知权限（Android 13 起是运行时的，不申请一条都弹不出来）。
     * 只在「第一次真的要守房间」时问，不在启动时打断首屏；
     * 问过被拒就不再重复弹系统框，改成提示去设置里开。
     */
    private void askNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                == android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        if (prefs().getBoolean("notifAsked", false)) {
            Toast.makeText(this, "通知权限没开，去系统设置里允许「与鱼」发通知", Toast.LENGTH_LONG).show();
            return;
        }
        prefs().edit().putBoolean("notifAsked", true).apply();
        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
    }

    /** singleTask：点通知时 Activity 还活着就走这里，不重载页面，只在不是与鱼页时跳过去 */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (!wantsYu(intent) || web == null) return;
        String cur = web.getUrl();
        if (cur == null || cur.indexOf("/yu") < 0) {
            String base = prefs().getString(KEY_URL, "");
            if (base != null && !base.isEmpty()) web.loadUrl(yuUrl(base));
        }
    }

    /**
     * 清掉 WebView 缓存、表单数据和全部 Cookie，然后重载当前页。
     * 原浮层菜单里的第 3 项，现在由网页「连接」tab 的 happynav://clear-cache 触发。
     */
    private void clearCacheAndReload() {
        if (web == null) return;
        web.clearCache(true);
        web.clearFormData();
        /* 等 Cookie 真的清完再重载：紧跟着同步重载会把旧 Cookie 又带上去。
         * 整个方法只重载一次，就在下面这个回调里。 */
        CookieManager.getInstance().removeAllCookies(new ValueCallback<Boolean>() {
            @Override public void onReceiveValue(Boolean ok) {
                if (web == null) return;
                web.post(new Runnable() {
                    @Override public void run() {
                        if (web != null) web.reload();
                    }
                });
            }
        });
        CookieManager.getInstance().flush();
    }

    /** 同域在壳里开，外链交给系统浏览器；非 http(s) 一律外抛 */
    private boolean handleUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null) return false;
        /* 网页「连接」tab 和错误页都靠这三个 scheme 叫起壳的能力：
         *   happynav://settings     改地址（错误页里的按钮，必须保留）
         *   happynav://reload       刷新
         *   happynav://clear-cache  清缓存 / 表单 / Cookie 后重载
         * 关于那段说明是静态文字，直接放在网页的「连接」tab 里，不需要 scheme。 */
        if ("happynav".equals(scheme)) {
            String host = uri.getHost();
            if ("settings".equals(host)) showSetup(prefs().getString(KEY_URL, ""));
            else if ("reload".equals(host) && web != null) web.reload();
            else if ("clear-cache".equals(host)) clearCacheAndReload();
            return true;
        }
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
                + "<div style='margin-top:10px'>"
                + "<a href='happynav://settings' style='display:inline-block;padding:9px 20px;border-radius:999px;"
                + "border:1px solid #C9D6D3;color:#243230;text-decoration:none;font-size:14px'>地址填错了？改地址</a>"
                + "</div>"
                + "<p style='color:#A9B6B4;font-size:12px;margin-top:20px'>"
                + "服务器开着吗？地址填错了点上面的「改地址」，或长按返回键也能改地址</p>"
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
        if (req == REQ_NOTIF) {
            boolean granted = results.length > 0
                    && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
            if (!granted) {
                Toast.makeText(this, "没给通知权限，退出应用后收不到她的消息",
                        Toast.LENGTH_LONG).show();
            }
            return;
        }
        super.onRequestPermissionsResult(req, perms, results);
    }

    /**
     * 白屏时的终极恢复入口：长按返回键唤出改地址。
     * 页面返回 200 但不是与鱼页、或 JS 挂掉白屏时，onReceivedError/HttpError/SslError
     * 都不会触发，错误页和网页设置面板都不存在，这个原生手势是最后一条出路。
     *
     * 短按与两连按退出完全走系统默认（onBackPressed 与 1.2 逐字一致），不受影响；
     * 长按后系统仍会派发一次 onKeyUp，用 backLongHandled 把那一次消费掉，
     * 否则弹完对话框又会再执行一次返回。
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) event.startTracking();
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            backLongHandled = true;
            showSetup(prefs().getString(KEY_URL, ""));
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && backLongHandled) {
            backLongHandled = false;
            return true;   // 消费，别再走默认返回
        }
        return super.onKeyUp(keyCode, event);
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
    protected void onPause() {
        NotifyService.foreground = false;   // 界面不可见了，她的消息可以弹
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        NotifyService.foreground = true;    // 正在看，就别弹通知了
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
