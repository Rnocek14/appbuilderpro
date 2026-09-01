// DetentHaptics — OPTIONAL Core Haptics upgrade for Scout.
//
// v0 ships on @capacitor/haptics selectionChanged(), which drives UISelectionFeedbackGenerator —
// the exact engine behind the iOS picker wheel's detents. Start there. Reach for this plugin
// only if, after two weeks of real use, the fixed selection tick feels too soft or too uniform:
// CHHapticEngine transients expose intensity and sharpness per tick, which lets the drift give
// close-friend dots a rounder tap, ads a duller one, and fast conveyor streams a lighter one.
//
// Install (after `npx cap add ios`):
//   1. Open the app in Xcode (`npx cap open ios`).
//   2. Drag DetentHaptics.swift AND DetentHaptics.m into the App/App group
//      (check "Copy items if needed"; create the bridging header if Xcode offers).
//   3. Rebuild. From JS: const D = Capacitor.registerPlugin('DetentHaptics');
//      await D.tick({ intensity: 0.6, sharpness: 0.7 });
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

    /// One detent transient. intensity/sharpness in 0...1 (defaults tuned for the drift's tick).
    @objc func tick(_ call: CAPPluginCall) {
        let intensity = Float(call.getDouble("intensity") ?? 0.55)
        let sharpness = Float(call.getDouble("sharpness") ?? 0.65)
        guard let engine = ensureEngine() else { call.resolve(["played": false]); return }
        do {
            let event = CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
                ],
                relativeTime: 0)
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
            call.resolve(["played": true])
        } catch {
            call.resolve(["played": false])
        }
    }
}
