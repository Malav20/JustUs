package com.justus.watchparty;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private TextView floatingHubButton;
    private float dX, dY;
    private float startX, startY;
    private static final int CLICK_ACTION_THRESHOLD = 10;
    private static final String HUB_URL = "https://just-us-web.vercel.app/mobile";
    private static final String DESKTOP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
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
            settings.setUserAgentString(DESKTOP_USER_AGENT);

            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            // Register native wake lock bridge for JavaScript
            webView.addJavascriptInterface(new WakeLockBridge(), "AndroidWakeLock");

            // WebChromeClient with camera, microphone & protected DRM media auto-grant
            webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            });

            // BridgeWebViewClient that intercepts navigation and injects Watch Party overlay
            BridgeWebViewClient webViewClient = new BridgeWebViewClient(this.bridge) {
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
            };
            webView.setWebViewClient(webViewClient);
        }

        setupFloatingHubButton();
    }

    private String cachedOverlayScript = null;

    private String getOverlayScript() {
        if (cachedOverlayScript != null && !cachedOverlayScript.isEmpty()) {
            return cachedOverlayScript;
        }
        try {
            java.io.InputStream is = getAssets().open("public/party-overlay.js");
            java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(is));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            reader.close();
            cachedOverlayScript = sb.toString();
            return cachedOverlayScript;
        } catch (Exception e) {
            try {
                java.io.InputStream is = getAssets().open("party-overlay.js");
                java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(is));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
                reader.close();
                cachedOverlayScript = sb.toString();
                return cachedOverlayScript;
            } catch (Exception ex) {
                // Ignore fallback
            }
        }
        return null;
    }

    private void handleUrlChange(WebView view, String url) {
        if (view == null || url == null) return;

        boolean isExternal = url.contains("netflix.com") ||
                             url.contains("primevideo.com") ||
                             url.contains("amazon.com") ||
                             url.contains("youtube.com") ||
                             url.contains("youtu.be") ||
                             url.contains("googlevideo.com");

        runOnUiThread(() -> {
            if (floatingHubButton != null) {
                floatingHubButton.setVisibility(isExternal ? View.VISIBLE : View.GONE);
                if (isExternal) {
                    floatingHubButton.bringToFront();
                }
            }
        });

        if (isExternal) {
            String script = getOverlayScript();
            if (script != null && !script.isEmpty()) {
                view.evaluateJavascript(script, null);
            } else {
                String injectionScript =
                    "(function() {" +
                    "  try { Object.defineProperty(navigator, 'platform', { get: function() { return 'Win32'; } }); } catch(e) {}" +
                    "  if (window.__JUSTUS_PARTY_OVERLAY_LOADED__) return;" +
                    "  fetch('https://just-us-web.vercel.app/party-overlay.js?t=' + Date.now()).then(r => r.text()).then(code => eval(code)).catch(() => {" +
                    "    var s = document.createElement('script');" +
                    "    s.src = 'https://just-us-web.vercel.app/party-overlay.js?t=' + Date.now();" +
                    "    (document.head || document.documentElement).appendChild(s);" +
                    "  });" +
                    "})();";
                view.evaluateJavascript(injectionScript, null);
            }
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

        // Styling: Dark Glass Pill with Border
        GradientDrawable shape = new GradientDrawable();
        shape.setShape(GradientDrawable.RECTANGLE);
        shape.setCornerRadius(dpToPx(19));
        shape.setColor(Color.parseColor("#E612141F")); // 90% opacity dark navy
        shape.setStroke(dpToPx(1), Color.parseColor("#4DFFFFFF")); // 30% white border
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
        params.topMargin = dpToPx(48); // below status bar
        params.leftMargin = dpToPx(16);

        ViewGroup rootLayout = (ViewGroup) getWindow().getDecorView().findViewById(android.R.id.content);
        if (rootLayout != null) {
            rootLayout.addView(floatingHubButton, params);
        } else {
            addContentView(floatingHubButton, params);
        }

        floatingHubButton.setVisibility(View.GONE);

        floatingHubButton.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        dX = view.getX() - event.getRawX();
                        dY = view.getY() - event.getRawY();
                        startX = event.getRawX();
                        startY = event.getRawY();
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        float newX = event.getRawX() + dX;
                        float newY = event.getRawY() + dY;
                        // Keep within screen bounds
                        View parent = (View) view.getParent();
                        if (parent != null) {
                            newX = Math.max(0, Math.min(newX, parent.getWidth() - view.getWidth()));
                            newY = Math.max(0, Math.min(newY, parent.getHeight() - view.getHeight()));
                        }
                        view.setX(newX);
                        view.setY(newY);
                        return true;

                    case MotionEvent.ACTION_UP:
                        float diffX = Math.abs(event.getRawX() - startX);
                        float diffY = Math.abs(event.getRawY() - startY);
                        if (diffX < CLICK_ACTION_THRESHOLD && diffY < CLICK_ACTION_THRESHOLD) {
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
