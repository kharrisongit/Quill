import AppKit
let destination = CommandLine.arguments[1]
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.19, green: 0.15, blue: 0.27, alpha: 1).setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
let book = NSBezierPath(roundedRect: NSRect(x: 210, y: 170, width: 604, height: 684), xRadius: 65, yRadius: 65)
NSColor(calibratedRed: 0.96, green: 0.94, blue: 0.86, alpha: 1).setFill(); book.fill()
NSColor(calibratedRed: 0.70, green: 0.60, blue: 0.79, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 280, y: 170, width: 15, height: 684)).fill()
NSColor(calibratedRed: 0.19, green: 0.15, blue: 0.27, alpha: 1).setStroke()
for y in [340, 420, 500] {
    let path = NSBezierPath(); path.move(to: NSPoint(x: 365, y: y)); path.line(to: NSPoint(x: 690, y: y)); path.lineWidth = 16; path.lineCapStyle = .round; path.stroke()
}
let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 205, weight: .medium), .foregroundColor: NSColor(calibratedRed: 0.19, green: 0.15, blue: 0.27, alpha: 1)]
("Q" as NSString).draw(at: NSPoint(x: 455, y: 550), withAttributes: attributes)
image.unlockFocus()
let data = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
try data.write(to: URL(fileURLWithPath: destination))
