package com.justus.watchparty;

import android.media.AudioManager;
import android.content.Context;
import android.content.Intent;
import android.annotation.SuppressLint;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

import java.util.Collections;

public class MainActivity extends BridgeActivity {
    private TextView floatingHubButton;
    private float dX, dY;
    private float startX, startY;
    private static final int CLICK_ACTION_THRESHOLD = 10;
    private static final String HUB_URL = "https://just-us-web.vercel.app/mobile";
    // ChromeOS desktop UA — Netflix allows browser playback on ChromeOS (Widevine in WebView).
    private static final String CHROMEOS_USER_AGENT =
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  private static final String DOCUMENT_START_SCRIPT =
        "(function() {" +
        "  var UA = '" + CHROMEOS_USER_AGENT + "';" +
        "  try {" +
        "    Object.defineProperty(navigator, 'userAgent', { get: function() { return UA; }, configurable: true });" +
        "    Object.defineProperty(navigator, 'platform', { get: function() { return 'Linux x86_64'; }, configurable: true });" +
        "    Object.defineProperty(navigator, 'vendor', { get: function() { return 'Google Inc.'; }, configurable: true });" +
        "    Object.defineProperty(navigator, 'maxTouchPoints', { get: function() { return 0; }, configurable: true });" +
        "    Object.defineProperty(navigator, 'webdriver', { get: function() { return false; }, configurable: true });" +
        "    if (navigator.userAgentData) {" +
        "      Object.defineProperty(navigator, 'userAgentData', {" +
        "        get: function() {" +
        "          return {" +
        "            brands: [" +
        "              { brand: 'Chromium', version: '131' }," +
        "              { brand: 'Google Chrome', version: '131' }," +
        "              { brand: 'Not?A_Brand', version: '99' }" +
        "            ]," +
        "            mobile: false," +
        "            platform: 'Chrome OS'," +
        "            getHighEntropyValues: function(hints) {" +
        "              return Promise.resolve({" +
        "                architecture: 'x86'," +
        "                bitness: '64'," +
        "                brands: [" +
        "                  { brand: 'Chromium', version: '131' }," +
        "                  { brand: 'Google Chrome', version: '131' }," +
        "                  { brand: 'Not?A_Brand', version: '99' }" +
        "                ]," +
        "                fullVersionList: [" +
        "                  { brand: 'Chromium', version: '131.0.0.0' }," +
        "                  { brand: 'Google Chrome', version: '131.0.0.0' }," +
        "                  { brand: 'Not?A_Brand', version: '99.0.0.0' }" +
        "                ]," +
        "                mobile: false," +
        "                model: ''," +
        "                platform: 'Chrome OS'," +
        "                platformVersion: '14541.0.0'," +
        "                uaFullVersion: '131.0.0.0'" +
        "              });" +
        "            }" +
        "          };" +
        "        }," +
        "        configurable: true" +
        "      });" +
        "    }" +
        "  } catch(e) {}" +
        "  window.__JUSTUS_NATIVE_ANDROID__ = true;" +
        "  var host = (location.hostname || '').toLowerCase();" +
        "  var isStream = host.indexOf('netflix.com') >= 0 || host.indexOf('primevideo.com') >= 0 ||" +
        "    host.indexOf('amazon.com') >= 0 || host.indexOf('youtube.com') >= 0 || host.indexOf('youtu.be') >= 0;" +
        "  if (isStream && !window.__JUSTUS_PARTY_OVERLAY_LOADED__) {" +
        "    var s = document.createElement('script');" +
        "    s.src = 'https://just-us-web.vercel.app/party-overlay.js?v=android-netflix-v1&t=' + Date.now();" +
        "    (document.head || document.documentElement).appendChild(s);" +
        "  }" +
        "})();";

    public class WakeLockBridge {
        @JavascriptInterface
        public void setKeepScreenOn(final boolean keepOn) {
            runOnUiThread(() -> {
                if (keepOn) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }

    public class StreamAuthBridge {
        @JavascriptInterface
        public void loadUrl(final String url) {
            runOnUiThread(() -> {
                WebView wv = bridge.getWebView();
                if (wv != null && url != null && !url.isEmpty()) {
                    applyStreamingUserAgent(wv);
                    wv.loadUrl(url);
                }
            });
        }
    }

    public class AudioBridge {
        @JavascriptInterface
        public void prepareCallAudio() {
            runOnUiThread(() -> {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                    am.setSpeakerphoneOn(true);
                }
            });
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            configureWebView(webView);
            setupFloatingHubButton();
        } else {
            setupFloatingHubButton();
        }
    }

    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportMultipleWindows(false);

        applyStreamingUserAgent(webView);

        // Netflix detects X-Requested-With (app package name) and blocks playback (E100).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, Collections.emptySet());
        }

        // Spoof desktop ChromeOS before any page JS runs (including Netflix DRM checks).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                DOCUMENT_START_SCRIPT,
                Collections.singleton("*")
            );
        }

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new WakeLockBridge(), "AndroidWakeLock");
        webView.addJavascriptInterface(new StreamAuthBridge(), "AndroidStreamAuth");
        webView.addJavascriptInterface(new AudioBridge(), "AndroidPrepareCallAudio");

        webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    try {
                        request.grant(request.getResources());
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                });
            }
        });

        BridgeWebViewClient webViewClient = new BridgeWebViewClient(this.bridge) {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (isStreamingUrl(url)) {
                    applyStreamingUserAgent(view);
                }
                super.onPageStarted(view, url, favicon);
                handleUrlChange(view, url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                handleUrlChange(view, url);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                super.onPageCommitVisible(view, url);
                handleUrlChange(view, url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                super.doUpdateVisitedHistory(view, url, isReload);
                handleUrlChange(view, url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (handleSpecialUrl(view, url)) {
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (handleSpecialUrl(view, url)) {
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, url);
            }
        };
        webView.setWebViewClient(webViewClient);
    }

    private void applyStreamingUserAgent(WebView webView) {
        WebSettings settings = webView.getSettings();
        String ua = settings.getUserAgentString();
        if (ua == null || ua.contains("wv") || !ua.contains("CrOS")) {
            settings.setUserAgentString(CHROMEOS_USER_AGENT);
        }
    }

    private boolean isStreamingUrl(String url) {
        if (url == null) return false;
        return url.contains("netflix.com") ||
            url.contains("primevideo.com") ||
            url.contains("amazon.com") ||
            url.contains("youtube.com") ||
            url.contains("youtu.be") ||
            url.contains("googlevideo.com");
    }

  private boolean handleSpecialUrl(WebView view, String url) {
        if (url == null) return false;

        // Keep Netflix inside WebView — don't hand off to the Netflix app via intent://
        if (url.startsWith("intent:")) {
            try {
                Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                String fallback = intent.getStringExtra("browser_fallback_url");
                if (fallback != null && !fallback.isEmpty()) {
                    applyStreamingUserAgent(view);
                    view.loadUrl(fallback);
                    return true;
                }
                Uri data = intent.getData();
                if (data != null && ("http".equals(data.getScheme()) || "https".equals(data.getScheme()))) {
                    applyStreamingUserAgent(view);
                    view.loadUrl(data.toString());
                    return true;
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return true;
        }

        if (url.startsWith("market://") || url.startsWith("play.google.com")) {
            return true;
        }

        return false;
    }

    private void handleUrlChange(WebView view, String url) {
        if (view == null || url == null) return;

        boolean isExternal = isStreamingUrl(url);

        runOnUiThread(() -> {
            if (floatingHubButton != null) {
                floatingHubButton.setVisibility(isExternal ? View.VISIBLE : View.GONE);
                if (isExternal) {
                    floatingHubButton.bringToFront();
                }
            }
        });

        if (isExternal) {
            // Fallback overlay injection if document-start script ran before hostname was ready.
            String injectionScript =
                "(function() {" +
                "  if (window.__JUSTUS_PARTY_OVERLAY_LOADED__) {" +
                "    if (typeof window.__JUSTUS_ENSURE_MOUNTED__ === 'function') window.__JUSTUS_ENSURE_MOUNTED__();" +
                "    return;" +
                "  }" +
                "  var s = document.createElement('script');" +
                "  s.src = 'https://just-us-web.vercel.app/party-overlay.js?v=android-netflix-v1&t=' + Date.now();" +
                "  (document.head || document.documentElement).appendChild(s);" +
                "})();";
            view.evaluateJavascript(injectionScript, null);
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private void setupFloatingHubButton() {
        floatingHubButton = new TextView(this);
        floatingHubButton.setText(" ◀ JustUS Hub ");
        floatingHubButton.setTextColor(Color.WHITE);
        floatingHubButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        floatingHubButton.setTypeface(floatingHubButton.getTypeface(), android.graphics.Typeface.BOLD);
        floatingHubButton.setGravity(Gravity.CENTER);

        GradientDrawable shape = new GradientDrawable();
        shape.setShape(GradientDrawable.RECTANGLE);
        shape.setCornerRadius(dpToPx(19));
        shape.setColor(Color.parseColor("#E612141F"));
        shape.setStroke(dpToPx(1), Color.parseColor("#4DFFFFFF"));
        floatingHubButton.setBackground(shape);
        floatingHubButton.setElevation(dpToPx(8));

        int padH = dpToPx(14);
        int padV = dpToPx(8);
        floatingHubButton.setPadding(padH, padV, padH, padV);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            dpToPx(38)
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.topMargin = dpToPx(48);
        params.leftMargin = dpToPx(16);

        ViewGroup rootLayout = (ViewGroup) getWindow().getDecorView().findViewById(android.R.id.content);
        if (rootLayout != null) {
            rootLayout.addView(floatingHubButton, params);
        } else {
            addContentView(floatingHubButton, params);
        }

        floatingHubButton.setVisibility(View.GONE);

        floatingHubButton.setOnTouchListener(new View.OnTouchListener() {
            private boolean didDrag = false;

            @Override
            public boolean onTouch(View view, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        dX = view.getX() - event.getRawX();
                        dY = view.getY() - event.getRawY();
                        startX = event.getRawX();
                        startY = event.getRawY();
                        didDrag = false;
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        float diffMoveX = Math.abs(event.getRawX() - startX);
                        float diffMoveY = Math.abs(event.getRawY() - startY);
                        if (diffMoveX >= CLICK_ACTION_THRESHOLD || diffMoveY >= CLICK_ACTION_THRESHOLD) {
                            didDrag = true;
                        }
                        float newX = event.getRawX() + dX;
                        float newY = event.getRawY() + dY;
                        View parent = (View) view.getParent();
                        if (parent != null) {
                            newX = Math.max(0, Math.min(newX, parent.getWidth() - view.getWidth()));
                            newY = Math.max(0, Math.min(newY, parent.getHeight() - view.getHeight()));
                        }
                        view.setX(newX);
                        view.setY(newY);
                        return true;

                    case MotionEvent.ACTION_UP:
                        if (!didDrag) {
                            view.performClick();
                        }
                        return true;
                }
                return false;
            }
        });

        floatingHubButton.setOnClickListener(v -> {
            WebView wv = bridge.getWebView();
            if (wv != null) {
                wv.loadUrl(HUB_URL);
            }
        });
    }

    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            getResources().getDisplayMetrics()
        );
    }

    @Override
    public void onBackPressed() {
        WebView webView = this.bridge.getWebView();
        if (webView != null && webView.canGoBack()) {
            String currentUrl = webView.getUrl();
            if (currentUrl != null && !currentUrl.contains("/mobile")) {
                webView.goBack();
                return;
            }
        }
        super.onBackPressed();
    }

    @Override
    public void onPause() {
        super.onPause();
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
