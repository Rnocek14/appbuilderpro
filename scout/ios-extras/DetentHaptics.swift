// DetentHaptics — OPTIONAL Core Haptics upgrade for Scout.
//
// v0 ships on @capacitor/haptics selectionChanged(), which drives UISelectionFeedbackGenerator —
// the exact engine behind the iOS picker wheel's detents. Start there. Reach for this plugin
// only if, after two weeks of real use, the fixed selection tick feels too soft or too uniform:
// CHHapticEngine transients expose intensity and sharpness per tick, which is what the drift's
// rev. 3 haptic TEXTURE uses: a photo is a crisp click (0.55 / 0.75), a reel a rounder thud
// (0.85 / 0.30), a carousel a double tap (0.60 / 0.60, count 2, gap 34ms) — one pattern per
// crossing, never a queued second call. Without this plugin the stock tick can only make reels
// feel different (impact LIGHT vs selectionChanged).
//
// Install (after `npx cap add ios`):
//   1. Open the app in Xcode (`npx cap open ios`).
//   2. Drag DetentHaptics.swift AND DetentHaptics.m into the App/App group
//      (check "Copy items if needed"; create the bridging header if Xcode offers).
//   3. Rebuild. From JS: const D = Capacitor.registerPlugin('DetentHaptics');
//      await D.tick({ intensity: 0.6, sharpness: 0.7, count: 2, gap: 34 });   // count/gap optional
//
// This file is provided untested-from-this-machine (authored on Linux; no Xcode here) — it
// follows the standard Capacitor in-app plugin shape and the boring parts of Core Haptics,
// but expect to pay a few minutes of compiler tax on first build.

import Foundation
import Capacitor
import CoreHaptics

@objc(DetentHapticsPlugin)
public class DetentHapticsPlugin: CAPPlugin {
    private var engine: CHHapticEngine?

    private func ensureEngine() -> CHHapticEngine? {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return nil }
        if let e = engine { return e }
        do {
            let e = try CHHapticEngine()
            e.isAutoShutdownEnabled = true
            e.resetHandler = { [weak self] in self?.engine = nil }
            try e.start()
            engine = e
            return e
        } catch {
            return nil
        }
    }

    /// One detent: `count` transients (1...3) `gap` ms apart, as a single pattern so a doubled
    /// tick is one call and never a queued second. intensity/sharpness in 0...1.
    @objc func tick(_ call: CAPPluginCall) {
        let intensity = Float(call.getDouble("intensity") ?? 0.55)
        let sharpness = Float(call.getDouble("sharpness") ?? 0.65)
        let count = max(1, min(3, call.getInt("count") ?? 1))
        let gap = max(0.0, min(0.12, (call.getDouble("gap") ?? 0) / 1000.0))
        guard let engine = ensureEngine() else { call.resolve(["played": false]); return }
        do {
            var events: [CHHapticEvent] = []
            for i in 0..<count {
                events.append(CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: i == 0 ? intensity : intensity * 0.85),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
                    ],
                    relativeTime: TimeInterval(i) * gap))
            }
            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
            call.resolve(["played": true])
        } catch {
            call.resolve(["played": false])
        }
    }
}
