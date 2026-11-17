// Cut one person out of a photo for the hero (no metadata in the outputs).
//   portrait.png  : the person under the largest face, everyone else removed, RGBA, cropped to them
//   portrait.json : output size and the face box, normalised to the PNG (top-left origin)
// usage: swift cutout.swift <photo> <out dir> [bottom 0-1, default 1] [width px, default 640]
// Uses Apple's Vision person-instance mask, so it only runs on macOS 14 or later.
import Foundation
import CoreImage
import Vision
import ImageIO
import UniformTypeIdentifiers

let a = CommandLine.arguments
guard a.count >= 3 else { print("usage: swift cutout.swift <photo> <out dir> [bottom 0-1] [width px]"); exit(2) }
let inURL = URL(fileURLWithPath: a[1]), outDir = URL(fileURLWithPath: a[2])
let bottomFrac = a.count > 3 ? Double(a[3])! : 1.0
let outW = a.count > 4 ? Int(a[4])! : 640
let ci = CIContext()

// decode with the camera orientation applied; the image is redrawn, so no EXIF/GPS survives
guard let src = CGImageSourceCreateWithURL(inURL as CFURL, nil), let raw = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("cannot read \(inURL.path)") }
let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
let orient = CGImagePropertyOrientation(rawValue: props?[kCGImagePropertyOrientation] as? UInt32 ?? 1) ?? .up
let oriented = CIImage(cgImage: raw).oriented(orient)
let img = ci.createCGImage(oriented, from: oriented.extent)!
let W = img.width, H = img.height

let handler = VNImageRequestHandler(cgImage: img, options: [:])
let maskReq = VNGenerateForegroundInstanceMaskRequest()
let faceReq = VNDetectFaceRectanglesRequest()
try handler.perform([maskReq, faceReq])
let faces = faceReq.results ?? []
guard let face = faces.max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) else { fatalError("no face found") }
guard let obs = maskReq.results?.first else { fatalError("no person found") }

// the instance under the face
let probe = CGPoint(x: face.boundingBox.midX, y: 1 - face.boundingBox.midY)
let inst = obs.instanceMask
CVPixelBufferLockBaseAddress(inst, .readOnly)
let iw = CVPixelBufferGetWidth(inst), ih = CVPixelBufferGetHeight(inst), ibpr = CVPixelBufferGetBytesPerRow(inst)
let ibase = CVPixelBufferGetBaseAddress(inst)!.assumingMemoryBound(to: UInt8.self)
var counts = [Int: Int]()
let px0 = Int(probe.x * Double(iw)), py0 = Int(probe.y * Double(ih))
for y in max(0, py0 - 8)..<min(ih, py0 + 8) { for x in max(0, px0 - 8)..<min(iw, px0 + 8) { let l = Int(ibase[y * ibpr + x]); if l > 0 { counts[l, default: 0] += 1 } } }
CVPixelBufferUnlockBaseAddress(inst, .readOnly)
guard let label = counts.max(by: { $0.value < $1.value })?.key else { fatalError("no person under the face") }
print("faces:", faces.count, "instances:", obs.allInstances.count, "picked:", label)

let mbuf = try obs.generateScaledMaskForImage(forInstances: IndexSet(integer: label), from: handler)
CVPixelBufferLockBaseAddress(mbuf, .readOnly)
let mw = CVPixelBufferGetWidth(mbuf), mh = CVPixelBufferGetHeight(mbuf), mbpr = CVPixelBufferGetBytesPerRow(mbuf)
precondition(mw == W && mh == H, "mask \(mw)x\(mh) vs image \(W)x\(H)")
let mbase = CVPixelBufferGetBaseAddress(mbuf)!
var mask = [Float](repeating: 0, count: W * H)
for y in 0..<H { let row = (mbase + y * mbpr).assumingMemoryBound(to: Float32.self); for x in 0..<W { mask[y * W + x] = row[x] } }
CVPixelBufferUnlockBaseAddress(mbuf, .readOnly)

// crop: the person's bounding box down to `bottom`, with a little room around it
let yMax = Int(Double(H) * bottomFrac)
var x0 = W, x1 = 0, y0 = H, y1 = 0
for y in 0..<yMax { for x in stride(from: 0, to: W, by: 2) where mask[y * W + x] > 0.5 { x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y) } }
let pad = Double(x1 - x0) * 0.03
let rx0 = max(0, Double(x0) - pad), ry0 = max(0, Double(y0) - pad)
let rect = CGRect(x: rx0, y: ry0, width: min(Double(W), Double(x1) + pad) - rx0, height: Double(y1 + 1) - ry0)
let outH = Int((Double(outW) * rect.height / rect.width).rounded())

var rgba = [UInt8](repeating: 0, count: outW * outH * 4)
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
rgba.withUnsafeMutableBytes { buf in
  let c = CGContext(data: buf.baseAddress, width: outW, height: outH, bitsPerComponent: 8, bytesPerRow: outW * 4, space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  c.interpolationQuality = .high
  let sx = Double(outW) / rect.width, sy = Double(outH) / rect.height
  c.draw(img, in: CGRect(x: -rect.minX * sx, y: -(Double(H) - rect.maxY) * sy, width: Double(W) * sx, height: Double(H) * sy))
}
// alpha = mask, averaged over the source pixels behind each output pixel
let fx = rect.width / Double(outW), fy = rect.height / Double(outH)
for y in 0..<outH {
  for x in 0..<outW {
    var s: Float = 0, n: Float = 0
    let sx0 = Int(rect.minX + Double(x) * fx), sy0 = Int(rect.minY + Double(y) * fy)
    for yy in sy0..<min(H, max(sy0 + 1, Int(rect.minY + Double(y + 1) * fy))) {
      for xx in sx0..<min(W, max(sx0 + 1, Int(rect.minX + Double(x + 1) * fx))) { s += mask[yy * W + xx]; n += 1 }
    }
    let m = Double(n > 0 ? s / n : 0)
    let al = m < 0.3 ? 0.0 : (m > 0.7 ? 1.0 : (m - 0.3) / 0.4)
    let i = (y * outW + x) * 4
    for k in 0..<3 { rgba[i + k] = UInt8(Double(rgba[i + k]) * al) }
    rgba[i + 3] = UInt8(al * 255)
  }
}
let provider = CGDataProvider(data: Data(rgba) as CFData)!
let out = CGImage(width: outW, height: outH, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: outW * 4, space: cs,
                  bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)!
let pngURL = outDir.appendingPathComponent("portrait.png")
let dest = CGImageDestinationCreateWithURL(pngURL as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, out, nil)
precondition(CGImageDestinationFinalize(dest))

// face box in the PNG's normalised coordinates
let fb = face.boundingBox
let r3 = { (v: Double) in (v * 1000).rounded() / 1000 }
let faceBox = [
  r3((fb.minX * Double(W) - rect.minX) / rect.width), r3(((1 - fb.maxY) * Double(H) - rect.minY) / rect.height),
  r3(fb.width * Double(W) / rect.width), r3(fb.height * Double(H) / rect.height),
]
let meta: [String: Any] = ["size": [outW, outH], "face": faceBox]
let json = try JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted, .sortedKeys])
try json.write(to: outDir.appendingPathComponent("portrait.json"))
print("wrote", pngURL.path, "\(outW)x\(outH)", "face", faceBox)
