import UIKit
import Capacitor
import WebKit

class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        
        if let webView = self.webView {
            webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            webView.configuration.allowsInlineMediaPlayback = true
            webView.configuration.allowsAirPlayForMediaPlayback = true
            webView.configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        }
    }
}
