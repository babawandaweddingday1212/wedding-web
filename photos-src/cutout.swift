// 用 macOS Vision 內建的人像分割做去背，輸出帶透明度的 PNG。
// 不需要下載任何模型，也不需要 Python 生態系。
import Foundation
import Vision
import CoreImage
import CoreVideo

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("用法: cutout.swift <輸入> <輸出> [cropXFrac cropWFrac]\n".data(using: .utf8)!)
    exit(64)
}

let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let source = CIImage(contentsOf: inURL) else {
    FileHandle.standardError.write("讀不到圖片\n".data(using: .utf8)!)
    exit(1)
}

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8

let handler = VNImageRequestHandler(ciImage: source, options: [:])
do {
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("分割失敗: \(error)\n".data(using: .utf8)!)
    exit(2)
}

guard let observation = request.results?.first else {
    FileHandle.standardError.write("沒有偵測到人像\n".data(using: .utf8)!)
    exit(3)
}

// 遮罩解析度通常小於原圖，先等比放大回原尺寸
var mask = CIImage(cvPixelBuffer: observation.pixelBuffer)
mask = mask.transformed(
    by: CGAffineTransform(
        scaleX: source.extent.width / mask.extent.width,
        y: source.extent.height / mask.extent.height
    )
)

// 以遮罩當 alpha，背景留空（透明）
guard let blend = CIFilter(name: "CIBlendWithMask") else { exit(4) }
blend.setValue(source, forKey: kCIInputImageKey)
blend.setValue(mask, forKey: kCIInputMaskImageKey)
guard var output = blend.outputImage else { exit(5) }

// 可選：依比例裁切。
//   args[3] args[4] = 水平起點 / 寬度比例（這張是兩個人並排，用來切左右）
//   args[5] args[6] = 垂直起點 / 高度比例，以「畫面上緣」為 0（用來切半身）
if args.count >= 5, let xFrac = Double(args[3]), let wFrac = Double(args[4]) {
    let full = source.extent

    // CIImage 原點在左下，但用「離上緣多少」來指定裁切比較直覺，這裡做換算
    var yOrigin = full.origin.y
    var cropH = full.height
    if args.count >= 7, let topFrac = Double(args[5]), let hFrac = Double(args[6]) {
        cropH = full.height * CGFloat(hFrac)
        yOrigin = full.origin.y + full.height * CGFloat(1.0 - topFrac - hFrac)
    }

    let rect = CGRect(
        x: full.origin.x + full.width * CGFloat(xFrac),
        y: yOrigin,
        width: full.width * CGFloat(wFrac),
        height: cropH
    )
    output = output.cropped(to: rect)
    // 把裁切後的座標原點移回 (0,0)，否則寫檔會帶著偏移
    output = output.transformed(by: CGAffineTransform(translationX: -rect.origin.x, y: -rect.origin.y))
}

let ctx = CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])

// 自動裁掉四周全透明的空白，之後在網頁上定位才不會被看不見的邊界干擾
if let cg = ctx.createCGImage(output, from: output.extent) {
    let w = cg.width, h = cg.height
    var pixels = [UInt8](repeating: 0, count: w * h * 4)
    if let bmp = CGContext(
        data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) {
        bmp.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        var minX = w, minY = h, maxX = -1, maxY = -1
        for y in 0..<h {
            for x in 0..<w {
                // alpha 門檻設 12，濾掉分割邊緣殘留的極淡雜點
                if pixels[(y * w + x) * 4 + 3] > 12 {
                    if x < minX { minX = x }
                    if x > maxX { maxX = x }
                    if y < minY { minY = y }
                    if y > maxY { maxY = y }
                }
            }
        }
        if maxX >= minX && maxY >= minY {
            // CGContext 是上下顛倒的座標系，換算回 CIImage 的原點在左下
            let rect = CGRect(
                x: CGFloat(minX), y: CGFloat(h - 1 - maxY),
                width: CGFloat(maxX - minX + 1), height: CGFloat(maxY - minY + 1)
            )
            output = output.cropped(to: rect)
                .transformed(by: CGAffineTransform(translationX: -rect.origin.x, y: -rect.origin.y))
        }
    }
}

do {
    try ctx.writePNGRepresentation(
        of: output,
        to: outURL,
        format: .RGBA8,
        colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    let w = Int(output.extent.width), h = Int(output.extent.height)
    print("✓ 已輸出 \(outURL.lastPathComponent)  \(w)x\(h)")
} catch {
    FileHandle.standardError.write("寫檔失敗: \(error)\n".data(using: .utf8)!)
    exit(6)
}
