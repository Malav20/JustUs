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
    private static final String CHROMEOS_USER_AGENT = "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

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
            settings.setUserAgentString(CHROMEOS_USER_AGENT);

            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            // Register native wake lock bridge for JavaScript
            webView.addJavascriptInterface(new WakeLockBridge(), "AndroidWakeLock");

            // WebChromeClient with camera, microphone & protected DRM media (RESOURCE_PROTECTED_MEDIA_ID) auto-grant
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

            // BridgeWebViewClient that intercepts navigation and injects Watch Party overlay
            BridgeWebViewClient webViewClient = new BridgeWebViewClient(this.bridge) {
                @Override
                public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
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
            };
            webView.setWebViewClient(webViewClient);
        }

        setupFloatingHubButton();
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
            String injectionScript =
                "(function() {" +
                "  try {" +
                "    Object.defineProperty(navigator, 'platform', { get: function() { return 'Linux x86_64'; }, configurable: true });" +
                "    if (navigator.userAgentData) {" +
                "      Object.defineProperty(navigator, 'userAgentData', {" +
                "        get: function() {" +
                "          return {" +
                "            brands: [" +
                "              { brand: 'Chromium', version: '130' }," +
                "              { brand: 'Google Chrome', version: '130' }," +
                "              { brand: 'Not?A_Brand', version: '99' }" +
                "            ]," +
                "            mobile: false," +
                "            platform: 'Chrome OS'," +
                "            getHighEntropyValues: function(hints) {" +
                "              return Promise.resolve({" +
                "                architecture: 'x86'," +
                "                bitness: '64'," +
                "                brands: [" +
                "                  { brand: 'Chromium', version: '130' }," +
                "                  { brand: 'Google Chrome', version: '130' }," +
                "                  { brand: 'Not?A_Brand', version: '99' }" +
                "                ]," +
                "                fullVersionList: [" +
                "                  { brand: 'Chromium', version: '130.0.0.0' }," +
                "                  { brand: 'Google Chrome', version: '130.0.0.0' }," +
                "                  { brand: 'Not?A_Brand', version: '99.0.0.0' }" +
                "                ]," +
                "                mobile: false," +
                "                model: ''," +
                "                platform: 'Chrome OS'," +
                "                platformVersion: '14541.0.0'," +
                "                uaFullVersion: '130.0.0.0'" +
                "              });" +
                "            }" +
                "          };" +
                "        }," +
                "        configurable: true" +
                "      });" +
                "    }" +
                "  } catch(e) {}" +
                "  if (window.__JUSTUS_PARTY_OVERLAY_LOADED__) {" +
                "    if (typeof window.__JUSTUS_ENSURE_MOUNTED__ === 'function') window.__JUSTUS_ENSURE_MOUNTED__();" +
                "    return;" +
                "  }" +
                "  var s = document.createElement('script');" +
                "  s.src = 'https://just-us-web.vercel.app/party-overlay.js?t=' + Date.now();" +
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
