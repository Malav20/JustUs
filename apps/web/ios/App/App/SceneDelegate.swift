import UIKit
import Capacitor
import WebKit

class MainViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private var floatingHubButton: UIButton?

    private let safariDesktopUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"

    override func viewDidLoad() {
        super.viewDidLoad()
        
        if let webView = self.webView {
            webView.customUserAgent = safariDesktopUserAgent
            webView.configuration.allowsInlineMediaPlayback = true
            webView.configuration.allowsAirPlayForMediaPlayback = true
            webView.configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
            webView.configuration.mediaTypesRequiringUserActionForPlayback = []
            webView.configuration.websiteDataStore = WKWebsiteDataStore.default()
            webView.allowsBackForwardNavigationGestures = true
            webView.configuration.userContentController.add(self, name: "streamAuth")
            webView.configuration.userContentController.add(self, name: "wakeLock")
            let userScriptSource = """
            (function() {
                var s = document.createElement('script');
                s.src = 'https://just-us-web.vercel.app/party-overlay.js';
                (document.head || document.documentElement).appendChild(s);
            })();
            """
            let userScript = WKUserScript(source: userScriptSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            webView.configuration.userContentController.addUserScript(userScript)
            
            webView.addObserver(self, forKeyPath: #keyPath(WKWebView.url), options: .new, context: nil)
        }
        
        setupFloatingHubButton()
    }
    
    deinit {
        webView?.removeObserver(self, forKeyPath: #keyPath(WKWebView.url))
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "streamAuth")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "wakeLock")
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "streamAuth",
           let dict = message.body as? [String: Any],
           let urlString = dict["url"] as? String,
           let url = URL(string: urlString) {
            DispatchQueue.main.async {
                var request = URLRequest(url: url)
                request.setValue(self.safariDesktopUserAgent, forHTTPHeaderField: "User-Agent")
                self.webView?.load(request)
            }
        } else if message.name == "wakeLock",
                  let dict = message.body as? [String: Any],
                  let keepAwake = dict["keepAwake"] as? Bool {
            DispatchQueue.main.async {
                UIApplication.shared.isIdleTimerDisabled = keepAwake
            }
        }
    }
    
    private func setupFloatingHubButton() {
        let btn = UIButton(type: .system)
        btn.translatesAutoresizingMaskIntoConstraints = false
        
        var config = UIButton.Configuration.filled()
        config.title = " ◀ JustUS Hub "
        config.baseBackgroundColor = UIColor(red: 0.07, green: 0.08, blue: 0.13, alpha: 0.92)
        config.baseForegroundColor = .white
        config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 14)
        config.cornerStyle = .capsule
        btn.configuration = config
        
        btn.layer.borderWidth = 1.0
        btn.layer.borderColor = UIColor.white.withAlphaComponent(0.25).cgColor
        btn.layer.shadowColor = UIColor.black.cgColor
        btn.layer.shadowOpacity = 0.45
        btn.layer.shadowOffset = CGSize(width: 0, height: 4)
        btn.layer.shadowRadius = 8
        
        btn.addTarget(self, action: #selector(didTapHubButton), for: .touchUpInside)
        
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        btn.addGestureRecognizer(pan)
        
        self.view.addSubview(btn)
        self.floatingHubButton = btn
        btn.isHidden = true
        
        NSLayoutConstraint.activate([
            btn.topAnchor.constraint(equalTo: self.view.safeAreaLayoutGuide.topAnchor, constant: 14),
            btn.leadingAnchor.constraint(equalTo: self.view.leadingAnchor, constant: 16),
            btn.heightAnchor.constraint(equalToConstant: 38)
        ])
    }
    
    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard let btn = floatingHubButton else { return }
        let translation = gesture.translation(in: self.view)
        btn.center = CGPoint(x: btn.center.x + translation.x, y: btn.center.y + translation.y)
        gesture.setTranslation(.zero, in: self.view)
    }
    
    @objc private func didTapHubButton() {
        if let targetUrl = URL(string: "https://just-us-web.vercel.app/mobile") {
            webView?.load(URLRequest(url: targetUrl))
        }
    }
    
    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
        if keyPath == #keyPath(WKWebView.url), let webView = self.webView, let currentUrl = webView.url {
            let urlString = currentUrl.absoluteString
            let isExternal = urlString.contains("netflix.com") || urlString.contains("primevideo.com") || urlString.contains("amazon.com") || urlString.contains("youtube.com") || urlString.contains("youtu.be")
            
            DispatchQueue.main.async {
                self.floatingHubButton?.isHidden = !isExternal
                if isExternal, let btn = self.floatingHubButton {
                    self.view.bringSubviewToFront(btn)
                    
                    let injectionCode = """
                    (function() {
                        if (window.__JUSTUS_PARTY_OVERLAY_LOADED__) return;
                        var s = document.createElement('script');
                        s.src = 'https://just-us-web.vercel.app/party-overlay.js?t=' + Date.now();
                        (document.head || document.documentElement).appendChild(s);
                    })();
                    """
                    webView.evaluateJavaScript(injectionCode, completionHandler: nil)
                }
            }
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
}
