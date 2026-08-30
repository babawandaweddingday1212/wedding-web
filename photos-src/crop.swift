// 依像素座標精確裁切圖片。
//
// 為什麼不用 sips：sips 的 --cropOffset 是以「中心」為基準，
// 而且負值會被當成參數旗標，沒辦法乾淨地取出左半 / 右半。
// CoreImage 的 cropped(to:) 直接吃像素矩形，語意明確。
//
// 用法: swift crop.swift <輸入> <輸出.jpg> <x> <y> <寬> <高>
//       座標以「左上角」為原點。

import Foundation
import CoreImage
import CoreGraphics

let args = CommandLine.arguments
guard args.count >= 7,
      let x = Double(args[3]), let y = Double(args[4]),
      let w = Double(args[5]), let h = Double(args[6]) else {
    FileHandle.standardError.write("用法: crop.swift <輸入> <輸出> <x> <y> <寬> <高>\n".data(using: .utf8)!)
    exit(64)
}

guard let src = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("讀不到圖片\n".data(using: .utf8)!)
    exit(1)
}

let full = src.extent
// CIImage 原點在左下，傳入的 y 以左上為原點，這裡換算
let rect = CGRect(x: full.origin.x + CGFloat(x),
                  y: full.origin.y + full.height - CGFloat(y) - CGFloat(h),
                  width: CGFloat(w), height: CGFloat(h))

let cropped = src.cropped(to: rect)
    .transformed(by: CGAffineTransform(translationX: -rect.origin.x, y: -rect.origin.y))

let ctx = CIContext()
guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { exit(2) }
do {
    try ctx.writeJPEGRepresentation(
        of: cropped,
        to: URL(fileURLWithPath: args[2]),
        colorSpace: colorSpace,
        options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.92]
    )
    print("\(Int(cropped.extent.width))x\(Int(cropped.extent.height)) → \(URL(fileURLWithPath: args[2]).lastPathComponent)")
} catch {
    FileHandle.standardError.write("寫檔失敗: \(error)\n".data(using: .utf8)!)
    exit(3)
}
