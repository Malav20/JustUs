import UIKit
import Capacitor
import WebKit

@objc(StreamAuthPlugin)
public class StreamAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StreamAuthPlugin"
    public let jsName = "StreamAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadService", returnType: CAPPluginMethodReturnPromise)
    ]

    @objc func loadService(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Must provide URL")
            return
        }
        
        DispatchQueue.main.async {
            if let webView = self.bridge?.webView {
                var request = URLRequest(url: url)
                request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
                webView.load(request)
                call.resolve(["success": true])
            } else {
                call.reject("No webview found")
            }
        }
    }

    @objc public override func shouldOverrideLoad(_ navigationAction: WKNavigationAction!) -> NSNumber! {
        guard let url = navigationAction.request.url else {
            return nil
        }
        
        let scheme = url.scheme?.lowercased() ?? ""
        // Block custom schemes like netflix:// or nflx:// or primevideo:// so they don't open the external app
        if scheme == "netflix" || scheme == "nflx" || scheme == "primevideo" || scheme == "aiv" {
            return NSNumber(value: true) // Abort load
        }
        
        // If it is a link click to netflix/prime, load it directly in the webview to prevent universal link handoff
        if navigationAction.navigationType == .linkActivated {
            if let host = url.host?.lowercased(), host.contains("netflix.com") || host.contains("primevideo.com") || host.contains("amazon.com") {
                DispatchQueue.main.async {
                    var req = URLRequest(url: url)
                    req.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
                    self.bridge?.webView?.load(req)
                }
                return NSNumber(value: true) // Abort default link click (which triggers Universal Link) and load programmatically!
            }
        }
        
        return nil
    }
}

class MainViewController: CAPBridgeViewController {
    private var floatingHubButton: UIButton?

    override func viewDidLoad() {
        super.viewDidLoad()
        
        if let webView = self.webView {
            webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            webView.configuration.allowsInlineMediaPlayback = true
            webView.configuration.allowsAirPlayForMediaPlayback = true
            webView.configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
            webView.configuration.mediaTypesRequiringUserActionForPlayback = []
            webView.configuration.websiteDataStore = WKWebsiteDataStore.default()
            webView.allowsBackForwardNavigationGestures = true
            webView.addObserver(self, forKeyPath: #keyPath(WKWebView.url), options: .new, context: nil)
        }
        
        setupFloatingHubButton()
    }
    
    deinit {
        webView?.removeObserver(self, forKeyPath: #keyPath(WKWebView.url))
    }
    
    private func setupFloatingHubButton() {
        let btn = UIButton(type: .system)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.setTitle(" ◀ JustUS Hub ", for: .normal)
        btn.titleLabel?.font = UIFont.systemFont(ofSize: 13, weight: .bold)
        btn.setTitleColor(.white, for: .normal)
        btn.backgroundColor = UIColor(red: 0.07, green: 0.08, blue: 0.13, alpha: 0.90)
        btn.layer.cornerRadius = 18
        btn.layer.borderWidth = 1.0
        btn.layer.borderColor = UIColor.white.withAlphaComponent(0.25).cgColor
        btn.layer.shadowColor = UIColor.black.cgColor
        btn.layer.shadowOpacity = 0.45
        btn.layer.shadowOffset = CGSize(width: 0, height: 4)
        btn.layer.shadowRadius = 8
        btn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)
        
        btn.addTarget(self, action: #selector(didTapHubButton), for: .touchUpInside)
        
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        btn.addGestureRecognizer(pan)
        
        self.view.addSubview(btn)
        self.floatingHubButton = btn
        btn.isHidden = true
        
        NSLayoutConstraint.activate([
            btn.topAnchor.constraint(equalTo: self.view.safeAreaLayoutGuide.topAnchor, constant: 14),
            btn.leadingAnchor.constraint(equalTo: self.view.leadingAnchor, constant: 16),
            btn.heightAnchor.constraint(equalToConstant: 36)
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
            let isExternal = urlString.contains("netflix.com") || urlString.contains("primevideo.com") || urlString.contains("amazon.com") || urlString.contains("youtube.com")
            
            DispatchQueue.main.async {
                self.floatingHubButton?.isHidden = !isExternal
                if isExternal, let btn = self.floatingHubButton {
                    self.view.bringSubviewToFront(btn)
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
}
