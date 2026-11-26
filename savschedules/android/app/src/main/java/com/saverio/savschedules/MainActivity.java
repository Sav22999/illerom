package com.saverio.savschedules;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** The SavSchedules web app: files to open and save, Google sign-in and full-screen videos are native (as in SavPresentations). */
public class MainActivity extends Activity {
    private static final String PATH_PREFIX = "/savschedules/";
    /** The apps that share the account and the session with this one: their pages stay inside the app. */
    private static final String[] SHARED_PREFIXES = {"/savcalendar/", "/savtasks/", "/savwhiteboard/"};
    private static final int REQ_FILE = 1, REQ_SAVE = 2;
    private static final int MAX_OPEN = 60 * 1024 * 1024;

    private String host, launchUrl;
    private WebView web;
    private FrameLayout root;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private ValueCallback<Uri[]> fileCallback;
    private volatile boolean onAppPage;
    private String saveName, saveType;
    private ByteArrayOutputStream saveData;
    private Uri pendingFile;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        host = getString(R.string.host_name);
        launchUrl = "https://" + host + PATH_PREFIX;
        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.background));
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.background));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupSystemBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " SavSchedulesApp/Android SavAccount");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new Bridge(), "SavSchedulesAndroid");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        if (state != null && web.restoreState(state) != null) return;
        web.loadUrl(urlFrom(getIntent()));
    }

    /** Edge-to-edge on Android 11+: the page is padded by the system bars and the keyboard. */
    private void setupSystemBars() {
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (c != null) c.setSystemBarsAppearance(night ? 0 : light, light);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                if (fullscreen != null) {
                    v.setPadding(0, 0, 0, 0);
                } else {
                    Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                    v.setPadding(i.left, i.top, i.right, i.bottom);
                }
                return WindowInsets.CONSUMED;
            });
        } else {
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
    }

    private void goBack() {
        if (fullscreen != null) web.getWebChromeClient().onHideCustomView();
        else if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        goBack(); // Android 12 and older (13+ use the callback above)
    }

    private boolean isAppUrl(Uri u) {
        return u != null && "https".equals(u.getScheme()) && host.equalsIgnoreCase(u.getHost()) && u.getPath() != null && (u.getPath().startsWith(PATH_PREFIX) || shared(u.getPath()));
    }

    private static boolean shared(String path) {
        for (String p : SHARED_PREFIXES) if (path.startsWith(p)) return true;
        return false;
    }

    private boolean isSavAccount(Uri u) {
        return u != null && "https".equals(u.getScheme()) && "www.savaccount.eu".equalsIgnoreCase(u.getHost());
    }

    private String urlFrom(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data != null && "content".equals(data.getScheme())) pendingFile = data; // the page asks for it when it is ready
        return isAppUrl(data) ? data.toString() : launchUrl;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getData() != null) web.loadUrl(urlFrom(intent));
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException e) { /* no app can open it */ }
    }

    /** Calls window.SavSchedulesNative.result(kind, value, error) in the page. */
    private void sendResult(String kind, String value, String error) {
        String js = "window.SavSchedulesNative&&SavSchedulesNative.result(" + JSONObject.quote(kind) + "," + (value == null ? "null" : JSONObject.quote(value)) + "," + (error == null ? "null" : JSONObject.quote(error)) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    private class AppClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!request.isForMainFrame() || isAppUrl(u) || isSavAccount(u)) return false; // sign-in with SavAccount goes there and comes back
            openExternal(u);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            onAppPage = isAppUrl(Uri.parse(url));
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            String retry = JSONObject.quote(request.getUrl().toString());
            String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style=\"font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:90vh;text-align:center;padding:24px;color:#5b6478\">"
                    + "<h2 style='margin:0 0 8px;color:#1f56d1'>" + getString(R.string.offline_title) + "</h2><p>" + getString(R.string.offline_text) + "</p>"
                    + "<button onclick='location.href=" + retry + "' style='margin-top:16px;padding:12px 26px;border:0;border-radius:999px;background:#1f56d1;color:#fff;font-size:16px'>" + getString(R.string.offline_retry) + "</button></body>";
            view.loadDataWithBaseURL(launchUrl, html, "text/html", "UTF-8", request.getUrl().toString());
        }
    }

    private class AppChrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent i = params.createIntent();
            // own extensions have no type of their own on Android: every file can be chosen, the page checks it
            for (String t : params.getAcceptTypes()) if (t.contains(".savsch")) i.setType("*/*").removeExtra(Intent.EXTRA_MIME_TYPES);
            try {
                startActivityForResult(i, REQ_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
        }

        /** Full-screen videos. */
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullscreen != null) onHideCustomView();
            fullscreen = view;
            fullscreenCallback = callback;
            view.setBackgroundColor(0xff000000);
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            bars(false);
        }

        @Override
        public void onHideCustomView() {
            if (fullscreen == null) return;
            root.removeView(fullscreen);
            fullscreen = null;
            if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            bars(true);
        }
    }

    @SuppressWarnings("deprecation")
    private void bars(boolean show) {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c == null) return;
            c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (show) c.show(WindowInsets.Type.systemBars());
            else c.hide(WindowInsets.Type.systemBars());
            root.requestApplyInsets();
        } else {
            getWindow().getDecorView().setSystemUiVisibility(show ? View.SYSTEM_UI_FLAG_VISIBLE : View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        } else if (requestCode == REQ_SAVE) {
            ByteArrayOutputStream bytes = saveData;
            saveData = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            Uri to = data.getData();
            new Thread(() -> {
                try (OutputStream out = getContentResolver().openOutputStream(to)) {
                    if (out == null) throw new java.io.IOException();
                    bytes.writeTo(out);
                    sendResult("save", "ok", null);
                } catch (Exception e) {
                    sendResult("save", null, "failed");
                }
            }).start();
        }
    }

    private void googleSignIn(String webClientId) {
        if (webClientId == null || webClientId.isEmpty()) {
            sendResult("google", null, "not configured");
            return;
        }
        // The ID token is issued for the web client: the server verifies it exactly as on the website
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(new GetSignInWithGoogleOption.Builder(webClientId).build()).build();
        CredentialManager.create(this).getCredentialAsync(this, request, new CancellationSignal(), getMainExecutorCompat(), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
            @Override
            public void onResult(GetCredentialResponse response) {
                Credential c = response.getCredential();
                if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                    try {
                        sendResult("google", GoogleIdTokenCredential.createFrom(c.getData()).getIdToken(), null);
                    } catch (Exception e) {
                        sendResult("google", null, "invalid credential");
                    }
                } else sendResult("google", null, "unexpected credential");
            }

            @Override
            public void onError(GetCredentialException e) {
                String m = e.getMessage() == null ? "" : e.getMessage();
                boolean refused = m.contains("[16]") || m.toLowerCase(java.util.Locale.ROOT).contains("reauth"); // Google refused this app, not the person
                sendResult("google", null, !refused && e instanceof GetCredentialCancellationException ? "cancelled" : e.getClass().getSimpleName());
            }
        });
    }

    private java.util.concurrent.Executor getMainExecutorCompat() {
        return r -> runOnUiThread(r);
    }

    /** window.SavSchedulesAndroid (methods run on a background thread). */
    private class Bridge {
        @JavascriptInterface
        public void googleSignIn(String webClientId) {
            if (onAppPage) runOnUiThread(() -> MainActivity.this.googleSignIn(webClientId));
        }

        // A file made by the page arrives in pieces, then the system asks where to keep it
        @JavascriptInterface
        public void saveBegin(String name, String type) {
            if (!onAppPage) return;
            saveName = name.replaceAll("[\\\\/:*?\"<>|]", " ");
            saveType = type;
            saveData = new ByteArrayOutputStream();
        }

        @JavascriptInterface
        public void saveFile(String base64) {
            if (!onAppPage || saveData == null) return;
            byte[] b = Base64.decode(base64, Base64.DEFAULT);
            saveData.write(b, 0, b.length);
        }

        @JavascriptInterface
        public void saveEnd() {
            if (!onAppPage || saveData == null) return;
            runOnUiThread(() -> {
                try {
                    startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(saveType).putExtra(Intent.EXTRA_TITLE, saveName), REQ_SAVE);
                } catch (ActivityNotFoundException e) {
                    sendResult("save", null, "failed");
                }
            });
        }

        /** A .savsch file opened with the app: {name, data} in base64, once; "" when there is none. */
        @JavascriptInterface
        public String pendingFile() {
            Uri u = pendingFile;
            if (!onAppPage || u == null) return "";
            pendingFile = null;
            String name = "schedule.savsch";
            try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
            } catch (Exception e) { /* without a name */ }
            try (InputStream in = getContentResolver().openInputStream(u)) {
                if (in == null) return "";
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                for (int n; (n = in.read(buf)) > 0; ) {
                    out.write(buf, 0, n);
                    if (out.size() > MAX_OPEN) return "";
                }
                return new JSONObject().put("name", name).put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)).toString();
            } catch (Exception e) {
                return "";
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
