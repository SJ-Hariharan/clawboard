// Renders an SVG to a PNG with WebKit, at an exact pixel size (macOS only).
//
//   swift scripts/render-png.swift assets/banner.svg assets/social-preview.png 1280 640 [seconds]
//
//   sips -z 640 1280 assets/social-preview.png     (WebKit renders at 2x on Retina displays)
//
// The SVG's animations are paused at `seconds` (default 0.8) so the PNG shows a frame
// with the crabs mid-step. Used for the GitHub social preview, which must be a PNG.
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 5, let width = Int(args[3]), let height = Int(args[4]) else {
    FileHandle.standardError.write(Data("usage: render-png.swift input.svg output.png width height [seconds]\n".utf8))
    exit(2)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
let seconds = args.count > 5 ? (Double(args[5]) ?? 0.8) : 0.8

final class Renderer: NSObject, WKNavigationDelegate {
    let input: URL
    let output: URL
    let width: Int
    let height: Int
    let seconds: Double
    let web: WKWebView
    let window: NSWindow

    init(input: URL, output: URL, width: Int, height: Int, seconds: Double) {
        self.input = input
        self.output = output
        self.width = width
        self.height = height
        self.seconds = seconds
        let frame = NSRect(x: 0, y: 0, width: width, height: height)
        web = WKWebView(frame: frame)
        window = NSWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = web
        super.init()
        web.navigationDelegate = self
    }

    func start() {
        window.orderBack(nil)
        web.loadFileURL(input, allowingReadAccessTo: input.deletingLastPathComponent())
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let js = "var s=document.documentElement; s.pauseAnimations(); s.setCurrentTime(\(seconds)); 1"
        webView.evaluateJavaScript(js) { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.snapshot() }
        }
    }

    func snapshot() {
        let config = WKSnapshotConfiguration()
        config.rect = NSRect(x: 0, y: 0, width: width, height: height)
        config.snapshotWidth = NSNumber(value: width)
        web.takeSnapshot(with: config) { image, error in
            guard let image = image,
                  let tiff = image.tiffRepresentation,
                  let rep = NSBitmapImageRep(data: tiff),
                  let png = rep.representation(using: .png, properties: [:]) else {
                FileHandle.standardError.write(Data("snapshot failed: \(String(describing: error))\n".utf8))
                exit(1)
            }
            do {
                try png.write(to: self.output)
                print("wrote \(self.output.path) (\(rep.pixelsWide)x\(rep.pixelsHigh))")
                exit(0)
            } catch {
                FileHandle.standardError.write(Data("write failed: \(error)\n".utf8))
                exit(1)
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let renderer = Renderer(input: input, output: output, width: width, height: height, seconds: seconds)
renderer.start()
app.run()
