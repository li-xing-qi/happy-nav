package com.happynav.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.IBinder;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * 退到后台以后，替网页守着「与鱼」那个房间，她说话就弹通知。
 *
 * 为什么要有这个：网页的 SSE 跑在 WebView 里，App 一退到后台，WebView 被系统挂起，
 * 连接就断了——所以退出去以后永远收不到消息。要「像微信那样」，必须有一个
 * 独立于界面的东西把连接握住，这个东西就是前台服务。
 *
 * 它订阅的是同一条流，但加了 bg=1（服务端的只读模式）：不校验 pid、不参与在线状态、
 * 不推 peer。所以它不会把用户顶成两个人，也不会让「在线」状态一直亮着。
 *
 * 只订阅、不发送——发消息仍然走页面，这里不碰任何上传。
 */
public class NotifyService extends Service {

    private static final String TAG = "YuNotify";

    private static final String CH_MSG = "yu_msg";
    private static final String CH_IDLE = "yu_idle";
    private static final int ID_IDLE = 9001;
    private static final int ID_MSG = 9002;

    static final String ACTION_START = "com.happynav.shell.notify.START";
    static final String ACTION_STOP = "com.happynav.shell.notify.STOP";
    static final String EXTRA_CODE = "code";
    static final String EXTRA_PID = "pid";
    /** 页面已经收到的最后一条 id。服务从这里往后接，避免刚启动那一下正好漏掉她的回复 */
    static final String EXTRA_SINCE = "since";

    /** 页面在前台就别弹——她说话你正看着，弹出来是打扰。由 MainActivity 维护 */
    static volatile boolean foreground = false;

    private volatile boolean running = false;
    private Thread worker;
    /** 当前那条连接。onDestroy 时要主动 disconnect，否则线程卡在 readLine 上退不出来 */
    private volatile HttpURLConnection current;
    private String code = "";
    private String pid = "";
    private long lastId = 0;
    private int unread = 0;
    private int backoff = 3000;

    /* ---------------- 给外面用的入口 ---------------- */

    static void start(Context ctx, String code, String pid, int since) {
        if (code == null || code.isEmpty()) return;
        Intent i = new Intent(ctx, NotifyService.class)
                .setAction(ACTION_START)
                .putExtra(EXTRA_CODE, code)
                .putExtra(EXTRA_PID, pid == null ? "" : pid)
                .putExtra(EXTRA_SINCE, since);
        try {
            ctx.startForegroundService(i);
        } catch (Exception e) {
            Log.w(TAG, "起不来：" + e);
        }
    }

    static void stop(Context ctx) {
        try {
            ctx.startService(new Intent(ctx, NotifyService.class).setAction(ACTION_STOP));
        } catch (Exception ignored) {
        }
    }

    private SharedPreferences sp() {
        return getSharedPreferences("shell", Context.MODE_PRIVATE);
    }

    /* ---------------- 生命周期 ---------------- */

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String act = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(act)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        String c = intent == null ? null : intent.getStringExtra(EXTRA_CODE);
        String p = intent == null ? null : intent.getStringExtra(EXTRA_PID);
        int since = intent == null ? 0 : intent.getIntExtra(EXTRA_SINCE, 0);
        if (c == null || c.isEmpty()) {
            c = sp().getString("roomCode", "");
            p = sp().getString("roomPid", "");
        }
        if (c == null || c.isEmpty()) {
            /* 还没进过与鱼页，没房间可守。先把前台通知撤掉再退，别留一条僵尸通知 */
            startForeground(ID_IDLE, idleNotification(""));   // 先满足 5 秒规则
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        /* 系统可能因为被杀而用 null intent 重启服务，这时沿用上次的进度 */
        boolean sameRoom = c.equals(code);
        code = c;
        if (p != null && !p.isEmpty()) pid = p;
        if (!sameRoom) {
            /* 两边的进度取大的那个：页面可能已经看到更后面（它一直是活的），
             * 服务也可能因为被杀过而落后。取大的就不会把看过的再弹一遍。 */
            lastId = Math.max(sp().getLong("lastId_" + code, 0L), since);
            unread = 0;
        } else if (since > lastId) {
            lastId = since;
        }

        startForeground(ID_IDLE, idleNotification(code));

        if (sameRoom && worker != null && worker.isAlive()) return START_STICKY;

        running = false;
        if (worker != null) worker.interrupt();
        running = true;
        worker = new Thread(new Runnable() {
            @Override
            public void run() {
                loop();
            }
        }, "yu-notify");
        worker.setDaemon(true);
        worker.start();

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        HttpURLConnection c = current;
        current = null;
        if (c != null) {
            try { c.disconnect(); } catch (Exception ignored) { }
        }
        if (worker != null) worker.interrupt();
        worker = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        /* 从最近任务里划掉不该断——用户要的是「退出应用也能收」 */
        super.onTaskRemoved(rootIntent);
    }

    /* ---------------- 订阅 ---------------- */

    private void loop() {
        while (running) {
            HttpURLConnection conn = null;
            try {
                String base = baseUrl();
                if (base == null) throw new IOException("还没有站点地址");

                String url = base + "/api/yu/stream?code=" + enc(code) + "&bg=1&since=" + lastId;
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestProperty("Accept", "text/event-stream");
                conn.setRequestProperty("Cache-Control", "no-cache");
                conn.setConnectTimeout(12000);
                /* 服务端每 20 秒发一个 ": ping"，70 秒内连一个字节都没有，
                 * 说明这条连接已经死了（easytier 掉了、NAT 超时）——
                 * 主动超时断开重连，比无限期挂在 readLine 上强。 */
                conn.setReadTimeout(70000);
                conn.setUseCaches(false);
                current = conn;

                int rc = conn.getResponseCode();
                if (rc != 200) throw new IOException("HTTP " + rc);

                backoff = 3000;                  // 连上了就把退避重置
                readStream(conn);

            } catch (Exception e) {
                Log.w(TAG, "断开：" + e);
            } finally {
                if (current == conn) current = null;
                if (conn != null) conn.disconnect();
            }

            if (!running) break;
            try {
                Thread.sleep(backoff);
            } catch (InterruptedException e) {
                break;
            }
            /* 一次失败可能是网络抖，连续失败就慢慢退：3s → 6s → 12s … 最多 60s。
             * easytier 断线重连往往要十几秒，退避太急反而一直撞墙。 */
            backoff = Math.min(backoff * 2, 60000);
        }
    }

    private void readStream(HttpURLConnection conn) throws IOException {
        BufferedReader br = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), "UTF-8"));
        String event = null;
        StringBuilder data = new StringBuilder();
        String line;
        while (running && (line = br.readLine()) != null) {
            if (line.isEmpty()) {
                if (event != null && data.length() > 0) handle(event, data.toString());
                event = null;
                data.setLength(0);
            } else if (line.startsWith("event:")) {
                event = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
                if (data.length() > 0) data.append('\n');
                data.append(line.substring(5).trim());
            }
            /* 其它行是 ": ping" 之类的注释，直接忽略 */
        }
    }

    private void handle(String event, String json) {
        if ("hello".equals(event)) return;
        if (!"msgs".equals(event) && !"sync".equals(event)) return;
        try {
            JSONObject o = new JSONObject(json);
            org.json.JSONArray arr = o.optJSONArray("msgs");
            if (arr == null) return;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject m = arr.optJSONObject(i);
                if (m != null) consider(m);
            }
        } catch (Exception e) {
            Log.w(TAG, "解析失败：" + e);
        }
    }

    private void consider(JSONObject m) {
        long id = m.optLong("id", 0);
        if (id > 0 && id > lastId) {
            lastId = id;
            sp().edit().putLong("lastId_" + code, lastId).apply();
        }
        if ("sys".equals(m.optString("type"))) return;
        /* 自己发的不弹：不然你发一句退出去，自己先收到一条通知 */
        if (!pid.isEmpty() && pid.equals(m.optString("pid", ""))) return;
        if (foreground) return;

        String body = preview(m);
        if (body == null) return;
        body = body.replace('\n', ' ').trim();
        if (body.isEmpty()) return;
        if (body.length() > 120) body = body.substring(0, 120) + "…";

        unread++;
        notifyMsg(m.optString("name", "她"), body, m.optLong("at", System.currentTimeMillis()));
    }

    /** 通知栏里显示什么。图片/语音没有文字，给个占位，别弹一条空白 */
    private String preview(JSONObject m) {
        String t = m.optString("type", "text");
        if ("text".equals(t)) return m.optString("text", "");
        if ("voice".equals(t)) return "[语音]";
        if ("img".equals(t) || "sticker".equals(t)) return "[图片]";
        if ("emoji".equals(t)) return m.optString("emoji", "[表情]");
        if ("file".equals(t)) return "[文件] " + m.optString("fileName", "");
        return null;
    }

    /* ---------------- 通知 ---------------- */

    private void ensureChannels() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel msg = new NotificationChannel(
                CH_MSG, "她的消息", NotificationManager.IMPORTANCE_HIGH);
        msg.setDescription("她说话时提醒你");
        msg.enableVibration(true);
        msg.setShowBadge(true);
        nm.createNotificationChannel(msg);

        NotificationChannel idle = new NotificationChannel(
                CH_IDLE, "后台守候", NotificationManager.IMPORTANCE_MIN);
        idle.setDescription("常驻的静默通知，关掉它消息提醒会失效");
        idle.setShowBadge(false);
        nm.createNotificationChannel(idle);
    }

    private PendingIntent openApp() {
        Intent it = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("openYu", true)
                .putExtra("room", code);
        return PendingIntent.getActivity(this, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification idleNotification(String room) {
        return new Notification.Builder(this, CH_IDLE)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle("与鱼")
                .setContentText("守着消息，先别关我")
                .setContentIntent(openApp())
                .setOngoing(true)
                .setShowWhen(false)
                .build();
    }

    private void notifyMsg(String who, String body, long at) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification n = new Notification.Builder(this, CH_MSG)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(who)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setWhen(at > 0 ? at : System.currentTimeMillis())
                .setShowWhen(true)
                .setNumber(unread)
                .setAutoCancel(true)
                .setContentIntent(openApp())
                .build();
        try {
            nm.notify(ID_MSG, n);
        } catch (Exception e) {
            Log.w(TAG, "通知发不出去（可能是没给权限）：" + e);
        }
    }

    /* ---------------- 小工具 ---------------- */

    /** 只取站点根：/yu 页、接口都在同一个 host 下，地址栏里带了路径也不影响 */
    private String baseUrl() {
        String u = sp().getString("url", "");
        if (u == null || u.isEmpty()) return null;
        try {
            Uri p = Uri.parse(u);
            String scheme = p.getScheme();
            String host = p.getHost();
            if (scheme == null || host == null) return null;
            int port = p.getPort();
            return scheme + "://" + host + (port > 0 ? ":" + port : "");
        } catch (Exception e) {
            return null;
        }
    }

    private static String enc(String s) {
        try {
            return URLEncoder.encode(s == null ? "" : s, "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }
}
