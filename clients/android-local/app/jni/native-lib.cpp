#include <jni.h>
#include <string>
#include <android/log.h>
#include <node.h>

#define LOG_TAG "NodeSpike"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// node::Start 会长期占用调用线程，argv 必须一直有效，故用静态存储
static std::string g_script_path;
static char* g_argv[2];

extern "C" JNIEXPORT void JNICALL
Java_com_happynav_local_MainActivity_startNode(JNIEnv* env, jobject /*thiz*/, jstring scriptPath) {
    const char* path = env->GetStringUTFChars(scriptPath, nullptr);
    g_script_path.assign(path ? path : "");
    env->ReleaseStringUTFChars(scriptPath, path);

    g_argv[0] = const_cast<char*>("node");
    g_argv[1] = const_cast<char*>(g_script_path.c_str());

    LOGI("node::Start argc=2 argv[1]=%s", g_argv[1]);
    int ret = node::Start(2, g_argv);
    LOGE("node::Start returned %d (unexpected)", ret);
}
