package de.worklevel.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String START_URL = "https://worklevel.de/login";
    private static final int FILE_REQUEST = 41;
    private static final int CAMERA_REQUEST = 42;

    /** Runs before the site's own boot script. Phone layout, full width, no desktop preview frame. */
    private static final String BOOT = "(function(){"
            + "try{localStorage.setItem('worklevel:phone-preview','1');}catch(e){}"
            + "function fit(){"
            + "var root=document.documentElement;if(!root)return;"
            + "if(!root.classList.contains('is-phone'))root.classList.add('is-phone');"
            + "if(root.classList.contains('phone-preview'))root.classList.remove('phone-preview');"
            + "var nodes=document.querySelectorAll('.phonePreviewDock');"
            + "for(var i=0;i<nodes.length;i++)nodes[i].style.setProperty('display','none','important');"
            + "}"
            + "fit();"
            + "if(document.documentElement)new MutationObserver(fit).observe(document.documentElement,{attributes:true,attributeFilter:['class']});"
            + "document.addEventListener('DOMContentLoaded',function(){"
            + "fit();"
            + "if(document.body)new MutationObserver(fit).observe(document.body,{childList:true,subtree:true});"
            + "});"
            + "if(window.__wlAndroid)return;window.__wlAndroid=1;"
            + "var realCreate=URL.createObjectURL.bind(URL);"
            + "var realRevoke=URL.revokeObjectURL.bind(URL);"
            + "var blobs=new Map();"
            + "URL.createObjectURL=function(obj){var url=realCreate(obj);try{blobs.set(url,obj);}catch(e){}return url;};"
            + "URL.revokeObjectURL=function(url){setTimeout(function(){blobs.delete(url);realRevoke(url);},8000);};"
            + "function toB64(buf){var bytes=new Uint8Array(buf);var bin='';var step=8192;"
            + "for(var i=0;i<bytes.length;i+=step)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+step));"
            + "return btoa(bin);}"
            + "document.addEventListener('click',function(ev){"
            + "var node=ev.target;var link=node&&node.closest?node.closest('a'):null;"
            + "if(!link||!link.href||link.href.indexOf('blob:')!==0)return;"
            + "var blob=blobs.get(link.href);if(!blob)return;"
            + "ev.preventDefault();ev.stopPropagation();"
            + "var name=link.download||'download';"
            + "blob.arrayBuffer().then(function(buf){WorklevelAndroid.save(name,blob.type||'application/octet-stream',toB64(buf));})"
            + ".catch(function(){});"
            + "},true);"
            + "var nativeShare=navigator.share?navigator.share.bind(navigator):null;"
            + "navigator.share=function(data){"
            + "data=data||{};"
            + "if(data.files&&data.files.length){"
            + "var file=data.files[0];"
            + "return file.arrayBuffer().then(function(buf){"
            + "WorklevelAndroid.share(file.name||'datei',file.type||'application/octet-stream',toB64(buf),data.title||'',data.text||'');"
            + "});"
            + "}"
            + "if(nativeShare)return nativeShare(data);"
            + "WorklevelAndroid.share('','text/plain','',data.title||'',data.text||data.url||'');"
            + "return Promise.resolve();"
            + "};"
            + "navigator.canShare=function(){return true;};"
            + "})();";

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Intent pendingChooser;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        paintBars();
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#f4f6fb"));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " WorklevelAndroid");
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new Bridge(), "WorklevelAndroid");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Set<String> origins = new HashSet<>();
            origins.add("https://worklevel.de");
            origins.add("https://www.worklevel.de");
            WebViewCompat.addDocumentStartJavaScript(web, BOOT, origins);
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                String host = uri.getHost() == null ? "" : uri.getHost();
                if ("https".equals(scheme) && (host.equals("worklevel.de") || host.endsWith(".worklevel.de"))) return false;
                if ("http".equals(scheme) && (host.equals("worklevel.de") || host.endsWith(".worklevel.de"))) {
                    view.loadUrl(uri.buildUpon().scheme("https").build().toString());
                    return true;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.contains("worklevel.de")) view.evaluateJavascript(BOOT, null);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                        + "<body style=\"margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6fb;"
                        + "color:#1b2440;font-family:sans-serif;text-align:center;padding:24px\">"
                        + "<div><b style=\"font-size:22px\">Keine Verbindung</b>"
                        + "<p>WORKLEVEL braucht Internet, weil die App die aktuelle Seite von worklevel.de öffnet.</p>"
                        + "<button onclick=\"location.href='" + START_URL + "'\" style=\"background:#ff6a00;color:#fff;"
                        + "border:0;border-radius:12px;padding:12px 18px;font-weight:700\">Erneut versuchen</button></div></body>";
                view.loadDataWithBaseURL(START_URL, html, "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception ex) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                }
                if (params.isCaptureEnabled() && checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    pendingChooser = intent;
                    requestPermissions(new String[]{android.Manifest.permission.CAMERA}, CAMERA_REQUEST);
                    return true;
                }
                launchChooser(intent);
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                String host = request.getOrigin() == null ? "" : request.getOrigin().getHost();
                if ("worklevel.de".equals(host) || (host != null && host.endsWith(".worklevel.de"))) {
                    request.grant(request.getResources());
                } else {
                    request.deny();
                }
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, origin != null && origin.contains("worklevel.de"), false);
            }
        });
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || url.startsWith("blob:") || url.startsWith("data:")) return;
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.addRequestHeader("User-Agent", userAgent);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) req.addRequestHeader("Cookie", cookie);
            req.setMimeType(mimeType);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, contentDisposition, mimeType));
            req.setTitle("WORKLEVEL");
            try {
                manager.enqueue(req);
                toast("Download gestartet");
            } catch (Exception ex) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
            }
        });
        web.loadUrl(START_URL);
        setContentView(web);
    }

    private void paintBars() {
        int background = Color.parseColor("#f4f6fb");
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    private void launchChooser(Intent intent) {
        try {
            startActivityForResult(intent, FILE_REQUEST);
        } catch (Exception ex) {
            Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
            fallback.addCategory(Intent.CATEGORY_OPENABLE);
            fallback.setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(fallback, "Datei wählen"), FILE_REQUEST);
            } catch (Exception ignored) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = null;
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != CAMERA_REQUEST || pendingChooser == null) return;
        Intent intent = pendingChooser;
        pendingChooser = null;
        launchChooser(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_REQUEST || fileCallback == null) return;
        fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        fileCallback = null;
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_SHORT).show());
    }

    private static String safeName(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (cleaned.isEmpty()) cleaned = "worklevel-" + System.currentTimeMillis();
        return cleaned;
    }

    private static byte[] decode(String value) {
        if (value == null || value.isEmpty()) return new byte[0];
        int comma = value.indexOf(',');
        if (value.startsWith("data:") && comma >= 0) value = value.substring(comma + 1);
        return android.util.Base64.decode(value, android.util.Base64.DEFAULT);
    }

    private void writePublicDownload(String filename, String mime, byte[] data) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(android.provider.MediaStore.Downloads.MIME_TYPE, mime);
            values.put(android.provider.MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("download");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("stream");
                out.write(data);
            }
            values.clear();
            values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(uri, values, null, null);
            return;
        }
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("dir");
        try (FileOutputStream out = new FileOutputStream(new File(dir, filename))) {
            out.write(data);
        }
    }

    public final class Bridge {
        @android.webkit.JavascriptInterface
        public void save(String filename, String mime, String base64) {
            try {
                String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
                writePublicDownload(safeName(filename), type, decode(base64));
                toast("Gespeichert in Downloads");
            } catch (Exception ex) {
                toast("Speichern fehlgeschlagen");
            }
        }

        @android.webkit.JavascriptInterface
        public void share(String filename, String mime, String base64, String title, String text) {
            try {
                String type = mime == null || mime.isEmpty() ? "text/plain" : mime;
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(type);
                if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
                if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
                if (base64 != null && !base64.isEmpty()) {
                    File dir = new File(getCacheDir(), "share");
                    if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cache");
                    File file = new File(dir, safeName(filename));
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(decode(base64));
                    }
                    Uri uri = ShareProvider.expose(file, type);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(android.content.ClipData.newRawUri("", uri));
                }
                runOnUiThread(() -> {
                    try {
                        startActivity(Intent.createChooser(send, "Teilen"));
                    } catch (Exception ex) {
                        toast("Teilen nicht möglich");
                    }
                });
            } catch (Exception ex) {
                toast("Teilen fehlgeschlagen");
            }
        }
    }
}
